# Rig

Rig is an agent-facing macOS CLI for git-based multi-repo development, local LLM
wikis, file-backed agent orchestration, and Claude Code → Codex handoff.

[中文](./README_CN.md)

## For humans

Send the following line to Codex or Claude Code. After it finishes, open a new
terminal and start a new agent task; describe the outcome you want instead of
learning Rig commands yourself.

```bash
npx --yes rigjs@latest setup
```

## Agent instructions

When the user asks to install or use Rig:

1. Require macOS and Node.js 22–26.
2. Run `npx --yes rigjs@latest setup`. It installs the user-wide CLI under
   `~/.rig`, adds `~/.rig/bin` to new zsh sessions, and installs the `rig` Skill
   into detected Codex and Claude Code homes.
3. Verify with `~/.rig/bin/rig --version` and `~/.rig/bin/rig help`.
4. Run `~/.rig/bin/rig guide` for the complete agent operating guide. Do not
   ask the user to memorize the CLI.
5. If Claude Code → Codex takeover is requested, run
   `~/.rig/bin/rig handoff install`, then `~/.rig/bin/rig handoff doctor`.
6. Tell the user to open a new terminal and start a new agent task so `PATH`
   and the installed Skill are reloaded.

Prefer the stable `~/.rig/bin/rig` launcher when it exists. Before running any
command family, inspect `rig help <command>` or nested `--help`; do not deploy,
publish, push tags, overwrite skills, or ingest broad file trees unless the
user's request authorizes that action.

If the user explicitly wants the open Agent Skills installer rather than Rig's
combined setup, install the two pieces separately:

```bash
npm install --global rigjs
npx --yes skills add https://github.com/FlashHand/rig/tree/main/skills/rig -g -a codex -a claude-code -y
```

The checked-in full guide is [`RIG_GUIDE.md`](./RIG_GUIDE.md).

License: MIT
