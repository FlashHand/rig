import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseEntityMap, writeJournalSection } from './journal';

const INDEX = `# Journal Index

## Entities

### micromeet
- Projects: [micromeet-mono](../projects/micromeet-mono/) · [demo-center](../projects/demo-center/)
- Log: [micromeet/2605.md](micromeet/2605.md)

### ral
- Projects: [rig](../projects/rig/)

## Conventions
- one dir per entity
`;

describe('parseEntityMap', () => {
  it('maps entities (###) to their project names', () => {
    const m = parseEntityMap(INDEX);
    expect(m.get('micromeet')).toEqual(['micromeet-mono', 'demo-center']);
    expect(m.get('ral')).toEqual(['rig']);
    expect(m.has('Conventions')).toBe(false); // ## heading, not an entity
  });
});

describe('writeJournalSection', () => {
  let vault: string;
  beforeAll(() => { vault = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-jnl-')); });
  afterAll(() => { try { fs.rmSync(vault, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('creates entity file + day section + ✅ bullets', () => {
    const n = writeJournalSection(vault, 'micromeet', '2026-06-01', [
      { id: 'api-007', title: 'followup draft', project: 'micromeet-mono' },
    ]);
    expect(n).toBe(1);
    const content = fs.readFileSync(path.join(vault, 'journal/micromeet/2606.md'), 'utf8');
    expect(content).toContain('## 2026-06-01');
    expect(content).toContain('✅ api-007 followup draft [project:: micromeet-mono]');
  });

  it('is idempotent by task id (re-run adds only new)', () => {
    const n = writeJournalSection(vault, 'micromeet', '2026-06-01', [
      { id: 'api-007', title: 'followup draft', project: 'micromeet-mono' },
      { id: 'api-008', title: 'new one', project: 'micromeet-mono' },
    ]);
    expect(n).toBe(1); // only api-008 is new
    const content = fs.readFileSync(path.join(vault, 'journal/micromeet/2606.md'), 'utf8');
    expect((content.match(/api-007/g) || []).length).toBe(1);
    expect(content).toContain('api-008');
  });
});
