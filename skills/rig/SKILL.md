---
name: rig
description: Operate the Rig (`rigjs`) macOS CLI for git-based dependency workspaces, static-site CI/CD, local LLM wikis, file-backed agent orchestration, and bidirectional Claude Code and Codex handoff. Use when the user asks to install or use Rig, work with package.rig.json5, run rig build/deploy/publish, manage a Rig wiki or crew, diagnose Rig, or configure Claude/Codex session handoff.
---

# Operate Rig

Treat the user's requested outcome as authority for external or destructive actions. Do not deploy, publish, push tags, overwrite skills, or ingest broad file trees merely because Rig supports them.

## Verify the CLI

Run:

Prefer Rig's stable user launcher when it exists; otherwise use `rig` from `PATH`:

```bash
RIG_BIN="${RIG_HOME:-$HOME/.rig}/bin/rig"
if test -x "$RIG_BIN"; then
  "$RIG_BIN" --version
elif command -v rig >/dev/null 2>&1; then
  rig --version
else
  npx --yes rigjs@latest setup
fi
```

To explicitly install or update the CLI and this skill, run:

```bash
npx --yes rigjs@latest setup
```

Open a new terminal and start a new agent task after first-time installation. Rig currently supports macOS and Node.js 22–26.

## Choose the command family

- Git dependencies and `package.rig.json5`: `rig init`, `rig add`, `rig dev`, `rig install`, `rig info`, `rig tag`.
- Static-site delivery: `rig build`, `rig deploy`, `rig publish`.
- Local knowledge wiki: `rig wiki *`.
- File-backed agent coordination: `rig orchestrate *` (`crew`, `om`, and `overmind` aliases).
- Bidirectional takeover: `rig handoff install`; use the same `handoff` Skill as
  `/handoff` in Claude or Codex. Codex `$handoff` remains compatible. Trust the
  Rig Codex hook once through `/hooks`.
- Installation and discovery: `rig setup`, `rig help`, `rig guide`, `rig man`.

Before guessing flags, run `rig help <command>` or `rig <command> <subcommand> --help`. For the complete bundled operating guide, run `rig guide`; locate it without loading it using `rig guide --path`.

## Operate safely

1. Confirm the working directory and relevant Rig config.
2. Inspect current Git and filesystem state.
3. Run the narrowest relevant Rig command.
4. Verify exit status and changed files or external state.
5. Report the outcome and any unresolved condition.

Keep credentials out of CLI arguments, committed configs, logs, and chat. Treat Claude and Codex transcript JSONL files as private local evidence and page them with `rig handoff intake/read` or `rig handoff from-codex intake/read`; never publish or paste an entire transcript.
