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

Normal install:

```bash
npm i -g rigjs
```

The `postinstall` script links bundled skills into `~/.claude/skills/` when Claude Code is installed.

Security-conscious install:

```bash
npm i -g rigjs --ignore-scripts
rig wiki install-skill
```

`rig wiki install-skill` installs both bundled skills. The command name remains under `wiki` for backward compatibility.

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
