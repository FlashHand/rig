import fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import { paths } from './paths';

export interface RigConfig {
  wiki?: {
    defaultAgent?: 'claude' | 'codex' | 'pi';
    qmd?: { enabled?: 'auto' | 'on' | 'off' };
    logRotateMB?: number;
  };
}

export interface WikiEntry {
  name: string;
  path: string;            // absolute path to wiki dir
  project?: string;        // absolute path to project root
  include?: string[];
  exclude?: string[];
  schedule?: { scan?: string; lint?: string; ingest?: string | null };
  ingestRules?: { match: string; mode: 'auto-on-new' | 'propose-only' }[];
}

export interface WikiConfig {
  defaults?: {
    schedule?: { scan?: string; lint?: string; ingest?: string | null };
  };
  wikis: WikiEntry[];
}

const DEFAULT_CONFIG: RigConfig = {
  wiki: { defaultAgent: 'claude', qmd: { enabled: 'auto' }, logRotateMB: 50 },
};

const DEFAULT_WIKI_CONFIG: WikiConfig = {
  defaults: { schedule: { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null } },
  wikis: [],
};

function ensureHomeDir() {
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.locks, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.cache, { recursive: true });
}

function readJson5<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON5.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e: any) {
    throw new Error(`failed to parse ${file}: ${e.message}`);
  }
}

function writeJson5(file: string, data: unknown) {
  fs.writeFileSync(file, JSON5.stringify(data, null, 2) + '\n', 'utf8');
}

export function loadRigConfig(): RigConfig {
  ensureHomeDir();
  return { ...DEFAULT_CONFIG, ...readJson5<RigConfig>(paths.config, DEFAULT_CONFIG) };
}

export function saveRigConfig(cfg: RigConfig) {
  ensureHomeDir();
  writeJson5(paths.config, cfg);
}

export function loadWikiConfig(): WikiConfig {
  ensureHomeDir();
  const cfg = readJson5<WikiConfig>(paths.wikiConfig, DEFAULT_WIKI_CONFIG);
  // backwards-compat: ensure wikis array exists
  if (!Array.isArray(cfg.wikis)) cfg.wikis = [];
  return { ...DEFAULT_WIKI_CONFIG, ...cfg };
}

export function saveWikiConfig(cfg: WikiConfig) {
  ensureHomeDir();
  writeJson5(paths.wikiConfig, cfg);
}

/** Find a wiki entry by name OR by absolute path. */
export function findWiki(cfg: WikiConfig, nameOrPath: string): WikiEntry | undefined {
  return cfg.wikis.find(w => w.name === nameOrPath || w.path === path.resolve(nameOrPath));
}

/**
 * Resolve target wiki for a command:
 * 1. If `--wiki <name>` provided, look up by name.
 * 2. Else walk up from CWD; first match wins (by `project` or `path` prefix).
 * 3. Return undefined if nothing matches.
 */
export function resolveWiki(cfg: WikiConfig, wikiFlag?: string): WikiEntry | undefined {
  if (wikiFlag) return cfg.wikis.find(w => w.name === wikiFlag);
  const cwd = process.cwd();
  return cfg.wikis.find(w => cwd === w.path || cwd.startsWith(w.path + path.sep) ||
                              (w.project && (cwd === w.project || cwd.startsWith(w.project + path.sep))));
}
