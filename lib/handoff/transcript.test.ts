import fs from 'fs';
import os from 'os';
import path from 'path';
import { findLatestTranscript, inspectTranscript, intakeTranscript, iterateTranscript, readTranscriptPage } from './transcript';

describe('Claude transcript reader', () => {
  let root: string;
  let transcript: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-handoff-transcript-'));
    transcript = path.join(root, 'session.jsonl');
    const rows = [
      { type: 'custom-title', customTitle: 'Ship feature', sessionId: 's1' },
      { type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-07-15T00:00:00Z', cwd: '/repo', gitBranch: 'main', sessionId: 's1', version: '2.1.161', message: { role: 'user', content: 'Implement it' } },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-07-15T00:00:01Z', cwd: '/repo', sessionId: 's1', message: { id: 'm1', role: 'assistant', model: 'claude-test', usage: { input_tokens: 10 }, content: [
        { type: 'thinking', thinking: 'private reasoning', signature: 'secret' },
        { type: 'text', text: 'Working now' },
        { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/repo/a.ts', new_string: 'x'.repeat(400) } },
      ] } },
      { type: 'assistant', uuid: 'a1b', parentUuid: 'a1', timestamp: '2026-07-15T00:00:01.250Z', cwd: '/repo', sessionId: 's1', message: { id: 'm1', role: 'assistant', model: 'claude-test', content: [
        { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/repo/b.ts' } },
      ] } },
      { type: 'user', uuid: 'old1', parentUuid: 'a1', timestamp: '2026-07-15T00:00:01.500Z', cwd: '/repo', sessionId: 's1', isCompactSummary: true, message: { role: 'user', content: 'Abandoned branch summary' } },
      { type: 'user', uuid: 'u2', parentUuid: 'a1', timestamp: '2026-07-15T00:00:02Z', cwd: '/repo', sessionId: 's1', toolUseResult: { filePath: '/repo/a.ts', oldString: 'old', newString: 'new' }, message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'updated' },
      ] } },
      { type: 'user', uuid: 'u2b', parentUuid: 'a1b', timestamp: '2026-07-15T00:00:02.500Z', cwd: '/repo', sessionId: 's1', sourceToolAssistantUUID: 'a1b', toolUseResult: { filePath: '/repo/b.ts', type: 'text' }, message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't2', content: 'parallel result' },
      ] } },
      { type: 'user', uuid: 'u3', parentUuid: 'u2', timestamp: '2026-07-15T00:00:03Z', cwd: '/repo', sessionId: 's1', isCompactSummary: true, message: { role: 'user', content: 'Earlier context summary' } },
      { type: 'last-prompt', sessionId: 's1', lastPrompt: 'Continue publishing', leafUuid: 'u3' },
    ];
    fs.writeFileSync(transcript, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('streams lines and builds a useful manifest', () => {
    expect(Array.from(iterateTranscript(transcript))).toHaveLength(9);
    const manifest = inspectTranscript(transcript, { recent: 8, maxChars: 256 });
    expect(manifest.lines).toBe(9);
    expect(manifest.session).toEqual(expect.objectContaining({
      sessionId: 's1',
      cwd: '/repo',
      title: 'Ship feature',
      models: ['claude-test'],
    }));
    expect(manifest.tools).toEqual({ Edit: 1, Read: 1 });
    expect(manifest.lastPrompt).toBe('Continue publishing');
    expect(manifest.compactSummaries).toHaveLength(2);
    expect(manifest.compactSummaries.find((entry: any) => entry.uuid === 'old1').branch).toBe('non-lineage');
    expect(manifest.compactSummaries.find((entry: any) => entry.uuid === 'u3').branch).toBe('active');
    expect(manifest.branch).toEqual(expect.objectContaining({ activeUuids: 6, nonLineageUuids: 1 }));
    expect(manifest.recent.find((entry: any) => entry.uuid === 'old1'))
      .toEqual(expect.objectContaining({ branch: 'non-lineage' }));
    expect(manifest.recent.find((entry: any) => entry.uuid === 'u2b'))
      .toEqual(expect.objectContaining({ branch: 'active' }));
  });

  test('pages by raw JSONL line and omits private thinking', () => {
    const first = readTranscriptPage(transcript, { from: 1, limit: 3, maxChars: 256 });
    expect(first.hasMore).toBe(true);
    expect(first.nextLine).toBe(4);
    expect(first.entries).toHaveLength(3);
    const assistant = first.entries[2];
    expect(assistant.content[0]).toEqual(expect.objectContaining({ type: 'thinking', omitted: true }));
    expect(JSON.stringify(assistant)).not.toContain('private reasoning');
    expect(JSON.stringify(assistant)).not.toContain('secret');
    expect(JSON.stringify(assistant)).toContain('truncated');

    const second = readTranscriptPage(transcript, { from: first.nextLine, limit: 20 });
    expect(second.hasMore).toBe(false);
    expect(second.entries.find((entry: any) => entry.uuid === 'u2').toolUseResult)
      .toEqual(expect.objectContaining({ filePath: '/repo/a.ts', oldString: 'old' }));
    expect(second.entries.find((entry: any) => entry.uuid === 'old1').branch).toBe('non-lineage');
    expect(second.entries.find((entry: any) => entry.uuid === 'u2b').branch).toBe('active');
    expect(second.entries.find((entry: any) => entry.uuid === 'u3').isCompactSummary).toBe(true);
  });

  test('intakes meaningful evidence newest-first without thinking or telemetry noise', () => {
    fs.appendFileSync(transcript, [
      { type: 'user', uuid: 'control-u', parentUuid: 'u3', message: { role: 'user', content: [{ type: 'text', text: 'Continue from where you left off.' }] } },
      { type: 'assistant', uuid: 'control-a', parentUuid: 'control-u', message: { role: 'assistant', content: [{ type: 'text', text: 'No response requested.' }] } },
      { type: 'system', uuid: 'control-s', parentUuid: 'control-a', subtype: 'informational', level: 'warning', content: 'UserPromptExpansion operation blocked by hook' },
    ].map(row => JSON.stringify(row)).join('\n') + '\n');
    const first = intakeTranscript(transcript, { limit: 2, maxChars: 256 });
    expect(first.schemaVersion).toBe(2);
    expect(first.lastPrompt).toBe('Continue publishing');
    expect(first.checkpoint).toEqual(expect.objectContaining({
      uuid: 'u3',
      branch: 'active',
      summary: 'Earlier context summary',
    }));
    expect(first.stats).toEqual(expect.objectContaining({
      recoverableEntries: 5,
      compactSummaries: 2,
      omittedThinkingBlocks: 1,
    }));
    expect(first.page.direction).toBe('newest-to-oldest');
    expect(first.page.entries.map((entry: any) => entry.uuid)).toEqual(['u2b', 'u2']);
    expect(first.page.nextBeforeLine).toBe(6);
    expect(first.branch.leafUuid).toBe('control-s');
    expect(JSON.stringify(first)).not.toContain('private reasoning');
    expect(JSON.stringify(first)).not.toContain('input_tokens');
    expect(JSON.stringify(first)).not.toContain('No response requested');
    expect(JSON.stringify(first)).not.toContain('operation blocked by hook');
    expect(first.workspaceEvidence.editedFiles).toContainEqual({ path: '/repo/a.ts', line: 6 });

    const second = intakeTranscript(transcript, { before: first.page.nextBeforeLine, limit: 2, maxChars: 256 });
    expect(second.page.entries.map((entry: any) => entry.uuid)).toEqual(['a1b', 'a1']);
    expect(second.page.nextBeforeLine).toBe(3);
    const assistant = second.page.entries.find((entry: any) => entry.uuid === 'a1');
    expect(assistant.content.map((block: any) => block.type)).toEqual(['text', 'tool_use']);
    expect(assistant.model).toBeUndefined();
    expect(assistant.usage).toBeUndefined();

    const third = intakeTranscript(transcript, { before: second.page.nextBeforeLine, limit: 2 });
    expect(third.page.entries.map((entry: any) => entry.uuid)).toEqual(['u1']);
    expect(third.page.hasOlder).toBe(false);
    expect(third.page.nextBeforeLine).toBeNull();
  });

  test('finds the latest transcript and filters by cwd', () => {
    const other = path.join(root, 'other.jsonl');
    fs.writeFileSync(other, JSON.stringify({ type: 'user', cwd: '/other', message: { content: 'x' } }) + '\n');
    const future = new Date(Date.now() + 10000);
    fs.utimesSync(other, future, future);
    expect(findLatestTranscript(root)).toBe(other);
    expect(findLatestTranscript(root, '/repo')).toBe(transcript);
    expect(findLatestTranscript(root, '/missing')).toBeNull();
  });
});
