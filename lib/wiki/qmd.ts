// qmd integration — in-process Node SDK (`@tobilu/qmd`).
//
// rig bundles @tobilu/qmd as a hard dependency since v4.0.1 — no separate
// `npm i -g qmd` step. The package is ESM-only and uses native modules
// (better-sqlite3, sqlite-vec, node-llama-cpp), so we dynamic-import it from
// the bundled CJS build and let Node resolve native deps at runtime.
//
// Per-wiki SQLite DB lives at `~/.rig/cache/qmd/<wiki>.sqlite` — never inside
// the project tree, never via XDG_CACHE_HOME. Embedding model GGUFs cache in
// `~/.cache/qmd/models/` (hardcoded inside @tobilu/qmd; not configurable).
//
// Concurrency note: qmd's `setConfigSource` is module-global; serialize
// store lifetimes by opening + closing inside each call (no daemons-style
// long-lived store yet). If we ever add one, route everything through a
// single shared store instance.

import fs from 'fs';
import path from 'path';
import { paths } from './paths';

// CDN-backed default embed model — Qwen3-Embedding-0.6B Q8_0 GGUF.
// Globally accelerated via Aliyun CDN; node-llama-cpp's resolveModelFile
// accepts https:// URIs natively. qmd's `isQwen3EmbeddingModel` matches the
// "Qwen.*Embed" pattern in this URL, so the Qwen3 instruction template
// (Instruct:/Query:) is applied automatically.
const DEFAULT_EMBED_MODEL_URL = 'https://assets.terncloud.com/rig/models/Qwen3-Embedding-0.6B-Q8_0.gguf';

// Apply the rig default unless the user pinned a different model. This runs
// at module load so every qmd call inherits it without the caller worrying.
if (!process.env.QMD_EMBED_MODEL) {
  process.env.QMD_EMBED_MODEL = DEFAULT_EMBED_MODEL_URL;
}

export interface QmdInfo {
  installed: true;
  version: string;
  bundled: true;
  embedModel: string;
}

let infoCache: QmdInfo | null = null;

export function detectQmd(): QmdInfo {
  if (infoCache) return infoCache;
  infoCache = {
    installed: true,
    version: qmdVersion(),
    bundled: true,
    embedModel: process.env.QMD_EMBED_MODEL || DEFAULT_EMBED_MODEL_URL,
  };
  return infoCache;
}

// qmd is ESM-only and its `exports` field blocks both `require('@tobilu/qmd')`
// and `require('@tobilu/qmd/package.json')`, so `require.resolve` doesn't
// work either. Walk up from this file's __dirname looking for a
// node_modules/@tobilu/qmd/package.json. Works in both bundled (built/) and
// ts-node (lib/wiki/) layouts because both share an ancestor that contains
// the rig package's node_modules.
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

function dbPathFor(wikiName: string): string {
  const dir = path.join(paths.cache, 'qmd');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${wikiName}.sqlite`);
}

// Dynamic-import shim. qmd is ESM-only; rig is bundled to CJS via esbuild
// with @tobilu/qmd marked external, so `await import('@tobilu/qmd')` lands at
// runtime as a Node native ESM import.
async function loadQmd(): Promise<{ createStore: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await import('@tobilu/qmd');
  return { createStore: m.createStore };
}

/**
 * Embed a wiki dir into its per-wiki qmd store. Incremental by default;
 * pass `{ force: true }` to re-embed everything (e.g. after a model swap).
 */
export async function qmdEmbed(
  wikiName: string,
  dir: string,
  opts: { force?: boolean } = {}
): Promise<{ ok: boolean; stderr: string }> {
  try {
    const { createStore } = await loadQmd();
    const store = await createStore({
      dbPath: dbPathFor(wikiName),
      config: {
        collections: {
          [wikiName]: { path: dir, pattern: '**/*.md' },
        },
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

export type QmdQueryMode = 'lex' | 'vector' | 'hybrid';

/**
 * Query the per-wiki qmd store. Three modes:
 *   - 'lex'    : BM25 only via searchLex. No model load. Always works.
 *   - 'vector' : sqlite-vec only via searchVector. Uses the embed model
 *                (already downloaded for `index` / `embed`).
 *   - 'hybrid' : full BM25 + vec + rerank via search(). Triggers a one-time
 *                ~1GB download of qmd's query-expansion model from HF —
 *                slow / sometimes blocked in CN. Opt-in.
 */
export async function qmdQuery(
  q: string,
  wikiName: string,
  opts: { limit?: number; mode?: QmdQueryMode; rerank?: boolean } = {}
): Promise<unknown[] | null> {
  const mode: QmdQueryMode = opts.mode || 'lex';
  try {
    const { createStore } = await loadQmd();
    const store = await createStore({ dbPath: dbPathFor(wikiName) });
    try {
      const limit = opts.limit ?? 10;
      let results: unknown;
      if (mode === 'lex') {
        results = await store.searchLex(q, { limit, collection: wikiName });
      } else if (mode === 'vector') {
        results = await store.searchVector(q, { limit, collection: wikiName });
      } else {
        results = await store.search({
          query: q,
          limit,
          collection: wikiName,
          skipRerank: !opts.rerank,
        });
      }
      return Array.isArray(results) ? results : [];
    } finally {
      await store.close();
    }
  } catch {
    return null;
  }
}

/** Wipe the per-wiki SQLite store on disk. Caller should then qmdEmbed. */
export function qmdResetStore(wikiName: string): void {
  const p = dbPathFor(wikiName);
  for (const suffix of ['', '-wal', '-shm']) {
    const f = p + suffix;
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
