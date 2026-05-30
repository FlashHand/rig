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
  file: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

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

/** All tasks under <projectDir>/docs/plan/tasks/*.md (archived/ is skipped). */
export function readPlanTasks(projectDir: string): PlanTask[] {
  const dir = path.join(projectDir, 'docs', 'plan', 'tasks');
  if (!fs.existsSync(dir)) return [];
  const out: PlanTask[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const t = readPlanTask(path.join(dir, name));
    if (t) out.push(t);
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
  const nextFm = fm.replace(/^(status:[ \t]*).*$/m, `$1${newStatus}`);
  if (nextFm === fm) throw new Error(`status field not found in frontmatter of ${file}`);
  fs.writeFileSync(file, src.replace(fm, nextFm), 'utf8');
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
