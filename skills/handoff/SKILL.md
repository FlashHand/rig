---
name: handoff
description: Copy the current Claude Code session into a Codex-ready handoff. Use only when the user explicitly invokes /handoff to continue the same work in Codex.
disable-model-invocation: true
---

# Claude → Codex handoff

Rig's `UserPromptExpansion` hook must intercept this command before it reaches a model, copy the current transcript path to the macOS clipboard, and block prompt expansion.

If these instructions reached Claude, the local hook is missing or disabled. Do not attempt to summarize the conversation. Tell the user to run `rig handoff install`, or use the model-free fallback `rig handoff copy --latest` in a terminal.
