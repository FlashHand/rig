# Rig Agent Guide

This document is an operating guide for a coding agent. The human states the
outcome; the agent chooses and runs the appropriate `rig` commands, observes the
result, and reports what changed. Do not make the human memorize the CLI.

## Discover the installed CLI

```bash
rig help
rig help <command>
rig <command> --help
rig <command> <subcommand> --help
rig --version
rig --versioncode
```

`rig help` is the authoritative command index. This guide explains intent and
safe operating patterns; command help is authoritative for current flags.

## Decide which Rig surface to use

| User intent | Surface |
|---|---|
| Manage private git dependencies or edit one locally | `rig init/add/dev/install/info/tag` |
| Build or deploy configured web endpoints | `rig build/deploy/publish` |
| Maintain or query a local LLM wiki | `rig wiki *` |
| Coordinate file-backed project owners and agents | `rig orchestrate *` (`crew`, `om`, `overmind` aliases) |
| Continue a Claude Code task in Codex | `rig handoff *` |
| Teach another agent Rig | `rig guide`, `rig guide --copy`, or `rig man` |

## Complete command-family index

- Workspace/package: `init`, `add`, `dev`, `install` (`i`), `check`, `info`,
  `sync`, and `tag`.
- CI/CD: `build`, `deploy`, and `publish`.
- Wiki: `init`, `scan`, `survey`, `sync`, `fetch`, `ingest`, `query`, `lint`,
  `index`, `rebuild`, `install-skill`, `uninstall-skill`, `agent`, and `daemon`.
- Orchestration: `init`, natural-language `ask`, `status`, `pending-questions`,
  `board`, `sync`, `overview`, `journal`, `task`, `doctor`, `engine`, `dispatch`,
  `project`, `role`, `pending`, `run`, and the explicitly marked planned commands.
- Handoff: `install`, `uninstall`, `doctor`, `copy`, `latest`, `inspect`, and
  `read`; `hook` is an internal integration entrypoint.
- Global environment selection: `rig --env <name>` materializes a selected
  environment from `env.rig.json5`.
- Contributor/lifecycle commands: `install-local`, `preinstall`, and
  `postinstall`. Do not invoke lifecycle commands manually unless diagnosing
  package installation.

For deeper operating rules bundled with the package, read
`RIG_PACKAGE_SKILL.md`, `RIG_CICD_SKILL.md`, `RIG_WIKI_SKILL.md`, and
`RIG_CREW_SKILL.md`. Use `rig guide --path` to locate this package directory.

## Git dependency workflow

Run these commands from a project root containing `package.json`.

```bash
rig init
rig add git@github.com:org/shared-ui.git 1.2.3
rig dev shared-ui
rig install
rig info
```

- `rig init` creates `package.rig.json5`, `rig_dev/`, lifecycle scripts, and
  workspace entries. Inspect the diff before committing it.
- `rig add <git-url> <semver-tag>` records a pinned git dependency and installs
  it. Private repositories require working SSH access.
- `rig dev <name-or-git-url>` clones the dependency under `rig_dev/` and links
  it into `node_modules` for in-place development.
- `rig install` is also available as `rig i`. It may rewrite dependency entries
  while pre/post-install hooks run; inspect the resulting git diff.
- `rig tag` creates a local release tag from package configuration. It does not
  push the tag; verify the worktree and remote before any push.

Primary config: `package.rig.json5`. Use exact semver tags for Rig-managed git
dependencies. Do not replace a user's local edits in `rig_dev/`.

## CI/CD workflow

`rig build`, `rig deploy`, and `rig publish` operate on the `cicd` section of
`package.rig.json5`.

```bash
rig build <dir-path>
rig deploy <dir-path>
rig publish <dir-path>
```

`<dir-path>` selects endpoints, for example `prod/app-a` or `prod/%`. Use
`--schema 'env=test&oem=oem1'` to supply `{key}` values in `tree_schema`; use
`--params 'region=cn&stage=test'` to replace `${key}` tokens in configuration.
Treat deploy and publish as external changes: inspect the selected endpoint,
target, domain, and credentials first. Never put credentials into
`package.rig.json5`, commits, logs, or chat output.

## Wiki workflow

Rig Wiki is agent-operated and macOS-only. It stores its metadata in
`rig-wiki/` within a project or Obsidian vault.

```bash
rig wiki init [scope]
rig wiki scan
rig wiki survey
rig wiki sync --dry-run
rig wiki sync
rig wiki fetch <url>
rig wiki ingest <source>
rig wiki query "<question>"
rig wiki lint
```

Common intent mapping:

- Create a wiki: `rig wiki init [scope]`, then let the human define
  `rig-wiki/purpose.md` and `rig-wiki/schema.md`.
- Update from disk: preview with `rig wiki sync --dry-run`, then run
  `rig wiki sync`.
- Capture a URL: `rig wiki fetch <url>`, then ingest the returned raw file.
- Search: `rig wiki query "..."`; add `--synth` only when a synthesized answer
  is useful.
- Diagnose integrity: `rig wiki scan` and `rig wiki lint`.
- Rebuild machine-local indexes only when needed: `rig wiki index` or
  `rig wiki rebuild`. Manage the launchd runner under `rig wiki daemon` and
  inspect exact subcommands with `--help`.

Do not edit existing `raw/` sources, `purpose.md`, or `schema.md` on the user's
behalf. Treat RAW DRIFT and severe lint findings as conditions to report, not to
auto-fix. Use `.wikiignore` for tracked material that must never be ingested.

## Orchestration workflow

`rig orchestrate` is a file-backed, agent-facing coordinator over an Obsidian
vault. Its aliases are `rig crew`, `rig om`, and `rig overmind`.

```bash
rig orchestrate init --vault "/path/to/Vault" --as <crew-name>
rig orchestrate status
rig orchestrate pending-questions
rig orchestrate board
rig orchestrate project sync
rig orchestrate project list
rig orchestrate "<natural-language instruction>"
```

Use `status` and `pending-questions` before assuming project state. The vault
files are the source of truth; do not assume a persistent background agent.
Register or synchronize project owners before dispatching project work. Inspect
`rig orchestrate --help` for role, pending, run, dispatch, journal, and overview
operations.

## Claude Code to Codex handoff

Install once on macOS:

```bash
rig handoff install
rig handoff doctor
```

Normal interaction: the human types `/handoff` in Claude Code, switches to
Codex, and pastes. Rig copies a prompt containing the current local Claude JSONL
path; the installed Codex `from-claude` skill reads it incrementally and resumes
the unfinished task. The local hook does not require a Claude model call, and a
`StopFailure` hook provides recovery after quota/auth/output failures.

Terminal recovery and diagnostics:

```bash
rig handoff copy
rig handoff latest
rig handoff inspect <session.jsonl>
rig handoff read <session.jsonl> --from 1 --limit 80
rig handoff doctor --json
```

Transcripts may contain secrets and private tool output. Keep them local, page
only what is needed, never paste the whole JSONL into chat, and never publish or
commit a transcript.

## Safe agent operating loop

1. Confirm the working directory and identify the relevant Rig config.
2. Read `rig help <command>` and nested `--help` before guessing flags.
3. Preview or inspect before destructive/external operations.
4. Run the narrowest command that satisfies the user's intent.
5. Check exit status and inspect changed files or external state.
6. Report the outcome, important paths, and any unresolved condition.

Do not run deploy, publish, tag push, transcript export, or broad ingestion just
because they appear in this guide. They still require the user's task to place
that action in scope.
