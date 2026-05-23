import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { paths, vaultConfigPath } from './paths';

/**
 * Two-layer config model.
 *
 *   ~/.rig/config.yml       — rig-global preferences (agent / qmd / logRotate).
 *   ~/.rig/wikis.yml        — registry: list of absolute vault paths only.
 *   <vault>/.rig/config.yml — per-vault settings (name, include, exclude,
 *                             schedule, ingestRules, optional scan root).
 *
 * A `WikiEntry` is the composed view returned to consumers (registry path
 * + vault config + defaults). Nothing about a wiki's identity or scope lives
 * outside the vault itself; the global registry is just a discovery list.
 */

export interface RigConfig {
  wiki?: {
    defaultAgent?: 'claude' | 'codex' | 'pi';
    qmd?: { enabled?: 'auto' | 'on' | 'off' };
    logRotateMB?: number;
  };
}

/** Per-vault config persisted at `<vault>/.rig/config.yml`. */
export interface VaultConfig {
  name: string;
  /** Scan root relative to the vault. Default: `..` (vault's parent dir). */
  root?: string;
  include?: string[];
  exclude?: string[];
  schedule?: { scan?: string; lint?: string; ingest?: string | null };
  ingestRules?: { match: string; mode: 'auto-on-new' | 'propose-only' }[];
}

/** Global registry persisted at `~/.rig/wikis.yml`. */
export interface Registry {
  wikis: string[]; // absolute vault paths
}

/** Composed view used by all wiki commands. */
export interface WikiEntry {
  name: string;
  /** Absolute path to the vault dir. */
  path: string;
  /** Absolute path to the scan root (resolved from VaultConfig.root). */
  root: string;
  include: string[];
  exclude: string[];
  schedule?: { scan?: string; lint?: string; ingest?: string | null };
  ingestRules?: { match: string; mode: 'auto-on-new' | 'propose-only' }[];
}

export interface WikiConfig {
  wikis: WikiEntry[];
}

const DEFAULT_RIG_CONFIG: RigConfig = {
  wiki: { defaultAgent: 'claude', qmd: { enabled: 'auto' }, logRotateMB: 50 },
};

const DEFAULT_SCHEDULE = { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null };

function ensureHomeDir(): void {
  fs.mkdirSync(paths.home, { recursive: true });
  fs.mkdirSync(paths.locks, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.cache, { recursive: true });
}

function readYaml<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
    return (parsed ?? fallback) as T;
  } catch (e: any) {
    throw new Error(`failed to parse ${file}: ${e.message}`);
  }
}

function writeYaml(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(data, { lineWidth: 100, noRefs: true }), 'utf8');
}

// ─────────────────────────── rig-global config ───────────────────────────

export function loadRigConfig(): RigConfig {
  ensureHomeDir();
  return { ...DEFAULT_RIG_CONFIG, ...readYaml<RigConfig>(paths.config, DEFAULT_RIG_CONFIG) };
}

export function saveRigConfig(cfg: RigConfig): void {
  ensureHomeDir();
  writeYaml(paths.config, cfg);
}

// ─────────────────────────── registry (paths only) ───────────────────────

export function loadRegistry(): Registry {
  ensureHomeDir();
  const reg = readYaml<Registry>(paths.registry, { wikis: [] });
  if (!Array.isArray(reg.wikis)) reg.wikis = [];
  return reg;
}

export function saveRegistry(reg: Registry): void {
  ensureHomeDir();
  writeYaml(paths.registry, { wikis: reg.wikis });
}

// ─────────────────────────── per-vault config ────────────────────────────

export function loadVaultConfig(vaultDir: string): VaultConfig | null {
  const file = vaultConfigPath(vaultDir);
  if (!fs.existsSync(file)) return null;
  return readYaml<VaultConfig | null>(file, null);
}

export function saveVaultConfig(vaultDir: string, cfg: VaultConfig): void {
  writeYaml(vaultConfigPath(vaultDir), cfg);
}

// ───────────────────────────── composed view ─────────────────────────────

const HARDCODED_EXCLUDES = ['node_modules/**', '.git/**'];

function composeEntry(vaultPath: string): WikiEntry | null {
  const vault = loadVaultConfig(vaultPath);
  if (!vault) return null;
  const rootRel = vault.root ?? '..';
  const root = path.resolve(vaultPath, rootRel);
  const vaultBasename = path.basename(vaultPath);
  return {
    name: vault.name,
    path: vaultPath,
    root,
    include: vault.include ?? ['**/*.md'],
    exclude: vault.exclude ?? [`${vaultBasename}/**`, ...HARDCODED_EXCLUDES],
    schedule: vault.schedule ?? DEFAULT_SCHEDULE,
    ingestRules: vault.ingestRules ?? [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
  };
}

/**
 * Compose the list of registered wikis. Reads the registry and, for each
 * recorded path, loads the vault's own `.rig/config.yml`. Paths whose vault
 * config is missing or malformed are skipped silently (the user can re-run
 * `rig wiki register <path>` to repair).
 */
export function loadWikiConfig(): WikiConfig {
  const reg = loadRegistry();
  const wikis: WikiEntry[] = [];
  for (const p of reg.wikis) {
    const entry = composeEntry(p);
    if (entry) wikis.push(entry);
  }
  return { wikis };
}

/**
 * Resolve target wiki for a command:
 *   1. If `--wiki <name>` provided, look up by name.
 *   2. Otherwise walk up from CWD; first match wins (by vault `path` or `root`).
 *   3. Return undefined if nothing matches.
 */
export function resolveWiki(cfg: WikiConfig, wikiFlag?: string): WikiEntry | undefined {
  if (wikiFlag) return cfg.wikis.find(w => w.name === wikiFlag);
  const cwd = process.cwd();
  return cfg.wikis.find(w =>
    cwd === w.path ||
    cwd.startsWith(w.path + path.sep) ||
    cwd === w.root ||
    cwd.startsWith(w.root + path.sep),
  );
}
