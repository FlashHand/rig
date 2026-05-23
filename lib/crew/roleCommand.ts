import fs from 'fs';
import path from 'path';
import print from '../print';
import { requireCrew, resolveCrew, shortPath } from './config';
import { ensureCrewVault } from './vault';
import {
  BUILTIN_ROLE_NAMES,
  loadGlobalRoleNames,
  normalizeRoleName,
  roleByName,
  roleConfigDir,
  roleConfigPath,
  roleDefinitionsForCrew,
  titleFromRoleName,
} from './role';

interface RoleAddOpts {
  from: string;
  title?: string;
  summary?: string;
  agent?: string;
  executor?: string;
  force?: boolean;
  crew?: string;
}

interface RoleListOpts { crew?: string; }
interface RoleShowOpts { crew?: string; }

export function roleAdd(nameInput: string, opts: RoleAddOpts): void {
  const name = normalizeRoleName(nameInput);
  const existing = roleByName(name);
  if (existing && existing.builtIn) {
    print.error(`cannot override built-in role: ${name}`);
    process.exit(1);
  }
  if (!opts.from) {
    print.error('missing --from <file>');
    process.exit(1);
  }
  const source = path.resolve(opts.from);
  if (!fs.existsSync(source)) {
    print.error(`role description file not found: ${source}`);
    process.exit(1);
  }
  const dir = roleConfigDir(name);
  const cfg = roleConfigPath(name);
  if (fs.existsSync(cfg) && !opts.force) {
    print.error(`role already exists: ${name}. Pass --force to update it.`);
    process.exit(1);
  }

  const body = fs.readFileSync(source, 'utf8');
  const now = new Date().toISOString();
  const previous = readRoleConfig(cfg);
  const role = {
    name,
    title: opts.title || markdownTitle(body) || previous?.title || titleFromRoleName(name),
    folder: previous?.folder || `Roles/${name}`,
    description: opts.summary || firstParagraph(body) || previous?.description || '',
    agent: opts.agent || previous?.agent,
    defaultExecutor: normalizeExecutor(opts.executor || previous?.defaultExecutor),
    promptPath: path.join(dir, 'prompt.md'),
    sourcePath: source,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'prompt.md'), body, 'utf8');
  fs.writeFileSync(path.join(dir, 'source.md'), sourceHeader(source) + body, 'utf8');
  fs.writeFileSync(cfg, JSON.stringify(role, null, 2) + '\n', 'utf8');

  print.succeed(`role "${name}" saved: ${shortPath(cfg)}`);
  const crew = opts.crew ? requireCrew(opts.crew) : resolveCrew();
  if (crew) {
    ensureCrewVault(requireCrew(crew.name));
    print.info(`role "${name}" is available to crew "${crew.name}"`);
  } else {
    print.info('no crew configured yet; the role will load after `rig crew init`.');
  }
}

export function roleList(opts: RoleListOpts): void {
  const crew = opts.crew ? requireCrew(opts.crew) : undefined;
  const roles = crew
    ? roleDefinitionsForCrew(crew)
    : roleDefinitionsForCrew({ roles: [...BUILTIN_ROLE_NAMES, ...loadGlobalRoleNames()] });
  // eslint-disable-next-line no-console
  console.log('ROLE  TITLE  AGENT  EXECUTOR  FOLDER  CONFIG');
  // eslint-disable-next-line no-console
  console.log('----  -----  -----  --------  ------  ------');
  for (const role of roles) {
    // eslint-disable-next-line no-console
    console.log(`${role.name}  ${role.title}  ${role.agent || '-'}  ${role.defaultExecutor || '-'}  ${role.folder}  ${role.configPath ? shortPath(role.configPath) : 'built-in'}`);
  }
}

export function roleShow(nameInput: string, opts: RoleShowOpts): void {
  const crew = opts.crew ? requireCrew(opts.crew) : undefined;
  const role = roleByName(nameInput, crew);
  if (!role) {
    print.error(`unknown role: ${nameInput}`);
    process.exit(1);
  }
  print.info(`role: ${role.name}`);
  // eslint-disable-next-line no-console
  console.log(`title: ${role.title}`);
  // eslint-disable-next-line no-console
  console.log(`folder: ${role.folder}`);
  // eslint-disable-next-line no-console
  console.log(`agent: ${role.agent || '-'}`);
  // eslint-disable-next-line no-console
  console.log(`executor: ${role.defaultExecutor || '-'}`);
  // eslint-disable-next-line no-console
  console.log(`config: ${role.configPath ? shortPath(role.configPath) : 'built-in'}`);
  // eslint-disable-next-line no-console
  console.log(`prompt: ${role.promptPath ? shortPath(role.promptPath) : '-'}`);
  if (role.description) {
    // eslint-disable-next-line no-console
    console.log(`description: ${role.description}`);
  }
}

function normalizeExecutor(value?: string): string | undefined {
  if (!value) return undefined;
  if (value === 'claude' || value === 'codex' || value === 'pi') return value;
  print.error(`unknown executor: ${value}. Expected claude, codex, or pi.`);
  process.exit(1);
}

function readRoleConfig(file: string): any | undefined {
  if (!fs.existsSync(file)) return undefined;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
}

function markdownTitle(text: string): string | undefined {
  const line = text.split(/\r?\n/).find(l => /^#\s+/.test(l));
  return line ? line.replace(/^#\s+/, '').trim() : undefined;
}

function firstParagraph(text: string): string | undefined {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const paragraph = lines.find(l => l && !l.startsWith('#') && !l.startsWith('---'));
  return paragraph ? paragraph.slice(0, 240) : undefined;
}

function sourceHeader(source: string): string {
  return `<!-- Imported from ${source} at ${new Date().toISOString()} -->\n\n`;
}
