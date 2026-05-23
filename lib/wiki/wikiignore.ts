// .wikiignore — wiki-only ignore file with the same syntax as .gitignore.
//
// Why a separate file? `.gitignore` is shared with git; many repos
// (including the overmind workspace) intentionally commit directories
// like `keychain/` that the wiki MUST NEVER ingest. Mixing wiki-only
// excludes into `.gitignore` would break that contract. `.wikiignore`
// is read only by the wiki walker.
//
// Lookup rule: starting from each candidate's directory, walk up
// looking for `.wikiignore`. Every `.wikiignore` found along the path
// up to (and including) `vaultRoot` contributes rules, with patterns
// resolved relative to the dir that file lives in — same as gitignore.
//
// Implementation note: we use the `ignore` package because it
// faithfully implements gitignore semantics (anchoring, negation,
// `**`, trailing slash). Inlining a hand-rolled matcher invites subtle
// bugs that would silently exfiltrate sensitive paths.

import fs from 'fs';
import path from 'path';
import ignore, { Ignore } from 'ignore';

const FILENAME = '.wikiignore';

interface Layer {
  dir: string;        // dir the .wikiignore lives in
  matcher: Ignore;
}

/**
 * Returns the set of absolute paths matched by any `.wikiignore` file
 * found in `vaultRoot` or any directory between a candidate and
 * `vaultRoot` (inclusive). Paths above `vaultRoot` are NOT consulted.
 */
export function batchWikiIgnored(absPaths: string[], vaultRoot: string): Set<string> {
  const ignored = new Set<string>();
  if (absPaths.length === 0) return ignored;

  const root = path.resolve(vaultRoot);
  const layerCache = new Map<string, Layer | null>();

  // Build the ordered list of layers (root-most first) that apply to a
  // given candidate. Layers above `root` are ignored.
  function layersFor(abs: string): Layer[] {
    const layers: Layer[] = [];
    let dir = path.dirname(abs);
    while (true) {
      const cached = layerCache.get(dir);
      if (cached !== undefined) {
        if (cached) layers.push(cached);
      } else {
        const file = path.join(dir, FILENAME);
        let layer: Layer | null = null;
        if (fs.existsSync(file)) {
          try {
            const src = fs.readFileSync(file, 'utf8');
            layer = { dir, matcher: ignore().add(src) };
          } catch { /* unreadable — treat as no layer */ }
        }
        layerCache.set(dir, layer);
        if (layer) layers.push(layer);
      }
      if (dir === root) break;
      const parent = path.dirname(dir);
      if (parent === dir) break;        // hit filesystem root before vaultRoot
      dir = parent;
    }
    // root-most should win on equal-specificity → reverse so root is first
    return layers.reverse();
  }

  for (const abs of absPaths) {
    if (!abs.startsWith(root + path.sep) && abs !== root) continue;
    const layers = layersFor(abs);
    if (layers.length === 0) continue;
    // Each layer matches paths relative to its own dir, gitignore-style.
    // A later layer's negation can override an earlier match.
    let isIgnored = false;
    for (const layer of layers) {
      const rel = path.relative(layer.dir, abs);
      if (!rel || rel.startsWith('..')) continue;
      // `ignore` returns { ignored, unignored } via .test(); we mirror its
      // semantics by chaining .test() so negations later in the same file
      // can flip the bit back.
      const res = layer.matcher.test(rel);
      if (res.ignored) isIgnored = true;
      else if (res.unignored) isIgnored = false;
    }
    if (isIgnored) ignored.add(abs);
  }

  return ignored;
}
