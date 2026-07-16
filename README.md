# Rig

Rig is an agent-facing macOS CLI for git-based multi-repo development, local LLM
wikis, file-backed agent orchestration, and Claude Code → Codex handoff.

[中文](./README_CN.md)

## Install

Requires macOS and Node.js 22–26.

```bash
npx --yes rigjs@latest setup
```

This one command installs a user-wide `rig` CLI under `~/.rig`, adds it to new
zsh sessions, and installs the Rig skill for detected Codex and Claude Code
installations. Open a new terminal and start a new agent task afterward.

To install the skill through the open Agent Skills ecosystem instead:

```bash
npm install --global rigjs
npx --yes skills add https://github.com/FlashHand/rig/tree/main/skills/rig -g -a codex -a claude-code -y
```

## Teach your agent

Copy the bundled operating guide and paste it into Claude Code, Codex, or any
other coding agent:

```bash
rig guide --copy
```

The guide is designed for the agent, so you do not need to learn the full CLI.
To print it instead, run `rig guide`; `rig man` is an alias. The checked-in copy
is [`RIG_GUIDE.md`](./RIG_GUIDE.md).

## Start here

```bash
rig help                 # command index
rig guide                # full agent guide
rig setup                # install/update CLI + Rig skill
rig init                 # initialize git dependency management in a project
rig dev <dependency>     # develop a dependency locally
rig handoff install      # install Claude Code → Codex handoff
```

For any command family, use `rig help <command>` and
`rig <command> <subcommand> --help`.

License: MIT
