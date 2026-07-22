import fs from 'fs';
import os from 'os';
import path from 'path';
import { findLatestCodexTranscript, intakeCodexTranscript, readCodexTranscriptPage } from './codex-transcript';
import { writeCodexLatestPointer } from './codex-pointer';

describe('Codex rollout intake', () => {
  let dir: string;
  let transcript: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-codex-transcript-'));
    transcript = path.join(dir, 'sessions', '2026', '07', '20', 'rollout-root.jsonl');
    fs.mkdirSync(path.dirname(transcript), { recursive: true });
    writeRows(transcript, fixtureRows());
    fs.appendFileSync(transcript, '{malformed\n');
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('recovers dialogue, paired tools, file edits, and unfinished state newest-first', () => {
    const intake = intakeCodexTranscript(transcript, { limit: 20, maxChars: 1000 });
    expect(intake.source).toBe('codex-rollout');
    expect(intake.session).toEqual(expect.objectContaining({ threadId: 'root-id', cwd: '/repo/项目' }));
    expect(intake.stats.malformedLines).toBe(1);
    expect(intake.stats.omitted.reasoning).toBeGreaterThan(0);
    expect(intake.stats.omitted.telemetry).toBeGreaterThan(0);
    expect(intake.compaction).toEqual(expect.objectContaining({ readableCheckpoint: false }));
    expect(intake.currentTurn).toEqual(expect.objectContaining({ turnId: 'turn-1', completed: true, hasFinalAnswer: true }));
    expect(intake.workspaceEvidence.editedFiles).toEqual([
      expect.objectContaining({ path: '/repo/项目/file.ts', changeType: 'update' }),
    ]);

    const entries = intake.page.entries;
    expect(entries[0].line).toBeGreaterThan(entries[entries.length - 1].line);
    expect(entries.filter((entry: any) => entry.type === 'message' && entry.role === 'user')).toHaveLength(1);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-exchange',
        callId: 'call-1',
        tool: 'functions.exec',
        arguments: { cmd: 'git status' },
        output: { ok: true },
      }),
      expect.objectContaining({ type: 'message', role: 'assistant', phase: 'final_answer' }),
    ]));

    const encoded = JSON.stringify(intake);
    expect(encoded).not.toContain('PRIVATE-REASONING');
    expect(encoded).not.toContain('ENCRYPTED-BLOB');
    expect(encoded).not.toContain('DEVELOPER-SECRET');
    expect(encoded).not.toContain('WORLD-SECRET');
    expect(encoded).not.toContain('RATE-SECRET');
  });

  test('uses an exclusive raw-line cursor with stable newest-first pages', () => {
    const first = intakeCodexTranscript(transcript, { limit: 2 });
    expect(first.page.entries).toHaveLength(2);
    expect(first.page.hasOlder).toBe(true);
    const second = intakeCodexTranscript(transcript, { limit: 2, before: first.page.nextBeforeLine });
    expect(second.page.entries.every((entry: any) => entry.line < first.page.nextBeforeLine)).toBe(true);
  });

  test('diagnostic read also omits private/runtime-only rows', () => {
    const page = readCodexTranscriptPage(transcript, { limit: 100 });
    const encoded = JSON.stringify(page);
    expect(encoded).not.toContain('PRIVATE-REASONING');
    expect(encoded).not.toContain('DEVELOPER-SECRET');
    expect(encoded).not.toContain('WORLD-SECRET');
    expect(encoded).toContain('tool-call');
  });

  test('latest selection prefers the saved pointer and excludes child rollouts', () => {
    const sessions = path.join(dir, 'sessions');
    const child = path.join(sessions, '2026', '07', '20', 'rollout-child-id.jsonl');
    writeRows(child, [{
      timestamp: '2026-07-20T02:00:00Z',
      type: 'session_meta',
      payload: { id: 'child-id', session_id: 'root-id', cwd: '/repo/项目', parent_thread_id: 'root-id', agent_path: '/root/review' },
    }]);
    const future = new Date(Date.now() + 10000);
    fs.utimesSync(child, future, future);
    const childBySource = path.join(sessions, '2026', '07', '20', 'rollout-child-source.jsonl');
    writeRows(childBySource, [{
      timestamp: '2026-07-20T02:01:00Z',
      type: 'session_meta',
      payload: { id: 'child-source', cwd: '/repo/项目', parent_thread_id: 'root-id', thread_source: 'subagent' },
    }]);
    const fartherFuture = new Date(Date.now() + 20000);
    fs.utimesSync(childBySource, fartherFuture, fartherFuture);

    const pointer = path.join(dir, 'handoff', 'codex-latest.json');
    writeCodexLatestPointer(pointer, {
      schemaVersion: 1,
      sessionId: 'root-id',
      transcriptPath: transcript,
      cwd: '/repo/current',
      updatedAt: '2026-07-20T02:00:00Z',
    });
    expect(findLatestCodexTranscript(sessions, '/repo/current', pointer)).toBe(transcript);
    expect(findLatestCodexTranscript(sessions, '/repo/项目')).toBe(transcript);
    expect(findLatestCodexTranscript(sessions, '/different')).toBeNull();
  });

  test('trusts an exact live pointer before its JSONL has been flushed', () => {
    const sessions = path.join(dir, 'sessions');
    const notFlushed = path.join(sessions, '2026', '07', '20', 'rollout-live.jsonl');
    const pointer = path.join(dir, 'handoff', 'codex-latest.json');
    writeCodexLatestPointer(pointer, {
      schemaVersion: 1,
      sessionId: 'live-id',
      transcriptPath: notFlushed,
      cwd: '/repo/live',
      updatedAt: new Date().toISOString(),
    });

    expect(fs.existsSync(notFlushed)).toBe(false);
    expect(findLatestCodexTranscript(sessions, '/repo/live', pointer)).toBe(notFlushed);
  });

  test('ignores a stale pointer whose rollout no longer exists', () => {
    const sessions = path.join(dir, 'empty-sessions');
    const missing = path.join(sessions, 'rollout-deleted.jsonl');
    const pointer = path.join(dir, 'handoff', 'codex-latest.json');
    writeCodexLatestPointer(pointer, {
      schemaVersion: 1,
      sessionId: 'deleted-id',
      transcriptPath: missing,
      cwd: '/repo/deleted',
      updatedAt: '2020-01-01T00:00:00Z',
    });

    expect(findLatestCodexTranscript(sessions, '/repo/deleted', pointer)).toBeNull();
  });

  test('keeps user-created forked root sessions in scan fallback', () => {
    const sessions = path.join(dir, 'sessions');
    const fork = path.join(sessions, '2026', '07', '20', 'rollout-user-fork.jsonl');
    writeRows(fork, [{
      timestamp: '2026-07-20T04:00:00Z',
      type: 'session_meta',
      payload: { id: 'fork-id', cwd: '/repo/fork', forked_from_id: 'root-id' },
    }]);
    const future = new Date(Date.now() + 20000);
    fs.utimesSync(fork, future, future);

    expect(findLatestCodexTranscript(sessions, '/repo/fork')).toBe(fork);
  });

  test('does not let an old explicit pointer mask a newer root rollout', () => {
    const sessions = path.join(dir, 'sessions');
    const newer = path.join(sessions, '2026', '07', '20', 'rollout-newer-root.jsonl');
    writeRows(newer, [{
      timestamp: '2026-07-20T05:00:00Z',
      type: 'session_meta',
      payload: { id: 'newer-id', cwd: '/repo/项目' },
    }]);
    const future = new Date(Date.now() + 30000);
    fs.utimesSync(newer, future, future);
    const pointer = path.join(dir, 'handoff', 'codex-latest.json');
    writeCodexLatestPointer(pointer, {
      schemaVersion: 1,
      sessionId: 'root-id',
      transcriptPath: transcript,
      cwd: '/repo/项目',
      updatedAt: '2020-01-01T00:00:00Z',
    });

    expect(findLatestCodexTranscript(sessions, '/repo/项目', pointer)).toBe(newer);
  });

  test('keeps a fresh explicit handoff pointer authoritative within the same cwd', () => {
    const sessions = path.join(dir, 'sessions');
    const otherTask = path.join(sessions, '2026', '07', '20', 'rollout-other-task.jsonl');
    writeRows(otherTask, [{ type: 'session_meta', payload: { id: 'other-task', cwd: '/repo/项目' } }]);
    const future = new Date(Date.now() + 30000);
    fs.utimesSync(otherTask, future, future);
    const pointer = path.join(dir, 'handoff', 'codex-latest.json');
    writeCodexLatestPointer(pointer, {
      schemaVersion: 1,
      sessionId: 'root-id',
      transcriptPath: transcript,
      cwd: '/repo/项目',
      updatedAt: new Date().toISOString(),
    });

    expect(findLatestCodexTranscript(sessions, '/repo/项目', pointer)).toBe(transcript);
  });

  test('ignores newer metadata-less JSONL files during scan fallback', () => {
    const sessions = path.join(dir, 'sessions');
    const empty = path.join(sessions, '2026', '07', '20', 'rollout-unclassified.jsonl');
    fs.writeFileSync(empty, '{}\n');
    const future = new Date(Date.now() + 40000);
    fs.utimesSync(empty, future, future);

    expect(findLatestCodexTranscript(sessions, '/repo/项目')).toBe(transcript);
  });

  test('labels an interrupted current turn and retains safe search/image evidence', () => {
    const file = path.join(dir, 'sessions', '2026', '07', '20', 'rollout-aborted.jsonl');
    const metadata = { internal_chat_message_metadata_passthrough: { turn_id: 'turn-aborted' } };
    writeRows(file, [
      { type: 'session_meta', payload: { id: 'aborted-id', cwd: '/repo/aborted' } },
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-aborted' } },
      { type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: '分析图片并检索资料' }], ...metadata,
      } },
      { type: 'event_msg', payload: {
        type: 'user_message', turn_id: 'turn-aborted', message: '分析图片并检索资料',
        local_images: ['/repo/aborted/screen.png', 'https://example.com/remote.png', 'data:image/png;base64,SECRET-IMAGE'],
      } },
      { type: 'response_item', payload: {
        type: 'web_search_call', id: 'search-1', status: 'completed',
        action: { type: 'search', query: 'Codex hooks' }, ...metadata,
      } },
      { type: 'response_item', payload: {
        type: 'tool_search_call', call_id: 'tools-1', status: 'completed',
        arguments: '{"query":"browser"}', ...metadata,
      } },
      { type: 'response_item', payload: {
        type: 'tool_search_output', call_id: 'tools-1', status: 'completed',
        tools: [{ name: 'browser.open', description: 'TOOL-DEFINITION-SECRET' }], ...metadata,
      } },
      { type: 'event_msg', payload: {
        type: 'image_generation_end', turn_id: 'turn-aborted', call_id: 'image-1',
        status: 'completed', saved_path: '/repo/aborted/generated.png', result: 'OPAQUE-IMAGE-SECRET',
      } },
      { type: 'event_msg', payload: {
        type: 'turn_aborted', turn_id: 'turn-aborted', reason: 'interrupted',
        started_at: 1784527200, completed_at: 1784527201.5, duration_ms: 321,
      } },
    ]);

    const intake = intakeCodexTranscript(file, { limit: 50 });
    expect(intake.currentTurn).toEqual(expect.objectContaining({
      turnId: 'turn-aborted', aborted: true, abortReason: 'interrupted', completed: false,
    }));
    expect(intake.page.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'turn-aborted',
        startedAt: '2026-07-20T06:00:00.000Z',
        completedAt: '2026-07-20T06:00:01.500Z',
      }),
    ]));
    expect(intake.page.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'message', role: 'user',
        localImages: [{ path: '/repo/aborted/screen.png' }],
      }),
      expect.objectContaining({ type: 'web-search', action: { type: 'search', query: 'Codex hooks' } }),
      expect.objectContaining({
        type: 'tool-exchange', tool: 'tool_search',
        output: { status: 'completed', tools: { count: 1, names: ['browser.open'] } },
      }),
      expect.objectContaining({ type: 'generated-image', savedPath: '/repo/aborted/generated.png' }),
      expect.objectContaining({ type: 'turn-aborted', reason: 'interrupted' }),
    ]));
    const encoded = JSON.stringify(intake);
    expect(encoded).not.toContain('TOOL-DEFINITION-SECRET');
    expect(encoded).not.toContain('OPAQUE-IMAGE-SECRET');
    expect(encoded).not.toContain('SECRET-IMAGE');
  });

  test('excludes rolled-back dialogue from the current resumable state', () => {
    const file = path.join(dir, 'sessions', '2026', '07', '20', 'rollout-rollback.jsonl');
    const meta = (turnId: string) => ({ internal_chat_message_metadata_passthrough: { turn_id: turnId } });
    writeRows(file, [
      { type: 'session_meta', payload: { id: 'rollback-id', cwd: '/repo/rollback' } },
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-kept' } },
      { type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: '保留的任务' }], ...meta('turn-kept'),
      } },
      { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-kept' } },
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-stale' } },
      { type: 'response_item', payload: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: 'STALE-ROLLED-BACK-REQUEST' }], ...meta('turn-stale'),
      } },
      { type: 'event_msg', payload: {
        type: 'patch_apply_end', turn_id: 'turn-stale', success: true,
        changes: { '/repo/rollback/stale.ts': { type: 'update' } },
      } },
      { type: 'event_msg', payload: { type: 'turn_aborted', turn_id: 'turn-stale', reason: 'interrupted' } },
      { type: 'event_msg', payload: { type: 'thread_rolled_back', num_turns: 1 } },
    ]);

    const intake = intakeCodexTranscript(file, { limit: 50 });
    expect(intake.currentTurn).toEqual(expect.objectContaining({
      turnId: 'turn-kept', completed: true, aborted: false,
    }));
    expect(intake.rollbacks).toEqual(expect.objectContaining({
      count: 1,
      excludedTurnIds: ['turn-stale'],
    }));
    expect(JSON.stringify(intake.page.entries)).not.toContain('STALE-ROLLED-BACK-REQUEST');
    expect(intake.workspaceEvidence.editedFiles).toEqual([
      expect.objectContaining({ path: '/repo/rollback/stale.ts', rolledBack: true }),
    ]);
  });
});

function writeRows(file: string, rows: any[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}

function fixtureRows(): any[] {
  const metadata = { internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' } };
  return [
    { timestamp: '2026-07-20T01:00:00Z', type: 'session_meta', payload: {
      id: 'root-id', session_id: 'root-id', cwd: '/repo/项目', cli_version: '0.137.0',
      base_instructions: 'DEVELOPER-SECRET', dynamic_tools: ['SECRET-TOOL'],
    } },
    { timestamp: '2026-07-20T01:00:01Z', type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } },
    { timestamp: '2026-07-20T01:00:02Z', type: 'response_item', payload: {
      type: 'message', role: 'user', content: [{ type: 'input_text', text: '实现双向交接' }], ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:03Z', type: 'event_msg', payload: { type: 'user_message', message: '实现双向交接', turn_id: 'turn-1' } },
    { timestamp: '2026-07-20T01:00:04Z', type: 'response_item', payload: {
      type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'DEVELOPER-SECRET' }], ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:05Z', type: 'response_item', payload: {
      type: 'reasoning', summary: [{ text: 'PRIVATE-REASONING' }], encrypted_content: 'ENCRYPTED-BLOB', ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:06Z', type: 'response_item', payload: {
      type: 'function_call', namespace: 'functions', name: 'exec', arguments: '{"cmd":"git status"}', call_id: 'call-1', ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:07Z', type: 'response_item', payload: {
      type: 'function_call_output', call_id: 'call-1', output: { ok: true }, ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:08Z', type: 'event_msg', payload: {
      type: 'patch_apply_end', call_id: 'patch-1', turn_id: 'turn-1', success: true, status: 'completed',
      changes: { '/repo/项目/file.ts': { type: 'update', content: 'DIFF-SECRET' } },
    } },
    { timestamp: '2026-07-20T01:00:09Z', type: 'world_state', payload: { full: 'WORLD-SECRET' } },
    { timestamp: '2026-07-20T01:00:10Z', type: 'event_msg', payload: { type: 'token_count', rate_limits: 'RATE-SECRET' } },
    { timestamp: '2026-07-20T01:00:11Z', type: 'compacted', payload: { replacement_history: [{ encrypted_content: 'ENCRYPTED-BLOB' }] } },
    { timestamp: '2026-07-20T01:00:12Z', type: 'response_item', payload: {
      type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: '正在处理' }], ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:13Z', type: 'response_item', payload: {
      type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: '完成实现' }], ...metadata,
    } },
    { timestamp: '2026-07-20T01:00:14Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } },
  ];
}
