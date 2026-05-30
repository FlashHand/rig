import print from '../print';
import { requireCrew, shortPath } from './config';
import { resolveEngine } from './engine';
import { buildEngineInvocation, dispatchTask, runParallel } from './runtime';
import { readPlanTasks, selectDispatchable, writeTaskStatus, buildTaskPrompt } from './planTask';

// om-loop (design §2.2 编排循环, MVP "develop" slice): read a project's docs/plan/tasks,
// select dispatchable (status ready + deps done), dispatch each to its resolved engine in a
// fresh task worktree, write status back. Verify (Tester review) + merge are the next layer.

interface RunOpts { crew?: string; concurrency?: string; timeout?: string; dryRun?: boolean; }
interface Outcome { id: string; ok: boolean; status: string; detail: string; }

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
    print.info(`would dispatch ${planned.length} task(s) to ${proj.name}:`);
    for (const p of planned) {
      // eslint-disable-next-line no-console
      console.log(`  ${p.task.id} [${p.task.role || '?'}] → ${p.engine || 'UNRESOLVED'}${p.source ? ` (${p.source})` : ''}${p.err ? ` ${p.err}` : ''}`);
    }
    return;
  }

  const concurrency = opts.concurrency ? Number(opts.concurrency) : 4;
  const timeoutMs = opts.timeout ? Number(opts.timeout) : 600000;
  print.info(`dispatching ${planned.length} task(s) to ${proj.name} (concurrency ${concurrency}) …`);

  const outcomes = await runParallel<typeof planned[number], Outcome>(planned, async (p) => {
    const t = p.task;
    if (!p.engine) {
      writeTaskStatus(t.file, 'blocked');
      return { id: t.id, ok: false, status: 'blocked', detail: p.err || 'engine unresolved' };
    }
    writeTaskStatus(t.file, 'in-progress');
    try {
      const inv = buildEngineInvocation(p.engine as 'claude' | 'codex' | 'pi', buildTaskPrompt(t));
      const { result } = await dispatchTask(proj.path, t.id, inv, { timeoutMs });
      const ok = result.code === 0 && !result.timedOut;
      writeTaskStatus(t.file, ok ? 'done' : 'blocked');
      return {
        id: t.id, ok, status: ok ? 'done' : 'blocked',
        detail: ok ? `${p.engine} ${Math.round(result.durationMs / 1000)}s` : `exit ${result.code}${result.timedOut ? ' (timeout)' : ''}`,
      };
    } catch (e: any) {
      writeTaskStatus(t.file, 'blocked');
      return { id: t.id, ok: false, status: 'blocked', detail: e.message };
    }
  }, concurrency);

  const done = outcomes.filter(o => o.ok).length;
  for (const o of outcomes) (o.ok ? print.succeed : print.warn)(`${o.id} → ${o.status} (${o.detail})`);
  print.info(`run complete: ${done}/${outcomes.length} done. Worktrees kept on task/<id> branches for verify/merge.`);
}
