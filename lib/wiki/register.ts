import fs from 'fs';
import path from 'path';
import print from '../print';
import {
  loadRegistry,
  saveRegistry,
  loadVaultConfig,
  saveVaultConfig,
  VaultConfig,
} from './config';

interface RegisterOpts {
  as?: string;
  force?: boolean;
}

/**
 * `rig wiki register [path]`
 *
 *   1. Resolve the vault dir (explicit arg, or walk up from CWD looking for
 *      a directory that already has `purpose.md`).
 *   2. Ensure `<vault>/.rig/config.yml` exists. Create it from defaults if
 *      missing; otherwise keep whatever the user authored.
 *   3. Apply the optional `--as <slug>` override to the vault config's name.
 *   4. Append the absolute vault path to `~/.rig/wikis.yml` (the
 *      discovery-only registry). No-op if already present.
 */
export default function wikiRegister(givenPath: string | undefined, opts: RegisterOpts): void {
  const vaultPath = path.resolve(givenPath || detectVaultPath(process.cwd()) || process.cwd());
  if (!fs.existsSync(vaultPath)) {
    print.error(`path does not exist: ${vaultPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(vaultPath, 'purpose.md'))) {
    print.error(`not a wiki vault (no purpose.md): ${vaultPath}`);
    print.info(`run \`rig wiki init ${shortPath(vaultPath)}\` first.`);
    process.exit(1);
  }

  // Load or seed the per-vault config.
  let vault = loadVaultConfig(vaultPath);
  if (!vault) {
    vault = defaultVaultConfig(path.basename(vaultPath));
  }
  const desiredName = (opts.as || vault.name || path.basename(vaultPath)).trim();
  if (!desiredName) {
    print.error('failed to derive a wiki name; pass --as <slug>');
    process.exit(1);
  }

  // Name collision in the registry — surfaced by composing the registry.
  const reg = loadRegistry();
  for (const existingPath of reg.wikis) {
    if (existingPath === vaultPath) continue;
    const other = loadVaultConfig(existingPath);
    if (other && other.name === desiredName) {
      if (!opts.force) {
        print.error(`wiki "${desiredName}" already registered at ${existingPath}; pass --force to overwrite`);
        process.exit(1);
      }
      // --force: drop the old entry, the new one wins.
      reg.wikis = reg.wikis.filter(p => p !== existingPath);
    }
  }

  vault.name = desiredName;
  saveVaultConfig(vaultPath, vault);

  if (!reg.wikis.includes(vaultPath)) reg.wikis.push(vaultPath);
  saveRegistry(reg);

  print.succeed(`registered wiki "${desiredName}" -> ${vaultPath}`);
}

function detectVaultPath(start: string): string | undefined {
  const candidates = ['harness/llm-wiki', 'wiki'];
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'purpose.md'))) return dir;
    for (const c of candidates) {
      const cand = path.join(dir, c);
      if (fs.existsSync(path.join(cand, 'purpose.md'))) return cand;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function defaultVaultConfig(vaultBasename: string): VaultConfig {
  return {
    name: vaultBasename,
    root: '..',
    include: ['**/*.md'],
    exclude: [`${vaultBasename}/**`, 'node_modules/**', '.git/**'],
    schedule: { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null },
    ingestRules: [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
  };
}

function shortPath(p: string): string {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
