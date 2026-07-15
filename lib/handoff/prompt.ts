export interface HandoffContext {
  transcriptPath: string;
  cwd: string;
  sessionId: string;
  error?: string;
}

export function buildHandoffPrompt(context: HandoffContext): string {
  const lines = [
    '请使用 $from-claude Skill 接管这个 Claude Code 会话。',
    '',
    `transcript_path: ${context.transcriptPath}`,
    `cwd: ${context.cwd}`,
    `session_id: ${context.sessionId}`,
  ];
  if (context.error) lines.push(`claude_stop_error: ${context.error}`);
  lines.push(
    '',
    '先从 JSONL 恢复用户目标、关键决策、已执行操作、文件修改、工具结果和未完成工作；随后核对当前工作区真实状态，再继续执行。不要要求 Claude 重新总结。',
  );
  return lines.join('\n') + '\n';
}
