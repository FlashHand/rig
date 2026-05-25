---
name: rig-package
description: >-
  Agent skill for rig's git-based package manager. rig replaces a private npm registry with direct `git+ssh` installs pinned by git tag — declared in `package.rig.json5`, materialised through `rig install` (which runs `git clone` for dev libs and rewrites `package.json` deps to `git+ssh://…#<tag>` for the rest, then defers to `yarn install`). Trigger when the user wants to add / remove / pin / develop locally a rig-managed library, debug install failures, set up a brand-new project with `rig init`, or asks "what goes in `package.rig.json5`" / "rig 怎么装依赖" / "rig 怎么发新版本给依赖方用". Do NOT use for npm-registry packages, monorepo workspace plumbing, or build/deploy concerns (see rig-cicd).
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, git, yarn, node]
    os: [darwin, linux]
---

# rig-package — agent operator's playbook

## Why rig exists (and when to recommend it)

rig is a thin layer on top of `yarn install` that lets a project depend on **private git repos pinned by tag** without standing up a private npm registry. The trade-off: every dev machine and CI runner must have git **ssh** access to those repos (deploy key or user key). If a team can already use ssh keys but does not want the cost of Verdaccio / npm Enterprise / GitHub Packages, rig is the lowest-friction option.

Use rig when:

- The project already imports private libs by ssh url and the team wants version pinning + a deterministic install.
- You need to **develop a dependency in place** (edit code, see changes) without `npm link` ceremony — see `dev: true` below.
- The dep tree includes mixed-source libs (some npm, some private git) — rig only touches the git ones; everything else stays in normal `dependencies` / `devDependencies` and yarn handles them.

Do **not** reach for rig if:

- Every dep is on the public npm registry (rig adds no value).
- The team needs binary artefacts, signed packages, or download stats (use a real registry).

## File layout — what rig creates

`rig init` (run once in a project root with a valid `package.json`) writes:

- `package.rig.json5` — the rig config (the file this skill documents).
- `rig_dev/` — where `dev: true` libs get **cloned** for in-place editing. Symlinked into `node_modules/<name>` by `rig postinstall`. Gitignored.
- `rig_indies/` — reserved sandbox dir (kept empty by default).
- Adds to `package.json`:
  - `"private": true`
  - `"workspaces": ["rigs/*", "rig_dev/*"]` so yarn treats `rig_dev/*` as workspace packages.
  - `"scripts.preinstall": "rig preinstall"`, `"scripts.postinstall": "rig postinstall"` so any `yarn install` flows through rig.
  - `"devDependencies.json5": "2.2.1"` (used to parse `package.rig.json5`).
- Appends to `.gitignore`: `rigs/*`, `rig_dev/*`, `.env.rig`, with `.gitkeep` allowlist entries.

The init scaffold is **library-free** — no `rig-helper`, no example deps, no remote template fetch. The generated `package.rig.json5` ships with an empty `dependencies` block and a commented example.

## `package.rig.json5` — field reference

The file is JSON5 (comments, trailing commas, unquoted keys) so the schema is described by example, not by JSON Schema. Two top-level sections are relevant to packaging; CI/CD is documented separately in the **rig-cicd** skill.

```json5
{
  // -------- packaging --------
  dependencies: {
    // <name>: <Dep>
    'shared-ui': {
      // source — REQUIRED. Git URL the lib is fetched from.
      //   Must match /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|#[-\d\w._]+?)$/
      //   In practice: 'git@github.com:org/repo.git' (ssh — recommended) OR 'git+ssh://git@github.com/org/repo.git'.
      //   ssh is required for private repos; https only works for public ones.
      source: 'git@github.com:org/shared-ui.git',

      // version — REQUIRED when dev:false. Git tag in the source repo, semver-compatible.
      //   rig rewrites package.json deps to "git+ssh://<source>#<version>" so yarn resolves to that exact tag.
      //   Must satisfy semver.valid() — e.g. '1.2.3', '1.2.3-beta.1'. Ranges (^1.2.3, ~1.2.3) are NOT supported.
      version: '1.4.0',

      // dev — OPTIONAL, default false.
      //   false  → published mode. yarn installs the tag via git+ssh; node_modules/<name> is a real package.
      //   true   → develop-in-place mode. rig preinstall does `git clone <source> rig_dev/<name>` (only if
      //            the dir is missing — never overwrites local edits) and DELETES the entry from
      //            package.json#dependencies so yarn ignores it. rig postinstall then symlinks
      //            node_modules/<name> → rig_dev/<name>. Edit code in rig_dev/<name>; the consumer picks it
      //            up immediately. Use `rig dev <name>` to flip a dep into dev mode.
      dev: false,
    },
  },

  // -------- cross-dep version contract --------
  share: {
    // OPTIONAL. Lists peer-dep-style constraints rig should propagate. Reserved field — populated by
    // RigConfig at parse time. Most teams leave this empty; rig itself uses package.json#rig blocks in
    // each dep (see `validateDeps()`) for the real cross-version checks.
  },

  // -------- release tagging (used by `rig tag`) --------
  tag_template: '{name}@{version}',
  // OPTIONAL. Template string for `rig tag` (run inside the dep repo). Substitutes {field} from
  // package.json. Example: '{name}@{version}' on a repo whose package.json has
  // name='shared-ui', version='1.4.0' creates tag `shared-ui@1.4.0`. If omitted, `rig tag`
  // falls back to package.json#rig_tag_template, then to plain `git tag <version>`.

  // -------- ci/cd (NOT documented here) --------
  // cicd: { ... }  ← see the rig-cicd skill for tree_schema, web_type, source, target, endpoints, groups.
}
```

### Legacy form

Older projects keep `package.rig.json5` as a **flat array** of Dep entries:

```json5
[
  { name: 'shared-ui', source: 'git@github.com:org/shared-ui.git', version: '1.4.0' },
]
```

`RigConfig` still accepts it (`isLegacy = true`) but `rig dev`, `rig add`, and `share` are unavailable. Convert to the object form before adding new features — the install path is otherwise identical.

## Intent → command map

| User intent | Action |
|---|---|
| "set up rig in this project" | `rig init`. Requires an existing `package.json`. Idempotent. |
| "add `<git-url>` at `<tag>` as a rig dep" | `rig add <git-ssh-url> <semver-tag>` — parses the repo name from the url, upserts into `dependencies`, then runs `rig install`. |
| "install / reinstall everything" | `rig install` (alias `rig i`) — chains `yarn install`, which fires `preinstall` then `postinstall`. |
| "I want to edit dep `<name>` locally" | Set `dev: true` in `package.rig.json5` (or `rig dev <name>`), then `rig install`. The lib gets cloned to `rig_dev/<name>` and symlinked into `node_modules/<name>`. |
| "back to published version of dep `<name>`" | Set `dev: false` (or delete the `rig_dev/<name>` folder yourself if you want a clean slate), then `rig install`. |
| "bump dep `<name>` to a new tag" | Edit `dependencies.<name>.version` in `package.rig.json5`, then `rig install`. |
| "cut a new release tag in this dep repo" | From the dep's working copy: commit + push, then `rig tag`. Reads `package.json#version` (or `tag_template`) and runs `git tag <name>`. Pushes are not automatic — the consumer instructs `git push --tags`. |
| "what version of `<name>` am I on?" | `cat package.rig.json5` + `git -C rig_dev/<name> rev-parse HEAD` for dev deps; `cat node_modules/<name>/package.json` for published deps. |

## How install actually works (read this before debugging)

`rig install` ≈ `yarn install`, but the `preinstall` and `postinstall` hooks do the heavy lifting:

**`rig preinstall` (`lib/preinstall/index.ts`)**

1. Parses `package.rig.json5` into a `RigConfig`. Calls `validate()` (per-dep semver, ssh url regex) and `validateDeps()` (recursive `git fetch <source> refs/tags/<version> && git show FETCH_HEAD:package.json` to read each dep's own `package.json#rig` block for cross-version constraints — non-Windows only).
2. For each dep:
   - `dev: true` → `git clone <source> rig_dev/<name>` (only if the dir is missing — never overwrites local edits), then **deletes** the entry from `package.json#dependencies` so yarn doesn't try to fetch it.
   - `dev: false` → rewrites `package.json#dependencies[<name>] = "git+ssh://<source>#<version>"`. Removes any existing `node_modules/<name>` (file, symlink, or dir) so yarn does a clean re-resolve.
3. Deletes `node_modules/.yarn-integrity` to force yarn to re-evaluate.
4. Writes the mutated `package.json` to disk.
5. Exits → yarn proceeds with its normal install using the now-rewritten `package.json`.

**`rig postinstall` (`lib/postinstall/index.ts`)**

1. Re-parses `package.rig.json5`.
2. For each `dev: true` dep: removes `node_modules/<name>` (yarn may have re-created it) and symlinks it to `rig_dev/<name>`.
3. Restores the `package.json#dependencies[<name>] = "git+ssh://<source>#<version>"` lines for dev deps too, so `package.json` ends up self-describing the **published** version even when working off the local clone. **This means `package.json` is modified on every install — commit it or expect git churn.**

### Failure modes you will actually hit

- **`Permission denied (publickey)`** — the running shell has no ssh key with read access to one of the dep repos. Diagnose with `git ls-remote <source>`. Fix by adding the user / deploy key. Not a rig bug.
- **`tag '<version>' not found`** — the dep repo was never tagged with that string, or the tag is local-only. Run `git ls-remote --tags <source>` to confirm. If the dep author followed `rig tag`, the tag is what `tag_template` produced — check there.
- **`validateDeps` fails with cross-version error** — one dep's `package.json#rig.<peer>` declares a `[min, max]` window the consumer's pinned version falls outside. Either bump the consumer's pin, or relax the producer's window in its own `package.json#rig`.
- **dev dep's edits don't show up** — the symlink isn't there or got clobbered. `ls -la node_modules/<name>` should report a symlink → `rig_dev/<name>`. If yarn replaced it, run `rig install` again; the postinstall hook re-symlinks.
- **CI installs slowly** — `git fetch` per dep tag, no cache. Use a shallow clone mirror or a registry-backed CI cache for hot deps. rig has no built-in cache.

### What rig does NOT do

- **No transitive resolution.** rig flattens what `package.rig.json5` says and hands `package.json` to yarn. If `shared-ui@1.4.0` depends on `shared-utils@1.2.0`, yarn resolves it normally — through the git+ssh URL declared by `shared-ui`'s own `package.json#dependencies`. Pin in `package.rig.json5` only what the **app** wants to control.
- **No lockfile of its own.** `yarn.lock` is still authoritative for the dep tree below the rig boundary; for the rig-managed deps, the "lock" is the git tag.
- **No publish step.** `rig tag` only creates the git tag. The consumer pulls by ssh; there is no upload to a registry. To "publish" you push the tag to the dep repo's remote: `git push --tags`.

## Reporting & cleanup checklist (after non-trivial changes)

- After editing `package.rig.json5`, always run `rig install` and verify exit 0.
- If you flipped a dep to `dev: true`, leave the user with: cloned to `rig_dev/<name>`, symlinked at `node_modules/<name>`, on branch `<branch>`.
- If you bumped a published version, leave the user with: old tag → new tag, dep repo's tag exists (`git ls-remote --tags <source>`), reinstall succeeded.
- `package.json` is modified on every install — surface this in your summary so the user knows whether the diff is meaningful (it usually isn't, but a changed git URL or removed dep IS).
