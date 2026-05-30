import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Reader/selector for docs-sprint task files (design §2.4): one project's tasks live
// in <project>/docs/plan/tasks/<id>.md with YAML frontmatter. This is distinct from the
// vault's inline-field tasks (task.ts); om-loop (`rig orchestrate run`) reads from here.

export interface PlanTask {
  id: string;
  status: string;
  role?: string;
  engine?: string;
  dependsOn: string[];
  scope?: string;
  /** Shell command run in the worktree after develop; exit 0 = the verify (Tester) gate passes. */
  verify?: string;
  /** Date (YYYY-MM-DD) the task reached `done`; stamped on merge, read by `rig om journal`. */
  doneAt?: string;
  file: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Normalize a YAML date value to YYYY-MM-DD. js-yaml parses unquoted `2026-06-01` as a Date. */
function asDateStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function parsePlanTask(file: string, content: string): PlanTask | null {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return null;
  let fm: Record<string, unknown>;
  try { fm = (yaml.load(m[1]) as Record<string, unknown>) || {}; } catch { return null; }
  const body = (m[2] || '').trim();
  const raw = fm['depends-on'];
  const dependsOn = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const id = fm.id != null ? String(fm.id) : path.basename(file, '.md');
  return {
    id,
    status: fm.status != null ? String(fm.status) : 'unknown',
    role: fm.role != null ? String(fm.role) : undefined,
    engine: fm.engine != null ? String(fm.engine) : undefined,
    dependsOn,
    scope: fm.scope != null ? String(fm.scope) : undefined,
    verify: fm.verify != null ? String(fm.verify) : undefined,
    doneAt: asDateStr(fm['done-at']),
    file,
    title: titleMatch ? titleMatch[1].trim() : id,
    body,
    frontmatter: fm,
  };
}

export function readPlanTask(file: string): PlanTask | null {
  if (!fs.existsSync(file)) return null;
  return parsePlanTask(file, fs.readFileSync(file, 'utf8'));
}

/** Tasks under <projectDir>/docs/plan/tasks/*.md; archived/ included only when asked. */
export function readPlanTasks(projectDir: string, opts: { includeArchived?: boolean } = {}): PlanTask[] {
  const base = path.join(projectDir, 'docs', 'plan', 'tasks');
  const dirs = opts.includeArchived ? [base, path.join(base, 'archived')] : [base];
  const out: PlanTask[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const t = readPlanTask(path.join(dir, name));
      if (t) out.push(t);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const DONE_STATES = new Set(['done', 'shipped', 'merged']);

/** Dispatchable = status `ready` AND every `depends-on` is done within the task set. */
export function selectDispatchable(tasks: PlanTask[]): PlanTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  return tasks.filter(t => {
    if (t.status !== 'ready') return false;
    return t.dependsOn.every(dep => {
      const d = byId.get(dep);
      return d ? DONE_STATES.has(d.status) : false; // unknown dep → not satisfied (safe)
    });
  });
}

/** Surgical `status:` replace inside the frontmatter block only (preserves formatting). */
export function writeTaskStatus(file: string, newStatus: string): void {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^(---\n[\s\S]*?\n---)/);
  if (!m) throw new Error(`no frontmatter in ${file}`);
  const fm = m[1];
  if (!/^status:[ \t]*/m.test(fm)) throw new Error(`status field not found in frontmatter of ${file}`);
  const nextFm = fm.replace(/^(status:[ \t]*).*$/m, `$1${newStatus}`);
  fs.writeFileSync(file, src.replace(fm, nextFm), 'utf8');
}

/** Mark a task done + stamp `done-at: <date>` in frontmatter (inserts the field if absent). */
export function stampTaskDone(file: string, date: string): void {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^(---\n[\s\S]*?\n---)/);
  if (!m) throw new Error(`no frontmatter in ${file}`);
  let fm = m[1];
  if (!/^status:[ \t]*/m.test(fm)) throw new Error(`status field not found in frontmatter of ${file}`);
  fm = fm.replace(/^(status:[ \t]*).*$/m, `$1done`);
  fm = /^done-at:/m.test(fm)
    ? fm.replace(/^(done-at:[ \t]*).*$/m, `$1${date}`)
    : fm.replace(/^(status:[ \t]*done.*)$/m, `$1\ndone-at: ${date}`);
  fs.writeFileSync(file, src.replace(m[1], fm), 'utf8');
}

/** Build the develop prompt for an engine from a task. */
export function buildTaskPrompt(task: PlanTask): string {
  return [
    `You are the ${task.role || 'coder'} working in a fresh, isolated git worktree.`,
    `Implement task ${task.id}: ${task.title}`,
    '',
    task.body,
    '',
    'Make the changes needed to complete this task in the current worktree, then stop.',
  ].join('\n');
}
