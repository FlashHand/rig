import fs from 'fs';
import path from 'path';
import print from '../print';
import { requireCrew, shortPath } from './config';
import { crewPaths } from './paths';
import { rootPath } from './vault';
import { loadCustomRoleDefinitions } from './role';

interface DoctorOpts { crew?: string; }

export default function crewDoctor(opts: DoctorOpts): void {
  const crew = requireCrew(opts.crew);
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  checks.push({ name: 'crew config', ok: fs.existsSync(crewPaths.config), detail: shortPath(crewPaths.config) });
  checks.push({ name: 'vault', ok: fs.existsSync(crew.vault), detail: shortPath(crew.vault) });
  checks.push({ name: 'crew root', ok: fs.existsSync(rootPath(crew, '')), detail: shortPath(rootPath(crew, '')) });
  checks.push({ name: 'current goal', ok: fs.existsSync(rootPath(crew, 'Current-Goal.md')), detail: path.join(crew.root, 'Current-Goal.md') });
  checks.push({ name: 'inbox', ok: fs.existsSync(rootPath(crew, 'Inbox.md')), detail: path.join(crew.root, 'Inbox.md') });
  checks.push({ name: 'vault CLAUDE.md', ok: fs.existsSync(path.join(crew.vault, 'CLAUDE.md')), detail: 'CLAUDE.md' });
  checks.push({ name: 'vault AGENTS.md', ok: fs.existsSync(path.join(crew.vault, 'AGENTS.md')), detail: 'AGENTS.md' });
  checks.push({ name: 'user RIG.md', ok: fs.existsSync(crewPaths.userRules), detail: shortPath(crewPaths.userRules) });
  checks.push({ name: 'roles dir', ok: fs.existsSync(crewPaths.rolesDir), detail: shortPath(crewPaths.rolesDir) });
  checks.push({ name: 'role registry', ok: fs.existsSync(rootPath(crew, 'Shared/Roles.md')), detail: path.join(crew.root, 'Shared/Roles.md') });
  for (const role of loadCustomRoleDefinitions()) {
    checks.push({ name: `role ${role.name} prompt`, ok: !!role.promptPath && fs.existsSync(role.promptPath), detail: role.promptPath ? shortPath(role.promptPath) : '-' });
  }
  for (const project of crew.projects || []) {
    const rig = path.join(project.path, 'RIG.md');
    const rigLower = path.join(project.path, 'rig.md');
    checks.push({ name: `project ${project.name} RIG.md`, ok: fs.existsSync(rig) || fs.existsSync(rigLower), detail: shortPath(rig) });
    checks.push({ name: `project ${project.name} path`, ok: fs.existsSync(project.path), detail: shortPath(project.path) });
  }

  let failed = 0;
  for (const c of checks) {
    if (c.ok) print.succeed(`${c.name}: ${c.detail}`);
    else { failed++; print.warn(`${c.name}: missing (${c.detail})`); }
  }
  if (failed > 0) process.exitCode = 1;
}
