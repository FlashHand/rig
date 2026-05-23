import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { paths, vaultConfigPath } from './paths';

/**
 * Two-layer config model.
 *
 *   ~/.rig/config.yml       — rig-global preferences (agent / qmd / logRotate).
 *   <vault>/.rig/config.yml — per-vault settings (name, include, exclude,
 *                             schedule, ingestRules, optional scan root).
 *
 * There is **no global registry**. A vault is discovered by walking up from
 * the current working directory looking for `.rig/config.yml`. Everything
 * about a vault — its identity, its scope, its schedule — lives inside the
 * vault dir itself.
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

/** Composed view used by all wiki commands. */
export interface WikiEntry {
  name: string;
  /** Absolute path to the vault dir. */
  path: string;
  /** Absolute path to the scan root. */
  root: string;
  include: string[];
  exclude: string[];
  schedule?: { scan?: string; lint?: string; ingest?: string | null };
  ingestRules?: { match: string; mode: 'auto-on-new' | 'propose-only' }[];
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

// ─────────────────────────── per-vault config ────────────────────────────

export function loadVaultConfig(vaultDir: string): VaultConfig | null {
  const file = vaultConfigPath(vaultDir);
  if (!fs.existsSync(file)) return null;
  return readYaml<VaultConfig | null>(file, null);
}

export function saveVaultConfig(vaultDir: string, cfg: VaultConfig): void {
  writeYaml(vaultConfigPath(vaultDir), cfg);
}

// ─────────────────────────── vault discovery ─────────────────────────────

function composeEntry(vaultPath: string, vault: VaultConfig): WikiEntry {
  const rootRel = vault.root ?? '..';
  const root = path.resolve(vaultPath, rootRel);
  return {
    name: vault.name || path.basename(vaultPath),
    path: vaultPath,
    root,
    include: vault.include ?? ['**/*.md'],
    exclude: vault.exclude ?? [],
    schedule: vault.schedule ?? DEFAULT_SCHEDULE,
    ingestRules: vault.ingestRules ?? [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
  };
}

/**
 * Walk up from `start` (default: CWD) looking for a vault. At each ancestor
 * we check two patterns:
 *
 *   1. **The dir itself is the vault** — `<dir>/.rig/config.yml` exists.
 *      Triggered when the user is inside the vault or below it.
 *   2. **An immediate child is the vault** — some `<dir>/<child>/.rig/config.yml`
 *      exists. Triggered when the user is at the project root (the common
 *      case for `cd <project> && rig wiki *` where the vault is
 *      `<project>/rig-wiki/`). If multiple children are vaults, the
 *      lexicographically first wins.
 *
 * Returns the composed `WikiEntry`, or `undefined` if no vault is found.
 *
 * Callers that need a vault and don't have one must produce a helpful error
 * themselves — `resolveVault` is a pure lookup and stays quiet.
 */
export function resolveVault(start?: string): WikiEntry | undefined {
  let dir = path.resolve(start || process.cwd());
  while (true) {
    // 1. Is `dir` itself a vault?
    if (fs.existsSync(vaultConfigPath(dir))) {
      const v = loadVaultConfig(dir);
      if (v) return composeEntry(dir, v);
    }
    // 2. Does any immediate child of `dir` look like a vault?
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
        .sort();
      for (const name of entries) {
        const child = path.join(dir, name);
        if (fs.existsSync(vaultConfigPath(child))) {
          const v = loadVaultConfig(child);
          if (v) return composeEntry(child, v);
        }
      }
    } catch { /* unreadable dir — fall through to parent */ }

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Same as `resolveVault` but exits the process with a clear error when no
 * vault is found. Use from CLI commands.
 */
export function requireVault(): WikiEntry {
  const v = resolveVault();
  if (v) return v;
  // eslint-disable-next-line no-console
  console.error('No rig wiki vault found. cd into a vault directory (one that contains .rig/config.yml) or run `rig wiki init <path>` first.');
  process.exit(1);
}
