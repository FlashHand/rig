import fs from 'fs';
import path from 'path';
import print from '../print';
import { requireCrew } from '../crew/config';

interface TaskNewOpts { crew?: string; role?: string; engine?: string; status?: string; }

/**
 * `rig om task <project> <id>` — scaffold a docs-sprint task file (Phase-3 enablement).
 * Creates docs/plan/tasks/ on first use. Defaults status: draft (not dispatchable) and omits
 * `verify:` on purpose — om-loop won't auto-merge until the author adds a real verify command.
 */
export default function omTaskNew(project: string, id: string, opts: TaskNewOpts): void {
  const crew = requireCrew(opts.crew);
  const proj = (crew.projects || []).find(p => p.name === project);
  if (!proj) { print.error(`unknown project: ${project}. Register with \`rig orchestrate project add\`.`); process.exit(1); }

  const dir = path.join(proj.path, 'docs', 'plan', 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.md`);
  if (fs.existsSync(file)) { print.error(`task already exists: ${file}`); process.exit(1); }

  const content = [
    '---',
    `id: ${id}`,
    'type: task',
    `status: ${opts.status || 'draft'}`,
    `role: ${opts.role || 'coder'}`,
    ...(opts.engine ? [`engine: ${opts.engine}`] : []),
    'depends-on: []',
    '# verify: yarn test   # add a real command → exit 0 is the Tester gate that lets om-loop auto-merge',
    '---',
    `# ${id}`,
    '',
    '- objective: ',
    '- context: ',
    '- path: ',
    '- verification: ',
    '',
  ].join('\n');
  fs.writeFileSync(file, content, 'utf8');
  print.succeed(`scaffolded ${file} (status: ${opts.status || 'draft'}). Fill objective, add a verify: command, set status: ready to dispatch.`);
}
