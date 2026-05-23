// `rig wiki query` — hybrid retrieval over a registered wiki.
//
// Path: qmd hybrid (BM25 + sqlite-vec) → render top-k hits with
// [[wikilink]] citations where the hit lives in <wiki>/wiki/<sub>/.
//
// Default output is human-readable; --json emits the raw qmd payload.
// --synth invokes the Claude adapter to write a short answer paragraph that
// cites the top hits (gated because it spawns the agent).

import path from 'path';
import print from '../print';
import { loadWikiConfig, resolveWiki, loadRigConfig, WikiEntry } from './config';
import { qmdQuery, QmdQueryMode } from './qmd';
import { adapters } from './agent/registry';

interface QueryOpts {
  wiki?: string;
  json?: boolean;
  limit?: number;
  synth?: boolean;
  rerank?: boolean;
  vector?: boolean;
  hybrid?: boolean;
}

// Subset of qmd's HybridQueryResult we actually care about. Keep loose typing
// to absorb minor SDK shape drift.
interface QmdHit {
  file?: string;
  displayPath?: string;
  title?: string;
  body?: string;
  bestChunk?: string;
  score?: number;
  context?: unknown;
  docid?: string;
}

export default async function wikiQuery(q: string, opts: QueryOpts): Promise<void> {
  if (!q || !q.trim()) {
    print.error('empty query.');
    process.exit(1);
  }
  const cfg = loadWikiConfig();
  const target = resolveWiki(cfg, opts.wiki);
  if (!target) {
    print.error('no wiki resolved. Pass --wiki <name> or run from inside a registered project.');
    process.exit(1);
  }

  const limit = Math.max(1, Math.min(50, opts.limit || 10));
  const mode: QmdQueryMode = opts.hybrid ? 'hybrid' : opts.vector ? 'vector' : 'lex';
  const raw = await qmdQuery(q, target.name, { limit, mode, rerank: !!opts.rerank });
  if (raw === null) {
    print.error('qmd query failed. Run `rig wiki index` first to (re)build the vector store.');
    process.exit(1);
  }
  const hits = (raw as QmdHit[]).slice(0, limit);

  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, code: 0, data: { query: q, hits } }, null, 2));
    return;
  }

  printHits(target, q, hits);

  if (opts.synth) await synthesize(target, q, hits);
}

function printHits(wiki: WikiEntry, q: string, hits: QmdHit[]): void {
  print.info(`query: ${q}`);
  if (hits.length === 0) {
    print.warn('no hits.');
    return;
  }
  // eslint-disable-next-line no-console
  console.log('');
  hits.forEach((h, i) => {
    const filePath = h.file || h.displayPath || '<unknown>';
    const wlink = toWikilink(wiki, filePath);
    const score = typeof h.score === 'number' ? h.score.toFixed(4) : '—';
    const head = wlink ? `[[${wlink}]]` : filePath;
    // eslint-disable-next-line no-console
    console.log(`${String(i + 1).padStart(2)}. ${head}  (score=${score})`);
    const snippet = (h.bestChunk || h.body || '').trim().replace(/\s+/g, ' ').slice(0, 220);
    if (snippet) {
      // eslint-disable-next-line no-console
      console.log(`    ${snippet}${snippet.length === 220 ? '…' : ''}`);
    }
  });
  // eslint-disable-next-line no-console
  console.log('');
}

// Translate "/abs/.../wiki/sources/foo.md" → "foo" (wikilink slug). Anything
// outside the wiki's wiki/<sub>/ tree falls back to a literal path.
function toWikilink(wiki: WikiEntry, filePath: string): string | null {
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(wiki.path, filePath);
    const wikiRoot = path.join(wiki.path, 'wiki') + path.sep;
    if (!abs.startsWith(wikiRoot)) return null;
    return path.basename(abs, path.extname(abs));
  } catch { return null; }
}

async function synthesize(wiki: WikiEntry, q: string, hits: QmdHit[]): Promise<void> {
  const rig = loadRigConfig();
  const which = rig.wiki?.defaultAgent || 'claude';
  const adapter = adapters.find(a => a.name === which);
  if (!adapter) {
    print.warn(`no agent adapter named ${which}; skipping synthesis.`);
    return;
  }
  const detect = await adapter.detect();
  if (!detect.installed) {
    print.warn(`${which} not installed on PATH; skipping synthesis.`);
    return;
  }

  const ctx = hits.slice(0, 8).map((h, i) => {
    const filePath = h.file || h.displayPath || '<unknown>';
    const wlink = toWikilink(wiki, filePath);
    const cite = wlink ? `[[${wlink}]]` : filePath;
    const body = (h.bestChunk || h.body || '').trim().slice(0, 1200);
    return `## hit ${i + 1} ${cite}\n${body}`;
  }).join('\n\n');

  const prompt = [
    `You are answering a question about a personal wiki.`,
    `Question: ${q}`,
    ``,
    `Top retrieval results follow. Synthesize a concise answer (≤ 6 sentences)`,
    `that cites the hits using [[wikilink]] format inline. If the hits don't`,
    `support an answer, say so. Do NOT write to any files. Output text only.`,
    ``,
    ctx,
  ].join('\n');

  print.start(`${which} synthesize`);
  const res = await adapter.run({
    prompt,
    cwd: wiki.path,
    allowWrite: false,
    tools: [],
    timeoutMs: 5 * 60 * 1000,
  });
  if (!res.ok) {
    print.error(`${which} failed (code ${res.exitCode})${res.stderr ? `: ${res.stderr.trim().slice(0, 300)}` : ''}`);
    return;
  }
  print.succeed(`${which} answer:`);
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(res.stdout.trim());
  // eslint-disable-next-line no-console
  console.log('');
}
