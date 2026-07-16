# Claude Code JSONL fast intake

## Outcome

`rig-from-claude` resumes a long Claude Code session without feeding its whole
JSONL transcript to Codex. One deterministic command emits the newest useful
conversation and tool evidence first, a bounded compaction checkpoint, branch
metadata, and an exclusive cursor for the next older page.

The current filesystem and external systems remain authoritative. Transcript
content is historical evidence, never executable shell input.

## Evidence and compatibility boundary

Anthropic's public [hooks reference](https://code.claude.com/docs/en/hooks)
documents `session_id`, `transcript_path`, and `cwd` as common hook input. It
also documents a distinct `agent_transcript_path` for subagents. It does not
publish the on-disk JSONL row schema as a stable API.

An empirical sample on 2026-07-16 covered 20 local transcripts and 8,975 valid
JSONL rows. Observed top-level types were `assistant`, `user`, `attachment`,
`last-prompt`, `mode`, `queue-operation`, `custom-title`, `system`,
`permission-mode`, `file-history-snapshot`, and `ai-title`. Message content was
mostly `tool_use`, `tool_result`, `thinking`, and `text`, with a few `image`
and `fallback` blocks.

Therefore the parser has a deliberately narrow compatibility contract:

- hard-code known recovery-bearing fields;
- count unknown row types but do not dump them into model context;
- ignore private `thinking` blocks entirely in the recovery view;
- preserve the older raw `inspect` and `read` commands for diagnostics;
- tolerate new optional fields and malformed individual lines.

## Intake contract

`rig handoff intake <transcript>` scans the file once and returns:

- session identity, timestamps, title, model names, row/tool counts, malformed
  line count, and omitted thinking-block count;
- the newest active compact summary as `checkpoint`, bounded with both its
  beginning and ending retained;
- `lastPrompt`, recent edited-file evidence, and subagent transcript paths;
- a page of meaningful `user`/`assistant` messages plus warning/error system
  rows, with assistant usage/model telemetry removed;
- branch annotations (`active` or `non-lineage`) and a page cursor.

Paging is newest-to-oldest. `beforeLine` is exclusive. The first call omits it;
the next call passes the returned `nextBeforeLine`. Entries are emitted newest
first so the most recent user intent and stopping point are read first. The
cursor is based on raw line numbers, while `limit` counts only meaningful
recovery entries; thinking-only and metadata-only rows do not consume a page.

The latest compact summary is separate from the page to avoid duplicating a
large checkpoint on every page. Older compact summaries and compact-boundary
telemetry are not paged: the latest active checkpoint is the baseline, and
older raw evidence is fetched only when a decision, edit, or result is missing.

## Skill runner

The canonical skill is `skills/rig-from-claude`, installed as the standalone
Codex personal skill `~/.codex/skills/rig-from-claude`. Its bundled
`scripts/intake.mjs` locates the stable Rig handoff launcher and invokes the
hard-coded intake command without shell interpolation. It defaults to 12
meaningful entries and 2,000 characters per string; a specific page can widen
those bounds or use `--full`. The skill uses this script for the main transcript
and only relevant subagent transcripts.

The previous `from-claude` link is an installer-owned legacy name. Installation
removes it only when it is a symlink to Rig's old bundled source; user-owned
files or unrelated links are never removed.

## Resume sequence

1. Run the skill script once with the supplied transcript.
2. Recover the current goal and constraints from `lastPrompt`, newest dialogue,
   and the active checkpoint.
3. Page older only while a material decision, file edit, tool result, error, or
   pending item remains unresolved.
4. Inspect relevant subagent transcripts through the same intake view.
5. Reconcile with Git status/diffs and current files, then continue the work.

This makes model-context volume, rather than raw JSONL size, the bounded
resource. A multi-megabyte transcript can still be scanned locally in one pass
while only a small recovery view is transferred to Codex.
