import print from '../print';
import { requireCrew } from './config';

export type Engine = 'claude' | 'codex' | 'pi';
const VALID_ENGINES: Engine[] = ['claude', 'codex', 'pi'];

export type EngineSource = 'explicit' | 'project' | 'crew' | 'host' | 'unresolved';

export interface EngineResolution {
  engine: Engine | null;
  source: EngineSource;
  detail?: string;
}

export function isEngine(v: unknown): v is Engine {
  return typeof v === 'string' && (VALID_ENGINES as string[]).includes(v);
}

/**
 * Host engine self-detection from the environment (design §2.2).
 * - claude: `CLAUDECODE`, any `CLAUDE_CODE*`, or `AI_AGENT` containing "claude"
 * - codex:  any `CODEX*`, or `AI_AGENT` containing "codex"
 * Returns null when neither is present, or both are (ambiguous → caller asks).
 */
export function detectHostEngine(env: NodeJS.ProcessEnv = process.env): Engine | null {
  const keys = Object.keys(env);
  const ai = (env.AI_AGENT || '').toLowerCase();
  const claude = !!env.CLAUDECODE || keys.some(k => k.startsWith('CLAUDE_CODE')) || ai.includes('claude');
  const codex = keys.some(k => k.startsWith('CODEX')) || ai.includes('codex');
  if (claude && !codex) return 'claude';
  if (codex && !claude) return 'codex';
  return null;
}

/**
 * 5-level engine resolution (design §2.2). Highest priority first:
 * 1. explicit  — task `engine:` field / conversation directive (override)
 * 2. project   — project config `defaultExecutor`
 * 3. crew      — crew config `defaultExecutor`
 * 4. host      — host self-detection (`detectHostEngine`)
 * 5. unresolved — caller raises a pending question; agent never invents an engine
 *
 * An invalid explicit value throws; invalid project/crew values are skipped
 * (treated as unset) so a typo in config can't silently pin the wrong engine.
 */
export function resolveEngine(opts: {
  explicit?: string | null;
  project?: { defaultExecutor?: string } | null;
  crew?: { defaultExecutor?: string } | null;
  env?: NodeJS.ProcessEnv;
}): EngineResolution {
  const { explicit, project, crew, env } = opts;
  if (explicit != null && explicit !== '') {
    if (!isEngine(explicit)) {
      throw new Error(`invalid engine "${explicit}". Use one of: ${VALID_ENGINES.join(', ')}.`);
    }
    return { engine: explicit, source: 'explicit' };
  }
  if (project && isEngine(project.defaultExecutor)) {
    return { engine: project.defaultExecutor as Engine, source: 'project' };
  }
  if (crew && isEngine(crew.defaultExecutor)) {
    return { engine: crew.defaultExecutor as Engine, source: 'crew' };
  }
  const host = detectHostEngine(env);
  if (host) return { engine: host, source: 'host' };
  return {
    engine: null,
    source: 'unresolved',
    detail: 'no explicit/project/crew engine and host undetected — raise a pending question instead of guessing',
  };
}

interface EngineOpts { crew?: string; project?: string; engine?: string; json?: boolean; }

/** `rig orchestrate engine` — debug view of which engine resolves and why. */
export default function crewEngine(opts: EngineOpts): void {
  const crew = requireCrew(opts.crew);
  const project = opts.project ? (crew.projects || []).find(p => p.name === opts.project) : undefined;
  if (opts.project && !project) {
    print.error(`unknown project: ${opts.project}`);
    process.exit(1);
  }
  let res: EngineResolution;
  try {
    res = resolveEngine({ explicit: opts.engine, project, crew });
  } catch (e: any) {
    print.error(e.message);
    process.exit(1);
    return;
  }
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: res.engine != null, engine: res.engine, source: res.source, project: opts.project || null, detail: res.detail }, null, 2));
    return;
  }
  if (res.engine == null) {
    print.warn(`engine unresolved — ${res.detail}.`);
    process.exitCode = 1;
    return;
  }
  print.info(`engine: ${res.engine}  (source: ${res.source}${opts.project ? `, project: ${opts.project}` : ''})`);
}
