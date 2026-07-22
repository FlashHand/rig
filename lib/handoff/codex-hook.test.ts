import fs from 'fs';
import os from 'os';
import path from 'path';
import { handleCodexHook, isCodexHandoffPrompt, parseCodexHookInput } from './codex-hook';
import { readCodexLatestPointer } from './codex-pointer';

describe('Codex to Claude handoff hook', () => {
  let dir: string;
  let transcript: string;
  let pointer: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-codex-hook-'));
    transcript = path.join(dir, 'rollout-会话.jsonl');
    pointer = path.join(dir, 'handoff', 'codex-latest.json');
    fs.writeFileSync(transcript, '{}\n');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('ordinary root or subagent prompts never replace the handoff pointer', () => {
    const result = handleCodexHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'continue implementation',
      transcript_path: transcript,
      cwd: '/tmp/项目',
      session_id: 'thread-1',
      turn_id: 'turn-1',
      model: 'gpt-test',
    }, pointer, { platform: 'darwin', now: () => new Date('2026-07-20T01:02:03Z') });

    expect(result.triggered).toBe(false);
    expect(result.output).toBeUndefined();
    expect(readCodexLatestPointer(pointer)).toBeNull();
  });

  test('exact skill trigger copies a UTF-8 Claude prompt and stops the model call', () => {
    const copied: string[] = [];
    const notified: string[] = [];
    const result = handleCodexHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: '  $handoff\n',
      transcript_path: transcript,
      cwd: '/tmp/项目',
      session_id: 'thread-中文',
      model: 'gpt-test',
    }, pointer, {
      platform: 'darwin',
      copy: value => copied.push(value),
      notify: value => notified.push(value),
    });

    expect(result.triggered).toBe(true);
    expect(result.output).toEqual(expect.objectContaining({ decision: 'block' }));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain('rig-from-codex');
    expect(copied[0]).toContain(`transcript_path: ${transcript}`);
    expect(copied[0]).toContain('cwd: /tmp/项目');
    expect(copied[0]).toContain('session_id: thread-中文');
    expect(notified).toHaveLength(1);
    expect(readCodexLatestPointer(pointer)).toEqual(expect.objectContaining({
      transcriptPath: transcript,
      cwd: '/tmp/项目',
      sessionId: 'thread-中文',
    }));
    expect(fs.statSync(pointer).mode & 0o777).toBe(0o600);
  });

  test('accepts a transcript path before the first rollout line is flushed', () => {
    const future = path.join(dir, 'future.jsonl');
    const result = handleCodexHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: '$handoff',
      transcript_path: future,
      cwd: '/tmp/project',
      session_id: 'future',
    }, pointer, { platform: 'darwin', copy: () => undefined, notify: () => undefined });
    expect(result.output && result.output.decision).toBe('block');
    expect(readCodexLatestPointer(pointer)?.transcriptPath).toBe(future);
  });

  test('an unrelated prompt never invokes pointer persistence', () => {
    let writes = 0;
    const result = handleCodexHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'normal work',
      transcript_path: transcript,
      cwd: '/tmp',
      session_id: 'x',
    }, pointer, { writePointer: () => { writes++; throw new Error('disk full'); } });
    expect(result.triggered).toBe(false);
    expect(result.pointerError).toBeUndefined();
    expect(writes).toBe(0);
  });

  test('trigger validation is exact and macOS-only', () => {
    expect(isCodexHandoffPrompt('$handoff please')).toBe(false);
    expect(isCodexHandoffPrompt('/handoff')).toBe(true);
    expect(isCodexHandoffPrompt('Use $handoff to copy this session for the other coding agent to continue.')).toBe(true);
    expect(() => handleCodexHook({
      hook_event_name: 'UserPromptSubmit',
      prompt: '$handoff',
      transcript_path: transcript,
      cwd: '/tmp',
      session_id: 'x',
    }, pointer, { platform: 'linux', copy: () => undefined })).toThrow('macOS only');
  });

  test('parses JSON objects only', () => {
    expect(parseCodexHookInput('{"prompt":"x"}')).toEqual({ prompt: 'x' });
    expect(() => parseCodexHookInput('[]')).toThrow('JSON object');
    expect(() => parseCodexHookInput('nope')).toThrow('not valid JSON');
  });
});
