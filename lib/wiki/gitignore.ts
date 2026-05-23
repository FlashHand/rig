// Multi-repo-aware .gitignore checker.
//
// Plain `git check-ignore --stdin` only knows the rules of one repo —
// the one its cwd lives in. When the wiki walker traverses a parent
// project that contains git submodules, each submodule has its OWN
// .gitignore (e.g. `node_modules/`) that the parent repo does NOT
// inherit. Running check-ignore from the parent's root therefore lets
// the submodule's node_modules / build/ / etc. slip through as wiki
// candidates — exactly the bug the user reported.
//
// Fix: for every candidate path, find its owning git repo (the nearest
// ancestor that has `.git` as a dir or file — submodules use a `.git`
// file pointing into the parent's `modules/` dir), bucket the
// candidates by owning repo, then run a single `git check-ignore` per
// bucket with cwd set to that repo's root. Each repo's own
// .gitignore(s) get correctly applied to the paths inside it.
//
// Paths outside any git repo are treated as "not ignored" (no rules to
// apply). Files whose owning repo can't process them (e.g. git binary
// missing) are also treated as "not ignored" — conservative, since we
// already have the walk-time hidden / binary-extension filters as a
// hard floor.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/**
 * Returns a Set of the *absolute* paths that any owning git repo's
 * .gitignore rules consider ignored.
 */
export function batchGitignored(absPaths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (absPaths.length === 0) return ignored;

  // Bucket by owning git repo. Memoize directory → repo so a deep walk
  // doesn't re-traverse parents for every file in the same dir.
  const dirToRepo = new Map<string, string | null>();
  const byRepo = new Map<string, string[]>();
  for (const abs of absPaths) {
    const dir = path.dirname(abs);
    let repo = dirToRepo.get(dir);
    if (repo === undefined) {
      repo = findGitRoot(dir);
      dirToRepo.set(dir, repo);
    }
    if (!repo) continue; // outside any git repo → not ignored
    const list = byRepo.get(repo);
    if (list) list.push(abs);
    else byRepo.set(repo, [abs]);
  }

  for (const [repo, paths] of byRepo) {
    // Pass paths as relative to the repo's root (git check-ignore
    // accepts both, but relatives are friendlier with --stdin).
    const rels = paths.map(p => path.relative(repo, p));
    const r = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
      cwd: repo,
      input: Buffer.from(rels.join('\0') + '\0'),
    });
    if (r.status === 128) continue;          // not a git repo (shouldn't happen here)
    if (!r.stdout || r.stdout.length === 0) continue;
    const lines = Buffer.isBuffer(r.stdout)
      ? r.stdout.toString('utf8').split('\0')
      : String(r.stdout).split('\0');
    for (const line of lines) {
      if (!line) continue;
      ignored.add(path.resolve(repo, line));
    }
  }

  return ignored;
}

/**
 * Walk up from `start` looking for `.git` (either a directory for a
 * regular repo OR a file for a submodule pointing into its parent's
 * `modules/` storage). Returns the directory containing `.git`, or
 * null if no ancestor has one.
 */
export function findGitRoot(start: string): string | null {
  let dir = path.resolve(start);
  while (true) {
    const dotgit = path.join(dir, '.git');
    if (fs.existsSync(dotgit)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
