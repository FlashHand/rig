import path from 'path';
import print from '../print';
import { loadCrewConfig, saveCrewConfig, requireCrew, normalizeCrew, CrewProject, shortPath } from './config';
import { ensureProject } from './vault';
import { scanTasks, summarize } from './task';
import { CrewExecutor } from './config';

interface ProjectOpts {
  crew?: string;
  path?: string;
  owner?: string;
  executor?: string;
  testCommand?: string;
  noWrite?: boolean;
}

export function projectAdd(name: string, opts: ProjectOpts): void {
  const cfg = loadCrewConfig();
  const crew = requireCrew(opts.crew);
  if (!opts.path) {
    print.error('missing --path <path>');
    process.exit(1);
  }
  const project: CrewProject = {
    name,
    path: path.resolve(opts.path),
    owner: opts.owner || `maintainer:${name}`,
    defaultExecutor: parseExecutor(opts.executor || crew.defaultExecutor || 'claude'),
    canWriteCode: !opts.noWrite,
    defaultTestCommand: opts.testCommand,
  };
  const crewIndex = cfg.crews.findIndex(c => c.name === crew.name);
  const entry = normalizeCrew(cfg.crews[crewIndex]);
  const projects = entry.projects || [];
  const i = projects.findIndex(p => p.name === name);
  if (i >= 0) projects[i] = project;
  else projects.push(project);
  entry.projects = projects;
  cfg.crews[crewIndex] = entry;
  saveCrewConfig(cfg);
  ensureProject(entry, project);
  print.succeed(`project "${name}" registered: ${shortPath(project.path)}`);
}

export function projectList(opts: ProjectOpts): void {
  const crew = requireCrew(opts.crew);
  const projects = crew.projects || [];
  if (projects.length === 0) {
    print.info('no projects registered. Use `rig crew project add <name> --path <path>`.');
    return;
  }
  // eslint-disable-next-line no-console
  console.log('NAME  OWNER  EXECUTOR  CAN WRITE  TEST COMMAND  PATH');
  // eslint-disable-next-line no-console
  console.log('----  -----  --------  ---------  ------------  ----');
  for (const p of projects) {
    // eslint-disable-next-line no-console
    console.log(`${p.name}  ${p.owner}  ${p.defaultExecutor || crew.defaultExecutor || 'claude'}  ${p.canWriteCode === false ? 'no' : 'yes'}  ${p.defaultTestCommand || '-'}  ${shortPath(p.path)}`);
  }
}

export function projectStatus(name: string, opts: ProjectOpts): void {
  const crew = requireCrew(opts.crew);
  const project = (crew.projects || []).find(p => p.name === name);
  if (!project) {
    print.error(`unknown project: ${name}`);
    process.exit(1);
  }
  const tasks = scanTasks(crew).filter(t => t.scope !== 'inbox' && (t.scope === `project:${name}` || t.fields.project === name));
  const s = summarize(tasks);
  print.info(`project: ${name} (${project.owner})`);
  // eslint-disable-next-line no-console
  console.log(`path: ${shortPath(project.path)}`);
  // eslint-disable-next-line no-console
  console.log(`executor: ${project.defaultExecutor || crew.defaultExecutor || 'claude'}`);
  // eslint-disable-next-line no-console
  console.log(`tasks: ${s.done}/${s.total} done, ${s.open} open, ${s.blocked} blocked`);
}

function parseExecutor(value: string): CrewExecutor {
  if (value === 'claude' || value === 'codex' || value === 'pi') return value;
  print.error(`unknown executor: ${value}. Expected claude, codex, or pi.`);
  process.exit(1);
}
