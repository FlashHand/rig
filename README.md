# Rig

Rig is an agent-facing macOS CLI for git-based multi-repo development, local LLM
wikis, file-backed agent orchestration, and bidirectional Claude Code ↔ Codex handoff.

[中文](./README_CN.md)

## Install

Requires macOS and Node.js 22–26.

```bash
npx --yes rigjs@latest setup
```

This one command installs a user-wide `rig` CLI under `~/.rig`, adds it to new
zsh sessions, and installs the Rig skill for detected Codex and Claude Code
installations. Open a new terminal and start a new agent task afterward.

## Agent Skills

Rig ships eight Agent Skills. Seven are discoverable through the open Agent
Skills CLI; `rig-crew` is bundled and installed together with `rig-wiki` by Rig.

| Skill | What it teaches the agent | Target | Install route |
|---|---|---|---|
| `rig` | Choose and operate the right Rig command family | Codex, Claude Code | `rigjs setup` or `skills add` |
| `rig-wiki` | Ingest, retrieve, lint, and rebuild a local LLM wiki | Codex, Claude Code | `skills add` or Wiki installer |
| `rig-crew` | Coordinate file-backed multi-agent work | Claude globally; Codex/Claude per project | Wiki installer |
| `rig-package` | Manage Git-tagged dependencies and local development | Codex, Claude Code | `skills add` |
| `rig-cicd` | Build and publish static sites to Aliyun OSS/CDN | Codex, Claude Code | `skills add` |
| `handoff` | Copy the current JSONL path for the other agent without a model summary | Codex, Claude Code | Handoff installer |
| `rig-from-claude` | Recover local Claude JSONL and continue the task | Codex | Handoff installer |
| `rig-from-codex` | Recover local Codex rollout JSONL and continue the task | Claude Code | Handoff installer |

List the Skills that the standard CLI can discover:

```bash
npx --yes skills add FlashHand/rig --list
```

Install one standalone Skill globally:

```bash
npx --yes skills add FlashHand/rig \
  --skill rig-package \
  -g -a codex -a claude-code -y
```

Install several standalone Skills at once:

```bash
npx --yes skills add FlashHand/rig \
  --skill rig \
  --skill rig-wiki \
  --skill rig-package \
  --skill rig-cicd \
  -g -a codex -a claude-code -y
```

If you want both `rig-wiki` and `rig-crew`, use Rig's paired installer instead
of installing `rig-wiki` separately:

```bash
rig wiki install-skill             # user-level Claude Code
rig wiki install-skill --project   # current project: Codex + Claude Code
```

The handoff feature is one shared sender Skill plus two JSONL format adapters.
It is managed across both agents because it also needs Claude and Codex hooks
plus a stable launcher:

```bash
rig handoff install
rig handoff doctor
```

`handoff` is the one user-facing canonical Skill linked into both agents:
invoke `/handoff` in Claude Code or Codex. Codex `$handoff` remains compatible.
The two internal
`rig-from-*` receiver adapters remain separate because Claude and Codex use
different JSONL schemas. The installer sets Claude's `skillOverrides.handoff`
to `user-invocable-only`, matching Codex's non-implicit policy, so neither
agent may decide to change the clipboard on its own.

Do not install the sender or receiver directories with `skills add` alone; that
does not configure the hooks and launcher required for a complete handoff.

## Teach your agent

Copy the bundled operating guide and paste it into Claude Code, Codex, or any
other coding agent:

```bash
rig guide --copy
```

The guide is designed for the agent, so you do not need to learn the full CLI.
To print it instead, run `rig guide`; `rig man` is an alias. The checked-in copy
is [`RIG_GUIDE.md`](./RIG_GUIDE.md).

### Continue Claude work in Codex

After `rig handoff install`, enter `/handoff` in Claude Code, then paste the
copied handoff into Codex. Codex's `$rig-from-claude` skill reads the local JSONL
newest-first, recovers the objective, decisions, edits, tool results, errors, and
unfinished work, checks them against the current workspace, and continues the
task. A `StopFailure` hook also creates the handoff after token, quota, billing,
authentication, or output-limit failures, without asking Claude for a summary.

If Claude is no longer interactive, run `rig handoff copy --latest` in a
terminal and paste the result into Codex.

### Continue Codex work in Claude Code

After installation, open `/hooks` in Codex once and trust Rig's
`UserPromptSubmit` hook. Enter `/handoff` in Codex, then paste the copied
handoff into Claude Code. The hook copies the exact rollout path, working
directory, and session ID and stops that prompt before a model call. Claude's
`rig-from-codex` Skill reads only the newest useful dialogue, tool results, file
edits, and unfinished state; private reasoning, encrypted content, runtime
instructions, world state, and token telemetry are omitted.

Codex does not expose a `StopFailure` equivalent for quota failures, but the
local `/handoff` hook still runs before a model request and writes the exact
rollout pointer. Ordinary prompts do not update that shared pointer, so a
subagent cannot replace the main task. If the Codex UI is unavailable, run:

```bash
rig handoff from-codex copy --latest --cwd "$PWD"
```

Then paste the clipboard into Claude Code.

## Start here

```bash
rig help                 # command index
rig guide                # full agent guide
rig setup                # install/update CLI + Rig skill
rig init                 # initialize git dependency management in a project
rig dev <dependency>     # develop a dependency locally
rig handoff install      # install bidirectional Claude Code ↔ Codex handoff
rig handoff doctor       # verify both hooks, one sender, and two adapters
```

For any command family, use `rig help <command>` and
`rig <command> <subcommand> --help`.

License: MIT
