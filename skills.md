# rig Skills

This page contains contributor and implementation details for Skills in the
`rigjs` package. The root `README.md` presents the complete user-facing Skill
catalog and copyable install routes; lower-level installation and maintenance
behavior lives here.

## Bundled Skills

| Skill | Canonical file | Plugin copy | CLI area | Purpose |
|---|---|---|---|---|
| `rig` | [`skills/rig/SKILL.md`](./skills/rig/SKILL.md) | (standalone cross-agent skill) | all Rig command families | Routes an agent to the appropriate Rig workflow and safety boundary. |
| `rig-wiki` | [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md) | [`.claude/skills/rig-wiki/SKILL.md`](./.claude/skills/rig-wiki/SKILL.md) | `rig wiki *` | Karpathy-style LLM wiki operations: scan, fetch, ingest, query, lint, rebuild. |
| `rig-crew` | [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md) | (none — vault-level guidance) | `rig crew *` | File-backed, Leader-first multi-agent coordination over an Obsidian vault. |
| `rig-package` | [`RIG_PACKAGE_SKILL.md`](./RIG_PACKAGE_SKILL.md) | [`.claude/skills/rig-package/SKILL.md`](./.claude/skills/rig-package/SKILL.md) | `rig init` / `install` / `add` / `dev` / `tag` | Git-tag + ssh package manager that replaces a private npm registry; documents every `package.rig.json5#dependencies` field. |
| `rig-cicd` | [`RIG_CICD_SKILL.md`](./RIG_CICD_SKILL.md) | [`.claude/skills/rig-cicd/SKILL.md`](./.claude/skills/rig-cicd/SKILL.md) | `rig build` / `deploy` / `publish` | Aliyun OSS + CDN static-site CI/CD; one bucket → many sites via CDN URI rewrites set during `rig publish`. Supports hash, history, mpa, pre-built HTML dirs. |
| `handoff` | [`skills/handoff/SKILL.md`](./skills/handoff/SKILL.md) | (standalone personal skill) | `/handoff` (`$handoff` compatible in Codex) | Shared sender Skill: copies the current agent's JSONL pointer before a model request. |
| `rig-from-claude` | [`skills/rig-from-claude/SKILL.md`](./skills/rig-from-claude/SKILL.md) | (standalone Codex personal skill) | `rig handoff intake` | Recovers newest dialogue/tool evidence first, then reconciles it with current workspace state. |
| `rig-from-codex` | [`skills/rig-from-codex/SKILL.md`](./skills/rig-from-codex/SKILL.md) | (standalone Claude personal skill) | `rig handoff from-codex intake` | Recovers privacy-filtered Codex dialogue, tool, edit, and unfinished-turn evidence newest-first. |

`rig-crew` is intentionally not copied into the rigjs package's own `.claude/skills/`. Its instructions belong at the Vault level (the project that uses crew), not at the tool level (rigjs itself).

The handoff surface is one shared sender Skill plus two format-specific receiver
adapters, installed across four agent locations only by `rig handoff install`.
They are excluded from npm `postinstall` because the feature owns Claude and
Codex lifecycle hooks and must be explicitly enabled.

### Bidirectional Claude ↔ Codex handoff

```bash
rig handoff install
rig handoff doctor
```

The installer creates:

- `~/.claude/skills/handoff` → `<rigjs-install>/skills/handoff`
- `~/.codex/skills/handoff` → `<rigjs-install>/skills/handoff`
- `~/.codex/skills/rig-from-claude` → `<rigjs-install>/skills/rig-from-claude`
- `~/.claude/skills/rig-from-codex` → `<rigjs-install>/skills/rig-from-codex`
- `~/.rig/bin/rig-handoff`, a small executable wrapper pinned to the absolute Node binary and `<rigjs-install>/bin/rig.js`, so GUI-launched hooks do not depend on shell `PATH`.

It also atomically merges exact, removable entries into `~/.claude/settings.json`:

- `skillOverrides.handoff = "user-invocable-only"`, with the prior value kept
  in a private 0600 Rig state file for uninstall restoration. This mirrors the
  Codex Skill's non-implicit policy without adding Claude-only frontmatter to
  the shared canonical Skill.
- `UserPromptExpansion` for the bare `/handoff` command. The hook copies `transcript_path`, `cwd`, and `session_id`, then blocks expansion before a model request.
- `StopFailure` for quota, billing, output-limit, and authentication failures. Its side effect copies the same handoff and sends a macOS notification.

It separately merges a Rig-owned `UserPromptSubmit` handler into
`~/.codex/hooks.json`, preserving unrelated handlers such as session managers.
Codex ignores a matcher for this event, so Rig uses it only as an ownership
marker and checks for the exact `/handoff` prompt inside the handler. The
backward-compatible `$handoff` Skill prompt is also accepted. Only those
explicit triggers update the 0600 pointer
`~/.rig/handoff/codex-latest.json`, copies a Claude-ready handoff, and stops
before the model call. This prevents ordinary subagent prompts from replacing
the root task's pointer. Users must review and trust this non-managed hook once
through Codex `/hooks`.

The installer backs up an existing settings file under `~/.rig/backups/handoff/`, preserves unrelated hooks and a dotfiles-managed `settings.json` symlink, and is idempotent. Remove only Rig-owned entries with `rig handoff uninstall`. If the Claude UI is unavailable, `rig handoff copy --latest` performs the same clipboard handoff directly from a terminal.

The Codex skill bundles `scripts/intake.mjs`. It invokes `rig handoff intake`
without shell interpolation and pages meaningful entries newest-to-oldest.
Private thinking, usage telemetry, and metadata-only JSONL rows are omitted from
the model-facing view. A legacy `~/.codex/skills/from-claude` symlink is removed
on install only when it points to Rig's old bundled skill source.

`$rig-from-claude` is a continuation skill rather than a transcript summarizer.
It recognizes pasted `transcript_path`, `cwd`, `session_id`, and optional
`claude_stop_error` fields; recovers the task objective, constraints, decisions,
edits, tool results, failures, and stopping point; then reconciles that evidence
with the live Git working tree and continues the unfinished work. If a page is
insufficient, it follows `nextBeforeLine` toward older evidence instead of
loading the whole private transcript into context.

The reverse `rig-from-codex` Skill bundles its own `scripts/intake.mjs` and
invokes `rig handoff from-codex intake`. Codex rollout JSONL is not the same
schema as Claude JSONL, so its adapter is a separate whitelist parser. It pairs
tool calls/results by `call_id`, preserves user/assistant dialogue, goals and
edited-file paths, waits up to two seconds for the first JSONL flush, and
explicitly omits private reasoning, encrypted content, runtime developer
messages, world state, and token/rate-limit telemetry.

Codex does not expose a quota-failure equivalent to Claude `StopFailure`.
`/handoff` itself still executes locally before a model request. If the Codex
UI is unavailable, run `rig handoff from-codex copy --latest --cwd "$PWD"`;
it validates any explicit pointer against the newest root rollouts without a
model call. `rig handoff uninstall` removes only the four owned links, the two
owned hook families, the pointer, and the stable launcher.

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

The older command-family canonical Skills live at the package root:

- [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md)
- [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md)
- [`RIG_PACKAGE_SKILL.md`](./RIG_PACKAGE_SKILL.md)
- [`RIG_CICD_SKILL.md`](./RIG_CICD_SKILL.md)

Cross-agent setup and handoff canonical Skills use standard Skill directories:

- [`skills/rig/SKILL.md`](./skills/rig/SKILL.md)
- [`skills/handoff/SKILL.md`](./skills/handoff/SKILL.md)
- [`skills/rig-from-claude/SKILL.md`](./skills/rig-from-claude/SKILL.md)
- [`skills/rig-from-codex/SKILL.md`](./skills/rig-from-codex/SKILL.md)

A package-internal mirror lives under `.claude/skills/` so the rig package itself (when checked out by another agent) can read its own skills:

```bash
node scripts/sync-skill.mjs
```

`prepublishOnly` runs the sync script before packaging. The plugin-copy set covers `rig-wiki`, `rig-package`, and `rig-cicd`; `rig-crew` remains Vault-level guidance and has no in-package `.claude/skills/` copy.

## Documentation Policy

- Complete user-facing Skill catalog and copyable install routes in `README.md`.
- All skill references, install variants, and maintenance notes in this file.
- Every canonical `SKILL.md` or `RIG_*_SKILL.md` stays self-contained — a user opening it should be able to read exactly what they're enabling, without needing this index.
