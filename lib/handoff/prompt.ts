export interface HandoffContext {
  transcriptPath: string;
  cwd: string;
  sessionId: string;
  error?: string;
}

export interface CodexHandoffContext extends HandoffContext {
  model?: string;
}

export function buildHandoffPrompt(context: HandoffContext): string {
  const lines = [
    'Use the $rig-from-claude Skill to take over this Claude Code session.',
    '',
    `transcript_path: ${context.transcriptPath}`,
    `cwd: ${context.cwd}`,
    `session_id: ${context.sessionId}`,
  ];
  if (context.error) lines.push(`claude_stop_error: ${context.error}`);
  lines.push(
    '',
    'First recover the user goal, key decisions, executed operations, file edits, tool results, and unfinished work from the JSONL. Then reconcile against the current workspace state and continue. Do not ask Claude to summarize again.',
  );
  return lines.join('\n') + '\n';
}

export function buildClaudeHandoffPrompt(context: CodexHandoffContext): string {
  const lines = [
    'Use the rig-from-codex Skill to take over this Codex session.',
    '',
    `transcript_path: ${context.transcriptPath}`,
    `cwd: ${context.cwd}`,
    `session_id: ${context.sessionId}`,
  ];
  if (context.model) lines.push(`codex_model: ${context.model}`);
  if (context.error) lines.push(`codex_stop_error: ${context.error}`);
  lines.push(
    '',
    'First recover the user goal, key decisions, executed operations, file edits, tool results, and unfinished work from the Codex rollout JSONL. Then reconcile against the current workspace state and continue. Do not ask Codex to summarize again.',
  );
  return lines.join('\n') + '\n';
}
