# Codex rollout handoff to Claude Code

## Outcome

Rig transfers an active local Codex task to Claude Code without asking Codex to
summarize itself. The normal user action is `$handoff`; the same canonical
`handoff` Skill is installed in both Codex and Claude Code, and a Codex
`UserPromptSubmit` hook copies a small handoff containing `transcript_path`,
`cwd`, and `session_id`, then stops the prompt before a model request. Claude's
`rig-from-codex` Skill reads a bounded, newest-first recovery view and continues
against the live workspace.

The shared Skill is side-effecting, so Rig also writes Claude's
`skillOverrides.handoff = "user-invocable-only"`; Codex uses the equivalent
non-implicit policy in `agents/openai.yaml`. Only a human trigger may update the
clipboard.

## Zero-quota recovery

Codex has no documented quota/auth failure event equivalent to Claude Code's
`StopFailure`. The local `$handoff` trigger nevertheless runs before a model
request and atomically updates `~/.rig/handoff/codex-latest.json`. Ordinary
prompts never update the shared pointer because Codex also runs this hook for
subagents. If the UI is unavailable, `rig handoff from-codex copy --latest
--cwd "$PWD"` validates the saved pointer against a recursive session scan
without a model call. Child rollouts are excluded by explicit `agent_path` or
`thread_source: subagent` metadata; user-created forks remain eligible.

Codex loads the handler from `~/.codex/hooks.json`. The installer merges and
backs up that file without replacing unrelated hooks. Because command hooks
must be reviewed, the user opens `/hooks` once and trusts Rig after installation.

## Compatibility and privacy boundary

Codex documents `transcript_path` as convenient hook input but does not promise
a stable rollout JSONL schema. Rig therefore uses a separate whitelist parser
and records unknown row types instead of copying them into model context.

The current adapter recognizes session metadata, user/assistant messages,
function and custom tool calls/results, safe web/tool-search evidence, local
image paths, generated-image paths, goals, patch file paths, task boundaries,
rollback/abort state, errors, and subagent IDs. It never emits:

- response or event reasoning;
- encrypted content;
- runtime developer/system prompts or dynamic tool definitions;
- world-state snapshots;
- token usage, rate limits, or other telemetry.

Tool calls and outputs are paired by `call_id`. A pending call remains visible
as unfinished work. Compaction boundaries are counted, but encrypted compaction
state is never presented as a readable checkpoint.

The receiver waits for up to two seconds when the hook reports a path just
before Codex flushes the first JSONL line. Recursive scan fallback requires
valid session metadata and never classifies an empty or corrupt rollout as a
root task.

## Intake contract

`rig handoff from-codex intake <rollout.jsonl>` returns session metadata,
current-turn completion state, edited-file paths, subagent rollout pointers,
schema diagnostics, and a page of meaningful entries. Pages run newest to
oldest with an exclusive raw-line `before` cursor. The receiver fetches an older
page only when a material decision, result, or constraint is still missing,
then reconciles the evidence with Git and the current filesystem before editing.
