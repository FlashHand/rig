---
name: handoff
description: Copy the current Claude Code or Codex session JSONL path into a handoff for the other coding agent without asking the current model to summarize. Use only when the user explicitly invokes /handoff in Claude Code or Codex, invokes the backward-compatible $handoff Codex Skill, or asks to transfer the current task between them.
---

# Claude ↔ Codex handoff

Treat this as a control Skill, not a summarization request. Rig normally
intercepts it before a model call and copies a small handoff containing the
current JSONL path, working directory, and session ID.

If these instructions reached a model, the local hook is missing, disabled, or
not yet trusted. Do not summarize the conversation and do not paste the JSONL
into chat.

- In Claude Code, run `rig handoff copy --latest --cwd "$PWD"` and tell the
  user to paste the clipboard into Codex.
- In Codex, run `rig handoff from-codex copy --latest --cwd "$PWD"` and tell
  the user to paste the clipboard into Claude Code.

Use `/handoff` as the canonical human command in both agents. Keep `$handoff`
only as a backward-compatible Codex Skill invocation.

If the command fails, run `rig handoff doctor`, reinstall with `rig handoff
install` if needed, and in Codex review/trust the Rig hook once through
`/hooks`.
