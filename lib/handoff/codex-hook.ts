import fs from 'fs';
import { buildClaudeHandoffPrompt } from './prompt';
import { copyToClipboard, notifyHandoff, requireMacOS } from './platform';
import { CodexLatestPointer, writeCodexLatestPointer } from './codex-pointer';

export interface CodexHookInput {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  prompt?: string;
  model?: string;
  turn_id?: string;
}

export interface CodexHookDependencies {
  copy?: (text: string) => void;
  notify?: (message: string) => void;
  writePointer?: (pointer: CodexLatestPointer) => void;
  platform?: NodeJS.Platform;
  now?: () => Date;
}

export interface CodexHookResult {
  triggered: boolean;
  prompt?: string;
  output?: { decision: 'block'; reason: string };
  pointerError?: string;
}

const CODEX_HANDOFF_PROMPTS = new Set([
  '/handoff',
  // Backward compatibility for Codex's explicit Skill invocation surface.
  '$handoff',
  'Use $handoff to copy this session for the other coding agent to continue.',
]);

export function parseCodexHookInput(raw: string): CodexHookInput {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Codex hook input is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Codex hook input must be a JSON object.');
  }
  return value as CodexHookInput;
}

export function isCodexHandoffPrompt(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const prompt = value.trim();
  return CODEX_HANDOFF_PROMPTS.has(prompt);
}

export function handleCodexHook(
  input: CodexHookInput,
  pointerPath: string,
  deps: CodexHookDependencies = {},
): CodexHookResult {
  const event = input.hook_event_name || '';
  if (event !== 'UserPromptSubmit') throw new Error(`unsupported Codex hook event: ${event || '<missing>'}`);

  // Codex runs UserPromptSubmit hooks for subagents too, but its hook payload
  // has no root/subagent marker. Only an explicit user handoff trigger may
  // claim the shared latest pointer; ordinary child activity must not replace
  // the main task's session.
  if (!isCodexHandoffPrompt(input.prompt)) return { triggered: false };

  let pointerError: string | undefined;
  try {
    const pointer = buildPointer(input, deps.now ? deps.now() : new Date());
    (deps.writePointer || ((value: CodexLatestPointer) => writeCodexLatestPointer(pointerPath, value)))(pointer);
  } catch (error) {
    pointerError = error instanceof Error ? error.message : String(error);
  }

  requireMacOS(deps.platform || process.platform);
  const transcriptPath = requireString(input.transcript_path, 'transcript_path');
  if (!transcriptPath.endsWith('.jsonl')) throw new Error('transcript_path must point to a .jsonl file.');
  const context = {
    transcriptPath,
    cwd: requireString(input.cwd, 'cwd'),
    sessionId: requireString(input.session_id, 'session_id'),
    model: optionalString(input.model),
  };
  const prompt = buildClaudeHandoffPrompt(context);
  (deps.copy || copyToClipboard)(prompt);
  try { (deps.notify || notifyHandoff)('Claude handoff copied to clipboard.'); }
  catch { /* notification is optional; the clipboard handoff already succeeded */ }
  const reason = 'Claude handoff copied to clipboard. Switch to Claude Code, paste, and send.';
  return {
    triggered: true,
    prompt,
    pointerError,
    output: { decision: 'block', reason },
  };
}

function buildPointer(input: CodexHookInput, now: Date): CodexLatestPointer {
  const transcriptPath = requireString(input.transcript_path, 'transcript_path');
  if (!transcriptPath.endsWith('.jsonl')) throw new Error('transcript_path must point to a .jsonl file.');
  return {
    schemaVersion: 1,
    sessionId: requireString(input.session_id, 'session_id'),
    transcriptPath,
    cwd: requireString(input.cwd, 'cwd'),
    model: optionalString(input.model),
    turnId: optionalString(input.turn_id),
    updatedAt: now.toISOString(),
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Codex hook input is missing ${field}.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function runCodexHookCli(raw: string, pointerPath: string): number {
  let input: CodexHookInput = {};
  try {
    input = parseCodexHookInput(raw);
    const result = handleCodexHook(input, pointerPath);
    if (result.output) process.stdout.write(JSON.stringify(result.output) + '\n');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isCodexHandoffPrompt(input.prompt)) {
      // This hook runs for every user prompt. Unrelated Codex work must never
      // become unavailable because the hook received an unexpected payload.
      process.stderr.write(`rig handoff from-codex: ${message}\n`);
      return 0;
    }
    // Fail closed so a broken handoff trigger never falls through to a model.
    const reason = `Rig handoff failed before calling Codex: ${message}`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n');
    return 0;
  }
}

export function readCodexHookStdin(maxBytes = 1024 * 1024): string {
  const chunks: Buffer[] = [];
  let total = 0;
  const buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  while ((bytes = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
    total += bytes;
    if (total > maxBytes) throw new Error(`Codex hook input exceeds ${maxBytes} bytes.`);
    chunks.push(Buffer.from(buffer.subarray(0, bytes)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
