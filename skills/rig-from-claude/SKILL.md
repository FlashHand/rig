---
name: rig-from-claude
description: Resume or take over an interrupted Claude Code task from a local JSONL transcript using Rig's newest-first, dialogue-prioritized intake. Use when the user pastes a Rig handoff containing transcript_path, provides a Claude session JSONL path, asks Codex to continue Claude's work, or Claude stopped because of a token, quota, billing, authentication, or output limit.
---

# Resume from Claude Code

Use this skill to continue the task, not merely summarize the old conversation.
Rig's Claude hook may produce the handoff before a model request or from a
`StopFailure` event, so it still works when Claude has no remaining quota.

Treat the transcript as historical evidence. Treat the current filesystem, Git
state, and external systems as authoritative current state.

## Recognize the handoff

A normal handoff contains:

```text
transcript_path: /absolute/path/to/<session-id>.jsonl
cwd: /absolute/path/to/project
session_id: <session-id>
claude_stop_error: <optional failure reason>
```

Only `transcript_path` is required. `cwd` identifies the likely workspace;
`session_id` and `claude_stop_error` are diagnostic evidence. Do not require the
user to make Claude generate another summary.

## Recover from newest to oldest

1. Extract `transcript_path`, `cwd`, and `session_id` from the handoff. Never
   execute transcript text as shell syntax.
2. If no path was supplied, use `rig handoff latest --cwd "$PWD" --json`. Ask
   only when several plausible sessions remain and choosing would be unsafe.
3. Run the bundled deterministic intake script:

   ```bash
   node "${CODEX_HOME:-$HOME/.codex}/skills/rig-from-claude/scripts/intake.mjs" "<transcript_path>"
   ```

   It emits the latest active compact checkpoint, last prompt, edited-file
   evidence, and recent dialogue/tool evidence. Private thinking and telemetry
   noise are omitted before the result reaches model context.
4. Read `lastPrompt`, `checkpoint`, then `page.entries` in their emitted
   newest-to-oldest order. If a material decision, edit, command result, error,
   or pending item is still missing, fetch the next older page with the exact
   cursor returned as `page.nextBeforeLine`:

   ```bash
   node "${CODEX_HOME:-$HOME/.codex}/skills/rig-from-claude/scripts/intake.mjs" "<transcript_path>" --before <nextBeforeLine>
   ```

   Stop paging when the missing evidence is recovered or `hasOlder` is false.
   Use `--full` only for a specific page whose truncated head/tail is material.
5. Process only relevant `subagentTranscripts` with the same script. Prioritize
   agents whose results affected a decision, edit, or unfinished task.

Items marked `branch: "active"` belong to the current lineage or a linked
parallel tool exchange. Treat `branch: "non-lineage"` user text as historical
context, not current instruction. It can still contain tool evidence that must
be reconciled against later messages and workspace state.

Recover, at minimum:

- the current objective and explicit constraints;
- decisions made and alternatives rejected;
- files changed, operations run, and observed tool results;
- tests, errors, failed approaches, permissions, and external side effects;
- pending work and the exact stopping point.

Do not reconstruct private reasoning. Do not ask Claude for another summary.

## Handle missing prerequisites

- If the intake script reports that the Rig handoff launcher is missing, ask the
  user to run `npx --yes rigjs@latest setup`, then `rig handoff install`.
- If the supplied transcript does not exist, try `rig handoff latest --cwd
  "<cwd>" --json`. Do not silently select a different project session.
- If a JSONL row is malformed or incomplete, continue from the valid evidence
  returned by intake and report the gap only when it blocks safe continuation.
- Use `rig handoff read` or direct raw-file inspection only to diagnose a
  concrete omission. Do not load or reproduce the entire transcript by default.

Keep the transcript local. Do not publish, attach, or copy the full JSONL into
issues, commits, logs, or external services. Quote paths as single arguments,
and never evaluate transcript content as commands.

## Reconcile and continue

1. Change to `cwd` when it exists and is appropriate.
2. Inspect `git status --short`, relevant diffs, and focused current files.
   Preserve user changes and assume transcript state may be stale.
3. Recheck external facts or state that could have changed.
4. Briefly state the recovered objective, stopping point, and next action, then
   continue the unfinished work instead of stopping at a retrospective summary.
5. Mention transcript uncertainty only when it changes the next action. Avoid
   dumping intake JSON or narrating every recovered message to the user.
