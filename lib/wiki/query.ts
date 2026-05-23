// `rig wiki query` — vector retrieval over a registered wiki.
//
// Pipeline: Qwen3-Embedding-0.6B (sqlite-vec) → Qwen3-Reranker-0.6B → top-k.
// No BM25, no query expansion. Cross-lingual (Chinese ↔ English) works
// because both Qwen3 models are multilingual.
//
// Default output is human-readable; --json emits the raw payload. --synth
// invokes the Claude adapter to write a short answer paragraph with
// [[wikilink]] citations.

import path from 'path';
import print from '../print';
import { requireVault, loadRigConfig, WikiEntry } from './config';
import { qmdQuery, QmdHit } from './qmd';
import { adapters } from './agent/registry';

interface QueryOpts {
  json?: boolean;
  limit?: number;
  synth?: boolean;
  // Commander resolves `--no-rerank` → `opts.rerank: false`. Default true.
  rerank?: boolean;
}

export default async function wikiQuery(q: string, opts: QueryOpts): Promise<void> {
  if (!q || !q.trim()) {
    print.error('empty query.');
    process.exit(1);
  }
  const target = requireVault();

  const limit = Math.max(1, Math.min(50, opts.limit || 10));
  const hits = await qmdQuery(q, target.name, target.root, { limit, rerank: opts.rerank !== false });
  if (hits === null) {
    print.error('qmd query failed. Run `rig wiki index` first to (re)build the vector store.');
    process.exit(1);
  }

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
    const score = typeof h.rerankScore === 'number' ? h.rerankScore : h.score;
    const scoreStr = typeof score === 'number' ? score.toFixed(4) : '—';
    const head = wlink ? `[[${wlink}]]` : filePath;
    // eslint-disable-next-line no-console
    console.log(`${String(i + 1).padStart(2)}. ${head}  (score=${scoreStr})`);
    const snippet = (h.body || '').trim().replace(/\s+/g, ' ').slice(0, 220);
    if (snippet) {
      // eslint-disable-next-line no-console
      console.log(`    ${snippet}${snippet.length === 220 ? '…' : ''}`);
    }
  });
  // eslint-disable-next-line no-console
  console.log('');
}

// "/abs/<vault>/sources/foo.md" → "foo". For paths outside the page-tree
// subdirs returns null so the caller falls back to the literal path.
const PAGE_SUBDIRS = ['sources', 'entities', 'concepts', 'synthesis', 'queries'];
function toWikilink(wiki: WikiEntry, filePath: string): string | null {
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(wiki.path, filePath);
    const rel = path.relative(wiki.path, abs);
    const first = rel.split(path.sep)[0];
    if (!PAGE_SUBDIRS.includes(first)) return null;
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
    const body = (h.body || '').trim().slice(0, 1200);
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
