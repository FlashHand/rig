// Prune wiki pages whose underlying source file has been deleted from the
// scan root. Triggered by `rig wiki sync` (and exposed as a helper for
// `rig wiki prune` if/when we add a standalone command).
//
// Three actions per deleted source path:
//
//   1. Delete `sources/<slug>.md` whose `source-path:` frontmatter resolves
//      to the deleted file. The slug = basename of that wiki source page.
//
//   2. Scrub the deleted slug from every derived page's `sources: [...]`
//      frontmatter array (entities/concepts/synthesis/queries). Pages that
//      end up with an empty `sources: []` are left in place for `rig wiki
//      lint` to surface as orphans — we don't auto-delete derived pages
//      since they may carry the user's intellectual content distinct from
//      any single source.
//
//   3. Drop the row from `state.db.source_sha` so future scans don't keep
//      reporting the file as DELETED.

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { WikiEntry } from './config';
import { deleteSourceSha } from './db';

const DERIVED_DIRS = ['entities', 'concepts', 'synthesis', 'queries'];

export interface PruneReport {
  /** wiki-relative paths of source pages deleted */
  deletedSourcePages: string[];
  /** wiki-relative paths of derived pages whose sources[] lost the dropped slug */
  scrubbedDerivedPages: string[];
  /** root-relative paths of source_sha rows dropped */
  shaRowsDropped: string[];
}

export function pruneDeletedSources(target: WikiEntry, deletedRelPaths: string[]): PruneReport {
  const report: PruneReport = { deletedSourcePages: [], scrubbedDerivedPages: [], shaRowsDropped: [] };
  if (deletedRelPaths.length === 0) return report;

  const deletedSet = new Set(deletedRelPaths.map(normalizePath));
  const sourcesDir = path.join(target.path, 'sources');
  const droppedSlugs = new Set<string>();

  // 1. sources/<slug>.md whose `source-path:` points at a deleted file
  if (fs.existsSync(sourcesDir)) {
    for (const file of fs.readdirSync(sourcesDir)) {
      if (!file.endsWith('.md') || file === '.gitkeep') continue;
      const abs = path.join(sourcesDir, file);
      const fm = readFrontmatter(abs);
      if (!fm) continue;
      const rel = extractSourcePathRel(String(fm['source-path'] || ''));
      if (rel && deletedSet.has(rel)) {
        fs.rmSync(abs, { force: true });
        report.deletedSourcePages.push(path.relative(target.path, abs));
        droppedSlugs.add(path.basename(file, '.md'));
      }
    }
  }

  // 2. derived pages — strip dropped slugs from `sources: [...]`
  if (droppedSlugs.size > 0) {
    for (const sub of DERIVED_DIRS) {
      const dir = path.join(target.path, sub);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.md') || file === '.gitkeep') continue;
        const abs = path.join(dir, file);
        const content = fs.readFileSync(abs, 'utf8');
        const next = scrubSlugsFromSourcesArray(content, droppedSlugs);
        if (next !== content) {
          fs.writeFileSync(abs, next, 'utf8');
          report.scrubbedDerivedPages.push(path.relative(target.path, abs));
        }
      }
    }
  }

  // 3. state.db cleanup
  for (const p of deletedRelPaths) {
    deleteSourceSha(target.name, p);
    report.shaRowsDropped.push(p);
  }

  return report;
}

// ─── helpers ────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

function readFrontmatter(file: string): Record<string, unknown> | null {
  let content: string;
  try { content = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---', 4);
  if (end < 0) return null;
  try {
    const parsed = yaml.load(content.slice(4, end));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * `source-path` can be:
 *   - an obsidian:// URL:  `obsidian://open?vault=name&file=<encoded-path>`
 *   - a plain root-relative path: `personal/work/foo.md`
 * Returns the underlying root-relative path, or null if we can't extract one.
 */
function extractSourcePathRel(srcPath: string): string | null {
  if (!srcPath) return null;
  const m = srcPath.match(/[?&]file=([^&]+)/);
  if (m) {
    try { return normalizePath(decodeURIComponent(m[1])); }
    catch { return normalizePath(m[1]); }
  }
  return normalizePath(srcPath);
}

/**
 * Surgically rewrites the `sources: [a, b, c]` frontmatter line, removing
 * any entries that appear in `slugs`. Leaves the rest of the frontmatter
 * and body untouched. If no match, returns the content unchanged.
 */
function scrubSlugsFromSourcesArray(content: string, slugs: Set<string>): string {
  if (!content.startsWith('---\n')) return content;
  const end = content.indexOf('\n---', 4);
  if (end < 0) return content;
  const fm = content.slice(4, end);
  const after = content.slice(end);

  const m = fm.match(/^([ \t]*sources[ \t]*:[ \t]*)\[(.*?)\]/m);
  if (!m) return content;

  const items = m[2]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(s => s && !slugs.has(s));

  const newSources = `${m[1]}[${items.map(s => `'${s}'`).join(', ')}]`;
  const newFm = fm.replace(m[0], newSources);
  return '---\n' + newFm + after;
}
