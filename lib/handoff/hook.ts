import fs from 'fs';
import { buildHandoffPrompt, HandoffContext } from './prompt';
import { copyToClipboard, notifyHandoff, requireMacOS } from './platform';

export interface ClaudeHookInput {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  command_name?: string;
  command_args?: string;
  error?: string;
}

export interface HookDependencies {
  copy?: (text: string) => void;
  notify?: (message: string) => void;
  platform?: NodeJS.Platform;
}

export interface HookResult {
  output?: { decision: 'block'; reason: string };
  prompt: string;
  event: string;
}

export function parseHookInput(raw: string): ClaudeHookInput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Claude hook input is not valid JSON.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Claude hook input must be a JSON object.');
  }
  return value as ClaudeHookInput;
}

export function handleHook(input: ClaudeHookInput, deps: HookDependencies = {}): HookResult {
  requireMacOS(deps.platform || process.platform);
  const event = input.hook_event_name || '';
  if (event !== 'UserPromptExpansion' && event !== 'StopFailure') {
    throw new Error(`unsupported Claude hook event: ${event || '<missing>'}`);
  }
  if (event === 'UserPromptExpansion' && input.command_name !== 'handoff') {
    throw new Error(`unexpected slash command: ${input.command_name || '<missing>'}`);
  }

  const context = validateContext(input);
  const prompt = buildHandoffPrompt(context);
  (deps.copy || copyToClipboard)(prompt);

  if (event === 'StopFailure') {
    (deps.notify || notifyHandoff)('Claude stopped. Codex handoff copied to clipboard.');
    return { event, prompt };
  }

  return {
    event,
    prompt,
    output: {
      decision: 'block',
      reason: 'Codex handoff copied to clipboard. Switch to Codex, paste, and send.',
    },
  };
}

function validateContext(input: ClaudeHookInput): HandoffContext {
  const transcriptPath = requireString(input.transcript_path, 'transcript_path');
  const cwd = requireString(input.cwd, 'cwd');
  const sessionId = requireString(input.session_id, 'session_id');
  if (!transcriptPath.endsWith('.jsonl')) {
    throw new Error('transcript_path must point to a .jsonl file.');
  }
  // Claude can emit UserPromptExpansion before the first transcript line is
  // flushed to disk. Keep the authoritative path even when the file appears
  // a few milliseconds after this hook returns.
  return { transcriptPath, cwd, sessionId, error: input.error };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Claude hook input is missing ${field}.`);
  }
  return value;
}

export function runHookCli(raw: string): number {
  let input: ClaudeHookInput = {};
  try {
    input = parseHookInput(raw);
    const result = handleHook(input);
    if (result.output) process.stdout.write(JSON.stringify(result.output) + '\n');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input.hook_event_name === 'StopFailure') {
      process.stderr.write(`rig handoff: ${message}\n`);
      return 1;
    }
    // Fail closed: never let a broken handoff command fall through to a model call.
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: `Rig handoff failed before calling Claude: ${message}`,
    }) + '\n');
    return 0;
  }
}

export function readHookStdin(maxBytes = 1024 * 1024): string {
  const chunks: Buffer[] = [];
  let total = 0;
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  while ((bytes = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
    total += bytes;
    if (total > maxBytes) throw new Error(`Claude hook input exceeds ${maxBytes} bytes.`);
    chunks.push(Buffer.from(buffer.subarray(0, bytes)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
