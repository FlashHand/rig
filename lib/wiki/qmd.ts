import { execSync, spawnSync } from 'child_process';

export interface QmdInfo {
  installed: boolean;
  version?: string;
  binPath?: string;
}

let cache: QmdInfo | null = null;

export function detectQmd(force = false): QmdInfo {
  if (cache && !force) return cache;
  try {
    const binPath = execSync('command -v qmd', { encoding: 'utf8' }).trim();
    if (!binPath) {
      cache = { installed: false };
      return cache;
    }
    const versionLine = spawnSync('qmd', ['--version'], { encoding: 'utf8' }).stdout || '';
    const version = versionLine.trim().split(/\s+/).pop();
    cache = { installed: true, binPath, version };
  } catch {
    cache = { installed: false };
  }
  return cache;
}

/**
 * Run `qmd query --json <q>` and return the parsed result, or null if qmd absent
 * / non-zero exit.
 */
export function qmdQuery(q: string, collection?: string): unknown | null {
  if (!detectQmd().installed) return null;
  const args = ['query', '--json'];
  if (collection) args.push('--collection', collection);
  args.push(q);
  const res = spawnSync('qmd', args, { encoding: 'utf8' });
  if (res.status !== 0) return null;
  try { return JSON.parse(res.stdout); } catch { return null; }
}

export function qmdEmbed(collection: string, dir: string): { ok: boolean; stderr: string } {
  if (!detectQmd().installed) return { ok: false, stderr: 'qmd not installed' };
  // ensure collection exists; idempotent — qmd should no-op on duplicates
  spawnSync('qmd', ['collection', 'add', dir, '--name', collection], { encoding: 'utf8' });
  const res = spawnSync('qmd', ['embed', '--collection', collection], { encoding: 'utf8' });
  return { ok: res.status === 0, stderr: res.stderr || '' };
}
