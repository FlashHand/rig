import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectRollup, fmtCounts } from './rollup';

describe('fmtCounts', () => {
  it('orders known statuses and appends unknown ones', () => {
    expect(fmtCounts({ done: 2, ready: 1 })).toBe('ready:1 done:2');
    expect(fmtCounts({ weird: 3 })).toBe('weird:3');
    expect(fmtCounts({})).toBe('—');
  });
});

describe('collectRollup', () => {
  let vault: string;
  let proj: string;
  beforeAll(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-roll-v-'));
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-roll-p-'));
    fs.mkdirSync(path.join(vault, 'journal'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'journal/INDEX.md'),
      '## Entities\n### demo\n- Projects: [proj](../projects/proj/) · [ghost](../projects/ghost/)\n');
    fs.mkdirSync(path.join(proj, 'docs/plan/tasks'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'docs/plan/tasks/a.md'), '---\nid: a\nstatus: ready\n---\n# a');
    fs.writeFileSync(path.join(proj, 'docs/plan/tasks/b.md'), '---\nid: b\nstatus: done\n---\n# b');
  });
  afterAll(() => { for (const d of [vault, proj]) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('rolls up task statuses per project and flags unregistered projects', () => {
    const roll = collectRollup(vault, new Map([['proj', proj]]));
    expect(roll).toHaveLength(1);
    const demo = roll[0];
    expect(demo.entity).toBe('demo');
    const p = demo.projects.find(x => x.name === 'proj')!;
    expect(p.registered).toBe(true);
    expect(p.counts).toEqual({ ready: 1, done: 1 });
    expect(p.total).toBe(2);
    const ghost = demo.projects.find(x => x.name === 'ghost')!;
    expect(ghost.registered).toBe(false);
    expect(ghost.total).toBe(0);
  });
});
