// qmd integration — in-process Node SDK (`@tobilu/qmd`).
//
// rig wiki is vector-only: indexing always embeds, queries are pure
// `searchVector` followed by a Qwen3-Reranker pass. No BM25, no query
// expansion, no language-specific tokenizer headaches.
//
// Two models, both mirrored on the personal CDN for zero-config global
// acceleration (China + worldwide via Aliyun PoPs):
//   - Embed: Qwen3-Embedding-0.6B   (~610MB, sets QMD_EMBED_MODEL)
//   - Rerank: Qwen3-Reranker-0.6B   (~610MB, sets QMD_RERANK_MODEL)
//
// Per-wiki SQLite DB lives at `~/.rig/<project>/wiki/<wiki>.sqlite`, where
// `<project>` is the `name` from the nearest `package.json` walking up from
// the vault root (fallback: vault-root basename). The extra `wiki/` segment
// reserves room for other per-project rig artifacts as siblings. Legacy
// `~/.rig/cache/qmd/<wiki>.sqlite` is migrated lazily on first open.
//
// Model GGUFs still cache in `~/.cache/qmd/models/` (hardcoded inside qmd).
//
// Concurrency note: qmd's `setConfigSource` is module-global; serialize
// store lifetimes by opening + closing inside each call.

import fs from 'fs';
import path from 'path';
import { paths } from './paths';

// CDN-backed defaults. node-llama-cpp's resolveModelFile accepts https://.
// qmd's `isQwen3EmbeddingModel` matches "Qwen.*Embed" in the URI, so the
// Qwen3 query-instruction template (Instruct:/Query:) is auto-applied.
const DEFAULT_EMBED_MODEL_URL = 'https://assets.terncloud.com/rig/models/Qwen3-Embedding-0.6B-Q8_0.gguf';
const DEFAULT_RERANK_MODEL_URL = 'https://assets.terncloud.com/rig/models/qwen3-reranker-0.6b-q8_0.gguf';

// Apply rig defaults unless the user pinned different ones. Runs at module
// load so every qmd call inherits without the caller worrying.
if (!process.env.QMD_EMBED_MODEL) process.env.QMD_EMBED_MODEL = DEFAULT_EMBED_MODEL_URL;
if (!process.env.QMD_RERANK_MODEL) process.env.QMD_RERANK_MODEL = DEFAULT_RERANK_MODEL_URL;

export interface QmdInfo {
  installed: true;
  version: string;
  bundled: true;
  embedModel: string;
  rerankModel: string;
}

let infoCache: QmdInfo | null = null;

export function detectQmd(): QmdInfo {
  if (infoCache) return infoCache;
  infoCache = {
    installed: true,
    version: qmdVersion(),
    bundled: true,
    embedModel: process.env.QMD_EMBED_MODEL || DEFAULT_EMBED_MODEL_URL,
    rerankModel: process.env.QMD_RERANK_MODEL || DEFAULT_RERANK_MODEL_URL,
  };
  return infoCache;
}

// qmd's `exports` field blocks `require.resolve('@tobilu/qmd')`; walk up
// from __dirname looking for node_modules/@tobilu/qmd/package.json instead.
function qmdVersion(): string {
  try {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
      const p = path.join(dir, 'node_modules', '@tobilu', 'qmd', 'package.json');
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (pkg.name === '@tobilu/qmd' && typeof pkg.version === 'string') return pkg.version;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* fall through */ }
  return 'unknown';
}

/**
 * Resolve the project name for a vault: read the `name` field from the
 * nearest `package.json` walking up from `vaultRoot`. Falls back to
 * `basename(vaultRoot)` if no package.json with a usable name is found.
 * Scoped names (`@scope/foo`) are flattened to `scope_foo`.
 */
function resolveProjectName(vaultRoot: string): string {
  let dir = path.resolve(vaultRoot);
  while (true) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (typeof parsed.name === 'string' && parsed.name.trim()) {
          return sanitizeSegment(parsed.name.trim());
        }
      } catch { /* malformed package.json — keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return sanitizeSegment(path.basename(vaultRoot)) || 'unknown';
}

function sanitizeSegment(s: string): string {
  // npm scoped names use `/`; flatten so we don't create unintended nesting.
  // Also defang filesystem-hostile chars and leading dots.
  return s
    .replace(/^@/, '')
    .replace(/[/\\]/g, '_')
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '');
}

function dbPathFor(wikiName: string, vaultRoot: string): string {
  const projectName = resolveProjectName(vaultRoot);
  const dir = path.join(paths.home, projectName, 'wiki');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${wikiName}.sqlite`);
  // One-shot migration from the legacy flat layout.
  const legacy = path.join(paths.cache, 'qmd', `${wikiName}.sqlite`);
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const src = legacy + suffix;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, target + suffix); }
        catch { /* cross-device? leave the legacy file in place */ }
      }
    }
  }
  return target;
}

async function loadQmd(): Promise<{ createStore: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await import('@tobilu/qmd');
  return { createStore: m.createStore };
}

/**
 * Embed a wiki dir. Incremental by default; pass `{ force: true }` to
 * re-embed everything (e.g. after switching the embed model).
 */
export async function qmdEmbed(
  wikiName: string,
  dir: string,
  vaultRoot: string,
  opts: { force?: boolean } = {}
): Promise<{ ok: boolean; stderr: string }> {
  try {
    const { createStore } = await loadQmd();
    const store = await createStore({
      dbPath: dbPathFor(wikiName, vaultRoot),
      config: {
        collections: { [wikiName]: { path: dir, pattern: '**/*.md' } },
      },
    });
    try {
      await store.update({});
      await store.embed({ chunkStrategy: 'auto', force: !!opts.force });
    } finally {
      await store.close();
    }
    return { ok: true, stderr: '' };
  } catch (e) {
    return { ok: false, stderr: errMsg(e) };
  }
}

export interface QmdHit {
  file: string;
  displayPath?: string;
  title?: string;
  body?: string;
  score: number;
  rerankScore?: number;
}

/**
 * Pure vector search + Qwen3 reranker.
 *
 * Pipeline:
 *   1. searchVector(top 40, dedup'd by docid via qmd internals)
 *   2. Store.rerank() against the candidate set's chunk bodies
 *   3. Sort by rerank score, return top-k
 *
 * Set `{ rerank: false }` to skip step 2 (faster, no reranker model load).
 */
export async function qmdQuery(
  q: string,
  wikiName: string,
  vaultRoot: string,
  opts: { limit?: number; candidateLimit?: number; rerank?: boolean } = {}
): Promise<QmdHit[] | null> {
  const limit = opts.limit ?? 10;
  const candidateLimit = Math.max(limit, opts.candidateLimit ?? 40);
  const doRerank = opts.rerank !== false; // default ON

  try {
    const { createStore } = await loadQmd();
    const store = await createStore({ dbPath: dbPathFor(wikiName, vaultRoot) });
    try {
      const raw = await store.searchVector(q, { limit: candidateLimit, collection: wikiName });
      const candidates: QmdHit[] = Array.isArray(raw) ? raw.map(normalizeHit) : [];
      if (!doRerank || candidates.length === 0) return candidates.slice(0, limit);

      const docs = candidates
        .filter(c => c.file && (c.body || ''))
        .map(c => ({ file: c.file, text: c.body || '' }));
      if (docs.length === 0) return candidates.slice(0, limit);

      // qmd 2.5.x exposes `rerank` only on store.internal (not on the public
      // QMDStore). store.search(opts) does include reranking but also runs
      // BM25 + query expansion, which we want to avoid.
      const reranker = store.internal && store.internal.rerank;
      if (typeof reranker !== 'function') {
        // No standalone rerank available — return vector hits as-is.
        return candidates.slice(0, limit);
      }
      const ranked: { file: string; score: number }[] = await reranker(q, docs);
      const scoreByFile = new Map(ranked.map(r => [r.file, r.score]));
      const merged = candidates.map(c => ({
        ...c,
        rerankScore: scoreByFile.get(c.file) ?? 0,
      }));
      merged.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
      return merged.slice(0, limit);
    } finally {
      await store.close();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`qmd query error: ${errMsg(e)}`);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeHit(h: any): QmdHit {
  return {
    file: h.file ?? h.displayPath ?? '',
    displayPath: h.displayPath,
    title: h.title,
    body: h.bestChunk ?? h.body ?? '',
    score: typeof h.score === 'number' ? h.score : 0,
  };
}

/** Wipe the per-wiki SQLite store on disk. Caller should then qmdEmbed. */
export function qmdResetStore(wikiName: string, vaultRoot: string): void {
  const p = dbPathFor(wikiName, vaultRoot);
  for (const suffix of ['', '-wal', '-shm']) {
    const f = p + suffix;
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
