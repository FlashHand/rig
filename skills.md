# rig Skills

This page is the skill index for the `rigjs` package. The root `README.md` keeps a one-line pointer here; everything skill-related — what ships, how to install, how to maintain — lives in this file.

## Bundled Skills

| Skill | Canonical file | Plugin copy | CLI area | Purpose |
|---|---|---|---|---|
| `rig-wiki` | [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md) | [`.claude/skills/rig-wiki/SKILL.md`](./.claude/skills/rig-wiki/SKILL.md) | `rig wiki *` | Karpathy-style LLM wiki operations: scan, fetch, ingest, query, lint, rebuild. |
| `rig-crew` | [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md) | (none — vault-level guidance) | `rig crew *` | File-backed, Leader-first multi-agent coordination over an Obsidian vault. |
| `rig-package` | [`RIG_PACKAGE_SKILL.md`](./RIG_PACKAGE_SKILL.md) | [`.claude/skills/rig-package/SKILL.md`](./.claude/skills/rig-package/SKILL.md) | `rig init` / `install` / `add` / `dev` / `tag` | Git-tag + ssh package manager that replaces a private npm registry; documents every `package.rig.json5#dependencies` field. |
| `rig-cicd` | [`RIG_CICD_SKILL.md`](./RIG_CICD_SKILL.md) | [`.claude/skills/rig-cicd/SKILL.md`](./.claude/skills/rig-cicd/SKILL.md) | `rig build` / `deploy` / `publish` | Aliyun OSS + CDN static-site CI/CD; one bucket → many sites via CDN URI rewrites set during `rig publish`. Supports hash, history, mpa, pre-built HTML dirs. |
| `handoff` | [`skills/handoff/SKILL.md`](./skills/handoff/SKILL.md) | (standalone personal skill) | `rig handoff install` / `copy` | User-invoked Claude slash command intercepted locally before any model request. |
| `from-claude` | [`skills/from-claude/SKILL.md`](./skills/from-claude/SKILL.md) | (Codex personal skill) | `rig handoff inspect` / `read` | Recovers a Claude JSONL transcript in bounded pages and reconciles it with current workspace state. |

`rig-crew` is intentionally not copied into the rigjs package's own `.claude/skills/`. Its instructions belong at the Vault level (the project that uses crew), not at the tool level (rigjs itself).

`handoff` and `from-claude` are installed together only by `rig handoff install`. They are excluded from npm `postinstall` because the feature also owns Claude lifecycle hooks and must be explicitly enabled.

### Claude → Codex handoff

```bash
rig handoff install
rig handoff doctor
```

The installer creates:

- `~/.claude/skills/handoff` → `<rigjs-install>/skills/handoff`
- `~/.codex/skills/from-claude` → `<rigjs-install>/skills/from-claude`
- `~/.rig/bin/rig-handoff`, a small executable wrapper pinned to the absolute Node binary and `<rigjs-install>/bin/rig.js`, so GUI-launched hooks do not depend on shell `PATH`.

It also atomically merges exact, removable entries into `~/.claude/settings.json`:

- `UserPromptExpansion` for the bare `/handoff` command. The hook copies `transcript_path`, `cwd`, and `session_id`, then blocks expansion before a model request.
- `StopFailure` for quota, billing, output-limit, and authentication failures. Its side effect copies the same handoff and sends a macOS notification.

The installer backs up an existing settings file under `~/.rig/backups/handoff/`, preserves unrelated hooks and a dotfiles-managed `settings.json` symlink, and is idempotent. Remove only Rig-owned entries with `rig handoff uninstall`. If the Claude UI is unavailable, `rig handoff copy --latest` performs the same clipboard handoff directly from a terminal.

## Install

### Global install — default (per-machine, auto-updates with rigjs)

```bash
yarn global add rigjs
```

The `postinstall` hook **symlinks** the bundled skills into Claude Code's user-level skill directory:

- `~/.claude/skills/rig-wiki/SKILL.md` → `<rigjs-install>/RIG_WIKI_SKILL.md`
- `~/.claude/skills/rig-crew/SKILL.md` → `<rigjs-install>/RIG_CREW_SKILL.md`

Symlink is the right call here because `~/.claude/skills/` is not committed to any repo — the link merely follows whichever rigjs version you have installed locally. `yarn global add rigjs` next month and the skill description updates the next Claude Code restart.

If `--ignore-scripts` was used, do it manually:

```bash
rig wiki install-skill          # idempotent; safe to re-run
rig wiki install-skill --force  # overwrite an existing entry pointing elsewhere
```

### Project-level install — for committed, reproducible setups

For a project (any rigjs consumer — your repo doesn't need to live inside `rig` or be a monorepo) that wants its own pinned skill files committed to git so any clone of the project gets the same agent behaviour:

```bash
cd <project>
rig wiki install-skill --project
```

This **writes real file copies** at:

- `<project>/.claude/skills/rig-wiki/SKILL.md`   (Claude Code)
- `<project>/.claude/skills/rig-crew/SKILL.md`
- `<project>/.agents/skills/rig-wiki/SKILL.md`   (Codex)
- `<project>/.agents/skills/rig-crew/SKILL.md`

Both Claude Code (`.claude/skills/`) and Codex (`.agents/skills/`) read from these project-local dirs when invoked inside the project, and **project-local skills override the global ones**. A single `--project` install covers both agents.

**Files, not symlinks.** A symlink pointing at `<rigjs-install>/RIG_WIKI_SKILL.md` would be machine-specific — it might be `/usr/local/lib/node_modules/rigjs/...` on macOS, `/opt/homebrew/lib/node_modules/rigjs/...` on Apple Silicon, somewhere under `~/.yarn/...` on a yarn-prefix setup, or simply missing on CI. Committing such a symlink to git would break the repo for anyone else. Real-file copies remove that variable: the skill the agent sees comes from the repo, not from a system path.

To refresh project-local copies after a rigjs upgrade:

```bash
rig wiki install-skill --project --force
```

To remove:

```bash
rig wiki uninstall-skill --project
```

### Why project-level over global

- Pins the skill description to the rigjs version that exists at install time. The agent reads from your repo, not from whatever rigjs is current.
- Survives across machines, CI, and collaborator laptops — the skill is committed, not synthesized.
- Lets a single repo override the user-global skill for that project (useful when one repo's `rig wiki` workflow differs from the user's default).

### Special case — rig in a sibling submodule

If your project hosts rigjs as a git submodule (rig's own development workflow with the `overmind` vault is the canonical example), you can choose to **symlink** the project skill files at the dev source instead of copying. This is a deliberate opt-out, not the default:

```bash
# from <project>/, with rigjs cloned as a submodule under projects/rig
ln -sf ../../../projects/rig/RIG_WIKI_SKILL.md .claude/skills/rig-wiki/SKILL.md
ln -sf ../../../projects/rig/RIG_CREW_SKILL.md .claude/skills/rig-crew/SKILL.md
```

This makes edits in the submodule's `RIG_*_SKILL.md` immediately visible to the agent without a publish-and-reinstall cycle. **Don't use this pattern in projects where rigjs is not in-tree** — the symlink target won't exist and the skill won't load.

## Maintenance (rig contributors)

Canonical skill files live at the package root:

- [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md)
- [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md)
- [`RIG_PACKAGE_SKILL.md`](./RIG_PACKAGE_SKILL.md)
- [`RIG_CICD_SKILL.md`](./RIG_CICD_SKILL.md)

A package-internal mirror lives under `.claude/skills/` so the rig package itself (when checked out by another agent) can read its own skills:

```bash
node scripts/sync-skill.mjs
```

`prepublishOnly` runs the sync script before packaging. The plugin-copy set covers `rig-wiki`, `rig-package`, and `rig-cicd`; `rig-crew` remains Vault-level guidance and has no in-package `.claude/skills/` copy.

## Documentation Policy

- One-line skill visibility + high-level links in `README.md`.
- All skill references, install variants, and maintenance notes in this file.
- Each canonical `RIG_*_SKILL.md` stays self-contained — a user opening it should be able to read exactly what they're enabling, without needing this index.
