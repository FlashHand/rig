// Shared guards for rig wiki — refuse to operate on hidden paths or
// .gitignored content. The user must explicitly copy such files into a
// visible, tracked location before they can become wiki sources.

import path from 'path';
import { spawnSync } from 'child_process';

export interface PathGuardResult {
  ok: boolean;
  reason?: 'hidden' | 'gitignored';
  segment?: string;       // for hidden: the offending segment
  detail?: string;        // human-readable detail
}

/** True if any path segment (except `.` / `..`) starts with `.`. */
export function isHiddenPath(p: string): boolean {
  for (const seg of segmentsOf(p)) {
    if (seg.startsWith('.')) return true;
  }
  return false;
}

/** First hidden segment, or null. */
export function hiddenSegment(p: string): string | null {
  for (const seg of segmentsOf(p)) {
    if (seg.startsWith('.')) return seg;
  }
  return null;
}

function segmentsOf(p: string): string[] {
  return p.split(path.sep).filter(s => s && s !== '.' && s !== '..');
}

/**
 * Returns true if the path is ignored by git in `repoCwd`'s repo.
 * Returns false if tracked/non-ignored. Returns null if not in a git repo
 * (so callers can pass the check transparently outside git contexts).
 */
export function isGitignored(p: string, repoCwd: string): boolean | null {
  const r = spawnSync('git', ['check-ignore', '-q', '--', p], {
    cwd: repoCwd,
    encoding: 'utf8',
  });
  if (r.status === 0) return true;   // ignored
  if (r.status === 1) return false;  // not ignored
  return null;                       // exit 128 (not a repo) or git missing
}

/**
 * Validate a path as a wiki source / target. Returns ok if visible AND
 * not gitignored. Use for `init` target and `ingest` source.
 */
export function guardPath(absPath: string, repoCwd: string): PathGuardResult {
  const seg = hiddenSegment(absPath);
  if (seg) {
    return {
      ok: false,
      reason: 'hidden',
      segment: seg,
      detail: `path contains a hidden segment "${seg}"`,
    };
  }
  const gi = isGitignored(absPath, repoCwd);
  if (gi === true) {
    return {
      ok: false,
      reason: 'gitignored',
      detail: '.gitignore matches this path',
    };
  }
  return { ok: true };
}

export function refusalMessage(target: string, r: PathGuardResult): string {
  const lines = [
    `refused: ${target}`,
    `  reason: ${r.reason} — ${r.detail}`,
    '',
    '  rig wiki refuses to operate on hidden files/dirs or .gitignored content.',
    '  If you really need this content, copy it to a visible, tracked location first:',
    '',
    '    cp -R <hidden-or-ignored> <wiki>/raw/manual-copy/    # then `rig wiki ingest`',
    '',
  ];
  return lines.join('\n');
}
