import fs from 'fs';
import path from 'path';
import print from '../print';
import { requireCrew } from '../crew/config';
import { readPlanTasks } from '../crew/planTask';

// `rig om journal [date]` — jrnl-A. Source = task status only (jrnl-B decision): aggregate
// tasks with status `done` + `done-at == date` from each entity's projects' docs/plan/tasks,
// into journal/<entity>/<YYMM>.md. Entity→project map is parsed from journal/INDEX.md.

/** Parse journal/INDEX.md → Map<entity, projectNames[]>. `###` = entity; its `- Projects:` line lists `[name](...)`. */
export function parseEntityMap(indexContent: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let entity: string | null = null;
  for (const raw of indexContent.split('\n')) {
    const h = raw.match(/^###\s+(.+?)\s*$/);
    if (h) { entity = h[1].trim(); if (!map.has(entity)) map.set(entity, []); continue; }
    if (entity && /^\s*-\s*Projects:/i.test(raw)) {
      map.set(entity, [...raw.matchAll(/\[([^\]]+)\]\(/g)].map(m => m[1]));
    }
  }
  return map;
}

function yymm(date: string): string { return date.slice(2, 4) + date.slice(5, 7); }

interface DoneTask { id: string; title: string; project: string; }

/** Append the day's completed tasks under `## <date>` (idempotent by task id). Returns count added. */
export function writeJournalSection(vault: string, entity: string, date: string, done: DoneTask[]): number {
  const dir = path.join(vault, 'journal', entity);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${yymm(date)}.md`);
  let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `# ${entity} — ${date.slice(0, 7)}\n`;
  const header = `## ${date}`;
  if (!content.split('\n').some(l => l.trim() === header)) {
    content = `${content.replace(/\n*$/, '')}\n\n${header}\n`;
  }
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.trim() === header);
  const after = lines.findIndex((l, i) => i > idx && /^##\s/.test(l));
  const end = after < 0 ? lines.length : after;
  const existing = new Set<string>();
  for (let i = idx + 1; i < end; i++) {
    const m = lines[i].match(/✅\s+(\S+)/);
    if (m) existing.add(m[1]);
  }
  const fresh = done.filter(d => !existing.has(d.id)).map(d => `- ✅ ${d.id} ${d.title} [project:: ${d.project}]`);
  if (fresh.length === 0) return 0;
  lines.splice(end, 0, ...fresh);
  fs.writeFileSync(file, lines.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
  return fresh.length;
}

interface JournalOpts { crew?: string; }

export default function omJournal(dateArg: string | undefined, opts: JournalOpts): void {
  const crew = requireCrew(opts.crew);
  const date = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : new Date().toISOString().slice(0, 10);
  const indexPath = path.join(crew.vault, 'journal', 'INDEX.md');
  if (!fs.existsSync(indexPath)) { print.error(`no journal/INDEX.md at ${path.join(crew.vault, 'journal')}/`); process.exit(1); }

  const entityMap = parseEntityMap(fs.readFileSync(indexPath, 'utf8'));
  const projPath = new Map((crew.projects || []).map(p => [p.name, p.path]));

  let added = 0;
  let found = 0;
  for (const [entity, projects] of entityMap) {
    const done: DoneTask[] = [];
    for (const name of projects) {
      const pth = projPath.get(name);
      if (!pth) continue; // entity lists a project not registered in this crew
      for (const t of readPlanTasks(pth, { includeArchived: true })) {
        if (t.status === 'done' && t.doneAt === date) done.push({ id: t.id, title: t.title, project: name });
      }
    }
    if (done.length === 0) continue;
    found += done.length;
    const n = writeJournalSection(crew.vault, entity, date, done);
    if (n) print.succeed(`${entity}: +${n} task(s) → journal/${entity}/${yymm(date)}.md`);
    added += n;
  }
  if (found === 0) print.info(`no tasks completed on ${date} (status: done + done-at: ${date}).`);
  else if (added === 0) print.info(`${found} task(s) for ${date} already journaled; nothing new.`);
  else print.info(`journal updated for ${date}: ${added} task(s). Add prose summary as needed (CLI lists; agent writes prose).`);
}
