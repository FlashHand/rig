import fs from 'fs';
import path from 'path';
import { crewPaths } from './paths';
import { BUILTIN_ROLE_NAMES, loadGlobalRoleNames, normalizeRoleNames } from './role';

export type CrewRole = string;
export type CrewExecutor = 'claude' | 'codex' | 'pi';

export interface CrewProject {
  name: string;
  path: string;
  owner: string;
  defaultExecutor?: CrewExecutor;
  canWriteCode?: boolean;
  defaultTestCommand?: string;
}

export interface CrewEntry {
  name: string;
  vault: string;
  root: string;
  defaultExecutor?: CrewExecutor;
  mode?: 'leader-first';
  dashboard?: string;
  state?: { backend?: 'sqlite' | 'json' };
  roles?: CrewRole[];
  projects?: CrewProject[];
}

export interface CrewConfig {
  defaultCrew?: string;
  crews: CrewEntry[];
}

export const DEFAULT_ROLES: CrewRole[] = BUILTIN_ROLE_NAMES;
export const DEFAULT_CREW_ROOT = 'rig-crew';

const DEFAULT_CONFIG: CrewConfig = { crews: [] };

export function ensureCrewHome(): void {
  fs.mkdirSync(crewPaths.home, { recursive: true });
  fs.mkdirSync(crewPaths.crewDir, { recursive: true });
  fs.mkdirSync(crewPaths.rolesDir, { recursive: true });
}

export function loadCrewConfig(): CrewConfig {
  ensureCrewHome();
  if (!fs.existsSync(crewPaths.config)) return { ...DEFAULT_CONFIG };
  try {
    const cfg = JSON.parse(fs.readFileSync(crewPaths.config, 'utf8')) as CrewConfig;
    if (!Array.isArray(cfg.crews)) cfg.crews = [];
    return cfg;
  } catch (e: any) {
    throw new Error(`failed to parse ${crewPaths.config}: ${e.message}`);
  }
}

export function saveCrewConfig(cfg: CrewConfig): void {
  ensureCrewHome();
  fs.writeFileSync(crewPaths.config, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export function upsertCrew(entry: CrewEntry): CrewConfig {
  const cfg = loadCrewConfig();
  const i = cfg.crews.findIndex(c => c.name === entry.name);
  if (i >= 0) cfg.crews[i] = entry;
  else cfg.crews.push(entry);
  if (!cfg.defaultCrew) cfg.defaultCrew = entry.name;
  saveCrewConfig(cfg);
  return cfg;
}

export function resolveCrew(name?: string): CrewEntry | undefined {
  const cfg = loadCrewConfig();
  if (name) return cfg.crews.find(c => c.name === name);
  if (cfg.defaultCrew) {
    const found = cfg.crews.find(c => c.name === cfg.defaultCrew);
    if (found) return found;
  }
  if (cfg.crews.length === 1) return cfg.crews[0];
  const cwd = process.cwd();
  return cfg.crews.find(c => cwd === c.vault || cwd.startsWith(c.vault + path.sep));
}

export function normalizeCrew(entry: CrewEntry): CrewEntry {
  return {
    ...entry,
    root: entry.root || DEFAULT_CREW_ROOT,
    dashboard: entry.dashboard || path.join(entry.root || DEFAULT_CREW_ROOT, 'Dashboard.md'),
    defaultExecutor: entry.defaultExecutor || 'claude',
    mode: entry.mode || 'leader-first',
    state: entry.state || { backend: 'json' },
    roles: normalizeRoleNames([...(entry.roles || DEFAULT_ROLES), ...loadGlobalRoleNames()]),
    projects: entry.projects || [],
  };
}

export function requireCrew(name?: string): CrewEntry {
  const crew = resolveCrew(name);
  if (!crew) {
    throw new Error('no crew configured. Run `rig crew init --vault <path>` first.');
  }
  return normalizeCrew(crew);
}

export function shortPath(p: string): string {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
