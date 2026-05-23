import fs from 'fs';
import path from 'path';
import { crewPaths } from './paths';

export interface CrewRoleDefinition {
  name: string;
  title: string;
  folder: string;
  description?: string;
  agent?: string;
  defaultExecutor?: string;
  promptPath?: string;
  configPath?: string;
  builtIn?: boolean;
}

export const BUILTIN_ROLE_NAMES = ['lead', 'designer', 'pm', 'coder', 'tester', 'researcher'];

const BUILTIN_ROLES: CrewRoleDefinition[] = [
  { name: 'lead', title: 'Lead', folder: 'Lead', description: 'Coordinates goals, project owners, roles, Inbox decisions, and dashboard status.', builtIn: true },
  { name: 'designer', title: 'Designer', folder: 'Designer', description: 'Reviews user flows, interaction details, information architecture, and visual fit.', builtIn: true },
  { name: 'pm', title: 'PM', folder: 'PM', description: 'Turns goals into PRDs, scope boundaries, acceptance criteria, and open questions.', builtIn: true },
  { name: 'coder', title: 'Coder', folder: 'Coder', description: 'Implements project-scoped code tasks assigned by a Project Owner or Lead.', builtIn: true },
  { name: 'tester', title: 'Tester', folder: 'Tester', description: 'Plans and runs verification, defaulting frontend work to PRD-scoped Playwright E2E.', builtIn: true },
  { name: 'researcher', title: 'Researcher', folder: 'Researcher', description: 'Produces source-backed research reports and keeps a lightweight research index.', builtIn: true },
];

export function normalizeRoleName(input: string): string {
  const name = input.trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`invalid role name "${input}". Use lowercase letters, numbers, and hyphens.`);
  }
  return name;
}

export function normalizeRoleNames(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = normalizeRoleName(raw);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function roleFolderName(name: string): string {
  return titleFromRoleName(name).replace(/[^A-Za-z0-9]/g, '');
}

export function roleConfigDir(name: string): string {
  return path.join(crewPaths.rolesDir, normalizeRoleName(name));
}

export function roleConfigPath(name: string): string {
  return path.join(roleConfigDir(name), 'role.json');
}

export function loadGlobalRoleNames(): string[] {
  return loadCustomRoleDefinitions().map(r => r.name);
}

export function roleDefinitionsForCrew(crew: { roles?: string[] }): CrewRoleDefinition[] {
  const known = new Map<string, CrewRoleDefinition>();
  for (const role of BUILTIN_ROLES) known.set(role.name, role);
  for (const role of loadCustomRoleDefinitions()) known.set(role.name, role);
  const names = normalizeRoleNames(crew.roles && crew.roles.length ? crew.roles : BUILTIN_ROLE_NAMES);
  return names.map(name => known.get(name) || fallbackRole(name));
}

export function loadCustomRoleDefinitions(): CrewRoleDefinition[] {
  if (!fs.existsSync(crewPaths.rolesDir)) return [];
  const roles: CrewRoleDefinition[] = [];
  for (const entry of fs.readdirSync(crewPaths.rolesDir)) {
    const cfg = path.join(crewPaths.rolesDir, entry, 'role.json');
    if (!fs.existsSync(cfg)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(cfg, 'utf8')) as Partial<CrewRoleDefinition>;
      if (!raw.name) continue;
      const name = normalizeRoleName(raw.name);
      roles.push({
        name,
        title: raw.title || titleFromRoleName(name),
        folder: raw.folder || path.join('Roles', name),
        description: raw.description,
        agent: raw.agent,
        defaultExecutor: raw.defaultExecutor,
        promptPath: raw.promptPath || path.join(roleConfigDir(name), 'prompt.md'),
        configPath: cfg,
      });
    } catch {
      // Invalid role configs are ignored by passive loaders; `rig crew role show`
      // surfaces parse errors when the user inspects a specific role.
    }
  }
  return roles.sort((a, b) => a.name.localeCompare(b.name));
}

export function roleByName(name: string, crew?: { roles?: string[] }): CrewRoleDefinition | undefined {
  const normalized = normalizeRoleName(name);
  const defs = crew ? roleDefinitionsForCrew(crew) : [...BUILTIN_ROLES, ...loadCustomRoleDefinitions()];
  return defs.find(r => r.name === normalized);
}

export function titleFromRoleName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fallbackRole(name: string): CrewRoleDefinition {
  return {
    name,
    title: titleFromRoleName(name),
    folder: path.join('Roles', name),
    description: 'Custom role without a global role.json definition.',
  };
}
