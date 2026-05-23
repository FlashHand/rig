import fs from 'fs';
import path from 'path';
import print from '../print';
import { loadCrewConfig, saveCrewConfig, requireCrew, normalizeCrew, CrewProject, shortPath } from './config';
import { ensureProject, rootPath } from './vault';
import { scanTasks, summarize } from './task';
import { CrewExecutor } from './config';

interface ProjectOpts {
  crew?: string;
  path?: string;
  owner?: string;
  executor?: string;
  testCommand?: string;
  noWrite?: boolean;
  from?: string;
  keepMissing?: boolean;
  archiveMissing?: boolean;
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
  const tasks = scanTasks(crew).filter(t => t.scope !== 'inbox' && (t.scope === `project:${name}` || t.scope.startsWith(`project:${name}:`) || t.fields.project === name));
  const s = summarize(tasks);
  print.info(`project: ${name} (${project.owner})`);
  // eslint-disable-next-line no-console
  console.log(`path: ${shortPath(project.path)}`);
  // eslint-disable-next-line no-console
  console.log(`executor: ${project.defaultExecutor || crew.defaultExecutor || 'claude'}`);
  // eslint-disable-next-line no-console
  console.log(`tasks: ${s.done}/${s.total} done, ${s.open} open, ${s.blocked} blocked`);
}

export function projectSync(opts: ProjectOpts): void {
  const cfg = loadCrewConfig();
  const crew = requireCrew(opts.crew);
  const crewIndex = cfg.crews.findIndex(c => c.name === crew.name);
  const entry = normalizeCrew(cfg.crews[crewIndex]);
  const scanRoot = path.resolve(entry.vault, opts.from || 'projects');
  if (!fs.existsSync(scanRoot)) {
    print.error(`projects directory not found: ${shortPath(scanRoot)}`);
    process.exit(1);
  }

  const found = fs.readdirSync(scanRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map(d => ({ name: d.name, path: path.join(scanRoot, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const existing = new Map((entry.projects || []).map(p => [p.name, p]));
  const seen = new Set(found.map(p => p.name));
  const next: CrewProject[] = [];
  const added: string[] = [];
  const updated: string[] = [];
  const removed: CrewProject[] = [];

  for (const item of found) {
    const old = existing.get(item.name);
    if (old) {
      const project = { ...old, path: item.path };
      next.push(project);
      updated.push(item.name);
    } else {
      const project: CrewProject = {
        name: item.name,
        path: item.path,
        owner: `maintainer:${item.name}`,
        defaultExecutor: parseExecutor(opts.executor || entry.defaultExecutor || 'claude'),
        canWriteCode: !opts.noWrite,
        defaultTestCommand: opts.testCommand,
      };
      next.push(project);
      added.push(item.name);
    }
  }

  for (const project of entry.projects || []) {
    if (seen.has(project.name)) continue;
    if (!isInside(project.path, scanRoot)) {
      next.push(project);
      continue;
    }
    if (opts.keepMissing) next.push(project);
    else removed.push(project);
  }

  entry.projects = next;
  cfg.crews[crewIndex] = entry;
  saveCrewConfig(cfg);

  for (const project of next) ensureProject(entry, project);
  if (!opts.keepMissing && opts.archiveMissing !== false) {
    for (const project of removed) archiveProjectFolder(entry, project.name);
  }

  print.succeed(`project registry synced from ${shortPath(scanRoot)}`);
  print.info(`added: ${added.length ? added.join(', ') : '-'}`);
  print.info(`updated: ${updated.length ? updated.join(', ') : '-'}`);
  print.info(`removed: ${removed.length ? removed.map(p => p.name).join(', ') : '-'}`);
}

function parseExecutor(value: string): CrewExecutor {
  if (value === 'claude' || value === 'codex' || value === 'pi') return value;
  print.error(`unknown executor: ${value}. Expected claude, codex, or pi.`);
  process.exit(1);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function archiveProjectFolder(crew: ReturnType<typeof normalizeCrew>, name: string): void {
  const from = rootPath(crew, path.join('Projects', name));
  if (!fs.existsSync(from)) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  const to = rootPath(crew, path.join('Projects', '_Archived', `${name}-${stamp}`));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}
