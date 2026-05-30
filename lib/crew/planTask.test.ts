import fs from 'fs';
import os from 'os';
import path from 'path';
import { parsePlanTask, readPlanTasks, selectDispatchable, writeTaskStatus, stampTaskDone, buildTaskPrompt } from './planTask';

const TASK = (over: Record<string, string> = {}) => [
  '---',
  `id: ${over.id || 'wiki-014'}`,
  'type: task',
  `status: ${over.status || 'ready'}`,
  over.engine ? `engine: ${over.engine}` : 'role: coder',
  over.deps ? `depends-on: [${over.deps}]` : 'depends-on: []',
  '---',
  '# wiki ingest 去重',
  '',
  '- objective: dedupe by source_sha',
].join('\n');

describe('parsePlanTask', () => {
  it('parses frontmatter + title + deps', () => {
    const t = parsePlanTask('/x/wiki-014.md', TASK({ deps: 'a-1, b-2' }));
    expect(t).not.toBeNull();
    expect(t!.id).toBe('wiki-014');
    expect(t!.status).toBe('ready');
    expect(t!.role).toBe('coder');
    expect(t!.dependsOn).toEqual(['a-1', 'b-2']);
    expect(t!.title).toBe('wiki ingest 去重');
  });
  it('reads engine override', () => {
    const t = parsePlanTask('/x/t.md', TASK({ engine: 'codex' }));
    expect(t!.engine).toBe('codex');
  });
  it('returns null without frontmatter', () => {
    expect(parsePlanTask('/x/t.md', '# no frontmatter')).toBeNull();
  });
});

describe('selectDispatchable', () => {
  const mk = (id: string, status: string, dependsOn: string[] = []) =>
    ({ id, status, dependsOn, file: `${id}.md`, title: id, body: '', frontmatter: {} } as any);

  it('picks ready tasks with no deps', () => {
    const out = selectDispatchable([mk('a', 'ready'), mk('b', 'pending'), mk('c', 'done')]);
    expect(out.map(t => t.id)).toEqual(['a']);
  });
  it('blocks ready tasks whose deps are not done', () => {
    const out = selectDispatchable([mk('a', 'ready', ['b']), mk('b', 'in-progress')]);
    expect(out).toEqual([]);
  });
  it('unblocks when deps are done/shipped', () => {
    const out = selectDispatchable([mk('a', 'ready', ['b', 'c']), mk('b', 'done'), mk('c', 'shipped')]);
    expect(out.map(t => t.id)).toEqual(['a']);
  });
  it('treats unknown dep as unsatisfied', () => {
    expect(selectDispatchable([mk('a', 'ready', ['ghost'])])).toEqual([]);
  });
});

describe('writeTaskStatus + readPlanTasks (fs)', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-plan-'));
    fs.mkdirSync(path.join(dir, 'docs', 'plan', 'tasks', 'archived'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/plan/tasks/wiki-014.md'), TASK());
    fs.writeFileSync(path.join(dir, 'docs/plan/tasks/cic-007.md'), TASK({ id: 'cic-007', status: 'pending' }));
  });
  afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('reads all task files', () => {
    const tasks = readPlanTasks(dir);
    expect(tasks.map(t => t.id).sort()).toEqual(['cic-007', 'wiki-014']);
  });
  it('writes status surgically in frontmatter', () => {
    const f = path.join(dir, 'docs/plan/tasks/wiki-014.md');
    writeTaskStatus(f, 'in-progress');
    expect(parsePlanTask(f, fs.readFileSync(f, 'utf8'))!.status).toBe('in-progress');
    writeTaskStatus(f, 'done');
    expect(parsePlanTask(f, fs.readFileSync(f, 'utf8'))!.status).toBe('done');
  });
  it('throws if no status field', () => {
    const f = path.join(dir, 'nofm.md');
    fs.writeFileSync(f, '---\nid: x\n---\nbody');
    expect(() => writeTaskStatus(f, 'done')).toThrow(/status field not found/);
  });

  it('stampTaskDone sets status done + inserts done-at', () => {
    const f = path.join(dir, 'docs/plan/tasks/cic-007.md');
    stampTaskDone(f, '2026-06-01');
    const t = parsePlanTask(f, fs.readFileSync(f, 'utf8'))!;
    expect(t.status).toBe('done');
    expect(t.doneAt).toBe('2026-06-01');
    // idempotent re-stamp updates the date in place (no duplicate field)
    stampTaskDone(f, '2026-06-02');
    const raw = fs.readFileSync(f, 'utf8');
    expect((raw.match(/done-at:/g) || []).length).toBe(1);
    expect(parsePlanTask(f, raw)!.doneAt).toBe('2026-06-02');
  });

  it('readPlanTasks includes archived only when asked', () => {
    fs.writeFileSync(path.join(dir, 'docs/plan/tasks/archived/old-1.md'), TASK({ id: 'old-1', status: 'done' }));
    expect(readPlanTasks(dir).map(t => t.id)).not.toContain('old-1');
    expect(readPlanTasks(dir, { includeArchived: true }).map(t => t.id)).toContain('old-1');
  });
});

describe('buildTaskPrompt', () => {
  it('includes id, title, role, and body', () => {
    const t = parsePlanTask('/x/wiki-014.md', TASK())!;
    const p = buildTaskPrompt(t);
    expect(p).toContain('wiki-014');
    expect(p).toContain('coder');
    expect(p).toContain('objective: dedupe by source_sha');
  });
});
