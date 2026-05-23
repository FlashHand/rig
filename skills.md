# rig Skills

This page is the skill index for the `rigjs` package.

Keep the root `README.md` short: it should link here and to the canonical skill files, while this page explains how the bundled skills relate to the CLI.

## Bundled Skills

| Skill | Canonical file | Plugin copy | CLI area | Purpose |
|---|---|---|---|---|
| `rig-wiki` | [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md) | [`.claude/skills/rig-wiki/SKILL.md`](./.claude/skills/rig-wiki/SKILL.md) | `rig wiki *` | Karpathy-style LLM wiki operations: scan, fetch, ingest, query, lint, and rebuild. |
| `rig-crew` | [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md) | None; use the Vault/overmind skill copy | `rig crew *` | File-backed, Leader-first multi-agent coordination over an Obsidian vault. |

`rig-crew` is intentionally not copied into `projects/rig/.claude/skills/`. In the overmind workflow, `rig` is just one project inside the Vault. The active crew instructions come from the Vault root `CLAUDE.md` / `AGENTS.md` managed block plus the overmind/user-level skill installation, so a project-local Claude skill copy would be misleading.

## Install

### Global install (default — affects every project on the machine)

```bash
yarn global add rigjs
```

The `postinstall` script links bundled skills into `~/.claude/skills/` (Claude Code's user-level skill directory). If you prefer to skip the postinstall:

```bash
yarn global add rigjs --ignore-scripts
rig wiki install-skill
```

### Project-level install (per-project override, Claude Code + Codex)

For "monorepo of work projects" setups — e.g. overmind — you can install the skills **into the project itself** so they live alongside the code and override the global ones whenever the user is inside that project:

```bash
cd <project>
rig wiki install-skill --project
```

This creates symlinks at:

- `<project>/.claude/skills/rig-wiki/SKILL.md` → `<rigjs-install>/RIG_WIKI_SKILL.md`
- `<project>/.claude/skills/rig-crew/SKILL.md` → `<rigjs-install>/RIG_CREW_SKILL.md`
- `<project>/.agents/skills/rig-wiki/SKILL.md` → (same target, for Codex)
- `<project>/.agents/skills/rig-crew/SKILL.md` → (same target, for Codex)

Both Claude Code (`.claude/skills/`) and Codex (`.agents/skills/`) read from project-local skill dirs when invoked inside the project, so a single `--project` install covers both agents.

Project-local skills take precedence over `~/.claude/skills/` while the user is in that project. To remove:

```bash
cd <project>
rig wiki uninstall-skill --project
```

### Why project-level over global

- Pins the skill version to the rigjs install in `node_modules` (or wherever the global rig lives), so the skill the agent sees matches the CLI it's about to call.
- Lets the project decide which agent gets which skill — committing `.claude/skills/rig-wiki/` to the repo makes the agent behaviour reproducible across machines.
- Works in CI / sandboxes where there's no home-dir `~/.claude/skills/` to install into.

## Maintenance

Canonical files live at the package root:

- [`RIG_WIKI_SKILL.md`](./RIG_WIKI_SKILL.md)
- [`RIG_CREW_SKILL.md`](./RIG_CREW_SKILL.md)

Plugin copies that belong to the `rig` package live under `.claude/skills/` and are synchronized by:

```bash
node scripts/sync-skill.mjs
```

`prepublishOnly` runs the sync script before packaging. Today this plugin-copy set only includes `rig-wiki`; `rig-crew` remains Vault-level guidance.

## Documentation Policy

- Put one-line skill visibility and high-level links in `README.md`.
- Put all skill references, maintenance notes, and plugin-copy details in this file.
- Keep each canonical `RIG_*_SKILL.md` self-contained so users can read exactly what they are enabling.
