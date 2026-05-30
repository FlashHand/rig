import print from '../print';
import { requireCrew, shortPath } from './config';
import { resolveEngine } from './engine';
import { buildEngineInvocation, dispatchTask } from './runtime';

interface DispatchOpts {
  crew?: string;
  prompt: string;
  engine?: string;
  task?: string;
  timeout?: string;
}

/**
 * `rig orchestrate dispatch <project>` — MVP manual dispatch: resolve the engine for
 * <project>, run the prompt in a fresh `task/<id>` worktree of that project, print the
 * result. The full orchestrate loop (read task files → dispatch → verify → merge) builds
 * on this primitive; this command exposes it for manual use / debugging.
 */
export default async function crewDispatch(project: string, opts: DispatchOpts): Promise<void> {
  const crew = requireCrew(opts.crew);
  const proj = (crew.projects || []).find(p => p.name === project);
  if (!proj) {
    print.error(`unknown project: ${project}. Register it with \`rig orchestrate project add\` first.`);
    process.exit(1);
  }
  let engine: string;
  try {
    const res = resolveEngine({ explicit: opts.engine, project: proj, crew });
    if (!res.engine) {
      print.error(`engine unresolved — ${res.detail}.`);
      process.exit(1);
    }
    engine = res.engine;
    print.info(`engine: ${res.engine} (source: ${res.source})`);
  } catch (e: any) {
    print.error(e.message);
    process.exit(1);
    return;
  }

  const taskId = opts.task || `adhoc-${Date.now()}`;
  const timeoutMs = opts.timeout ? Number(opts.timeout) : 600000;
  const inv = buildEngineInvocation(engine as any, opts.prompt);
  print.info(`dispatching → ${proj.name} (${shortPath(proj.path)}) on branch task/${taskId} …`);

  try {
    const { worktree, result } = await dispatchTask(proj.path, taskId, inv, { timeoutMs });
    print.info(`exit=${result.code} timedOut=${result.timedOut} truncated=${result.truncated} ${Math.round(result.durationMs / 1000)}s`);
    print.info(`worktree: ${shortPath(worktree.path)} (branch task/${taskId}) — remove with \`git -C ${shortPath(proj.path)} worktree remove --force ${shortPath(worktree.path)}\``);
    // eslint-disable-next-line no-console
    console.log(result.stdout.slice(0, 4000));
    if (result.code !== 0) process.exitCode = 1;
  } catch (e: any) {
    print.error(`dispatch failed: ${e.message}`);
    process.exit(1);
  }
}
