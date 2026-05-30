import print from '../print';
import { requireCrew, shortPath } from './config';
import { resolveEngine } from './engine';
import {
  buildEngineInvocation, dispatchTask, runParallel, runCommand,
  commitWorktree, isRepoClean, mergeTaskBranch, removeTaskWorktree, deleteBranch,
} from './runtime';
import { readPlanTasks, selectDispatchable, writeTaskStatus, buildTaskPrompt, PlanTask } from './planTask';

// om-loop (design §2.2 编排循环): read a project's docs/plan/tasks, select dispatchable
// (status ready + deps done), then per task: develop (engine writes in an isolated worktree)
// → commit → verify (Tester gate = task `verify` command) → auto-merge into the base branch
// on pass. Only MERGED tasks become `done` (so deps build on landed work). Autonomy = Ral's
// om-approval decision: develop in-worktree, mandatory verify, auto-merge on pass.

interface RunOpts { crew?: string; concurrency?: string; timeout?: string; dryRun?: boolean; }
interface Outcome { id: string; status: string; ok: boolean; detail: string; }

async function processTask(repoDir: string, task: PlanTask, engine: string, timeoutMs: number): Promise<Outcome> {
  const blocked = (detail: string): Outcome => { writeTaskStatus(task.file, 'blocked'); return { id: task.id, status: 'blocked', ok: false, detail }; };

  writeTaskStatus(task.file, 'in-progress');
  // 1. develop — engine writes inside the isolated worktree
  let worktree: { path: string; branch: string };
  try {
    const inv = buildEngineInvocation(engine as 'claude' | 'codex' | 'pi', buildTaskPrompt(task), { autonomy: 'develop' });
    const { worktree: wt, result } = await dispatchTask(repoDir, task.id, inv, { timeoutMs });
    worktree = wt;
    if (result.timedOut) return blocked('develop timed out');
    if (result.code !== 0) return blocked(`develop exit ${result.code}`);
  } catch (e: any) {
    return blocked(`develop error: ${e.message}`);
  }

  // 2. commit the worktree changes
  let committed: boolean;
  try { committed = await commitWorktree(worktree.path, `task ${task.id}: ${task.title}`); }
  catch (e: any) { return blocked(`commit failed: ${e.message}`); }
  if (!committed) return blocked('develop produced no changes');

  // 3. verify — the mandatory Tester gate (deterministic command); no command → no merge
  if (!task.verify) return blocked('verified-gate missing: add `verify:` command to enable auto-merge');
  const v = await runCommand('sh', ['-c', task.verify], { cwd: worktree.path, timeoutMs });
  if (v.code !== 0) return blocked(`verify failed (exit ${v.code}): ${task.verify}`);

  // 4. auto-merge into the base branch (only if the repo is clean, to avoid clobbering user work)
  if (!(await isRepoClean(repoDir))) return blocked(`verified ok but repo dirty — merge ${worktree.branch} manually`);
  const m = await mergeTaskBranch(repoDir, worktree.branch);
  if (!m.merged) return blocked(`merge conflict on ${worktree.branch}: ${m.detail}`);
  try { await removeTaskWorktree(repoDir, worktree.path, { force: true }); await deleteBranch(repoDir, worktree.branch); } catch { /* best-effort cleanup */ }
  writeTaskStatus(task.file, 'done');
  return { id: task.id, status: 'done', ok: true, detail: `${engine} → verified + merged` };
}

export default async function crewRun(project: string, opts: RunOpts): Promise<void> {
  const crew = requireCrew(opts.crew);
  const proj = (crew.projects || []).find(p => p.name === project);
  if (!proj) {
    print.error(`unknown project: ${project}. Register with \`rig orchestrate project add\`.`);
    process.exit(1);
  }

  const all = readPlanTasks(proj.path);
  if (all.length === 0) { print.info(`no tasks under ${shortPath(proj.path)}/docs/plan/tasks/`); return; }
  const ready = selectDispatchable(all);
  if (ready.length === 0) { print.info(`no dispatchable tasks (need status: ready + deps done) among ${all.length}.`); return; }

  const planned = ready.map(task => {
    try {
      const r = resolveEngine({ explicit: task.engine, project: proj, crew });
      return { task, engine: r.engine, source: r.source, err: '' };
    } catch (e: any) {
      return { task, engine: null as string | null, source: '', err: e.message };
    }
  });

  if (opts.dryRun) {
    print.info(`would dispatch ${planned.length} task(s) to ${proj.name} (develop → verify → auto-merge):`);
    for (const p of planned) {
      // eslint-disable-next-line no-console
      console.log(`  ${p.task.id} [${p.task.role || '?'}] → ${p.engine || 'UNRESOLVED'}${p.source ? ` (${p.source})` : ''}  verify: ${p.task.verify || '(none → will not merge)'}${p.err ? ` ${p.err}` : ''}`);
    }
    return;
  }

  const concurrency = opts.concurrency ? Number(opts.concurrency) : 4;
  const timeoutMs = opts.timeout ? Number(opts.timeout) : 600000;
  print.info(`dispatching ${planned.length} task(s) to ${proj.name} (concurrency ${concurrency}, develop→verify→merge) …`);

  const outcomes = await runParallel<typeof planned[number], Outcome>(planned, async (p) => {
    if (!p.engine) { writeTaskStatus(p.task.file, 'blocked'); return { id: p.task.id, status: 'blocked', ok: false, detail: p.err || 'engine unresolved' }; }
    try { return await processTask(proj.path, p.task, p.engine, timeoutMs); }
    catch (e: any) { writeTaskStatus(p.task.file, 'blocked'); return { id: p.task.id, status: 'blocked', ok: false, detail: e.message }; }
  }, concurrency);

  const done = outcomes.filter(o => o.ok).length;
  for (const o of outcomes) (o.ok ? print.succeed : print.warn)(`${o.id} → ${o.status} (${o.detail})`);
  print.info(`run complete: ${done}/${outcomes.length} merged. Blocked tasks keep their worktree (task/<id>) for inspection.`);
}
