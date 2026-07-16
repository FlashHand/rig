import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildHandoffPrompt } from './prompt';
import { handleHook, parseHookInput } from './hook';

describe('handoff hook', () => {
  let dir: string;
  let transcript: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-handoff-hook-'));
    transcript = path.join(dir, 'session.jsonl');
    fs.writeFileSync(transcript, '{}\n');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('manual slash command copies a prompt and blocks model expansion', () => {
    const copied: string[] = [];
    const result = handleHook({
      hook_event_name: 'UserPromptExpansion',
      command_name: 'handoff',
      transcript_path: transcript,
      cwd: '/tmp/project with spaces',
      session_id: 'abc123',
    }, { platform: 'darwin', copy: value => copied.push(value) });

    expect(result.output).toEqual(expect.objectContaining({ decision: 'block' }));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain('$rig-from-claude');
    expect(copied[0]).toContain(`transcript_path: ${transcript}`);
    expect(copied[0]).toContain('session_id: abc123');
  });

  test('StopFailure copies the same handoff and notifies without decision output', () => {
    const copied: string[] = [];
    const notifications: string[] = [];
    const result = handleHook({
      hook_event_name: 'StopFailure',
      transcript_path: transcript,
      cwd: '/tmp/project',
      session_id: 'abc123',
      error: 'rate_limit',
    }, {
      platform: 'darwin',
      copy: value => copied.push(value),
      notify: value => notifications.push(value),
    });

    expect(result.output).toBeUndefined();
    expect(copied[0]).toContain('claude_stop_error: rate_limit');
    expect(notifications).toHaveLength(1);
  });

  test('accepts the transcript path before Claude flushes its first line', () => {
    const notYetCreated = path.join(dir, 'future-session.jsonl');
    const copied: string[] = [];
    const result = handleHook({
      hook_event_name: 'UserPromptExpansion',
      command_name: 'handoff',
      transcript_path: notYetCreated,
      cwd: '/tmp/project',
      session_id: 'future',
    }, { platform: 'darwin', copy: value => copied.push(value) });
    expect(result.output && result.output.decision).toBe('block');
    expect(copied[0]).toContain(notYetCreated);
  });

  test('rejects a different slash command and non-macOS', () => {
    expect(() => handleHook({
      hook_event_name: 'UserPromptExpansion',
      command_name: 'other',
      transcript_path: transcript,
      cwd: '/tmp',
      session_id: 'abc',
    }, { platform: 'darwin', copy: () => undefined })).toThrow('unexpected slash command');

    expect(() => handleHook({
      hook_event_name: 'StopFailure',
      transcript_path: transcript,
      cwd: '/tmp',
      session_id: 'abc',
    }, { platform: 'linux', copy: () => undefined })).toThrow('macOS only');
  });

  test('parses JSON input and creates deterministic prompt text', () => {
    expect(parseHookInput('{"session_id":"x"}')).toEqual({ session_id: 'x' });
    expect(() => parseHookInput('nope')).toThrow('not valid JSON');
    expect(buildHandoffPrompt({ transcriptPath: '/a.jsonl', cwd: '/repo', sessionId: 's' }))
      .toContain('cwd: /repo');
  });
});
