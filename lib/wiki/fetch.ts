// `rig wiki fetch <url>` — verbatim download a URL into raw/.
//
// Two paths:
//   - default: Node native fetch → if HTML, strip tags + collapse whitespace
//     to a markdown-ish body; if md/txt, pass through. Writes a single
//     raw/YYYY-MM-DD-<slug>.md with frontmatter (source-url, fetched-at,
//     fetcher, content-type, content-sha).
//   - --via-agent: invoke Claude with the WebFetch tool to do better
//     HTML→markdown conversion; same frontmatter shape.
//
// Never summarizes; that's `ingest`'s job. Filename includes YYYY-MM-DD-
// prefix so raw/ files are append-only-friendly.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import print from '../print';
import { loadWikiConfig, resolveWiki, WikiEntry } from './config';
import { adapters } from './agent/registry';

interface FetchOpts { wiki?: string; json?: boolean; viaAgent?: boolean; slug?: string; }

const FETCH_TIMEOUT_MS = 60 * 1000;
const MAX_BYTES = 20 * 1024 * 1024; // 20MB cap to avoid pulling videos accidentally

export default async function wikiFetch(url: string, opts: FetchOpts): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    print.error(`unsupported URL scheme: ${url}`);
    process.exit(1);
  }
  const cfg = loadWikiConfig();
  const target = resolveWiki(cfg, opts.wiki);
  if (!target) {
    print.error('no wiki resolved. Pass --wiki <name> or run from inside a registered project.');
    process.exit(1);
  }

  const slug = opts.slug || urlToSlug(url);
  const today = new Date().toISOString().slice(0, 10);
  const rawDir = path.join(target.path, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const destPath = path.join(rawDir, `${today}-${slug}.md`);
  if (fs.existsSync(destPath)) {
    print.error(`already exists: ${path.relative(target.path, destPath)} (delete it first or pass --slug)`);
    process.exit(1);
  }

  if (opts.viaAgent) {
    await fetchViaAgent(target, url, destPath);
  } else {
    await fetchDirect(url, destPath);
  }

  const rel = path.relative(target.path, destPath);
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, code: 0, data: { path: rel, url } }, null, 2));
  } else {
    print.succeed(`fetched ${url}`);
    print.info(`  -> ${rel}`);
  }
}

async function fetchDirect(url: string, destPath: string): Promise<void> {
  print.start(`fetch ${url}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'rig-wiki-fetch/4.0.1 (+https://github.com/FlashHand/rig)' },
      redirect: 'follow',
    });
  } catch (e) {
    clearTimeout(timer);
    print.error(`fetch failed: ${(e as Error).message}`);
    process.exit(1);
  }
  clearTimeout(timer);
  if (!res.ok) {
    print.error(`HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    print.error(`response exceeds ${MAX_BYTES} bytes (${ab.byteLength}); refuse to write.`);
    process.exit(1);
  }
  const buf = Buffer.from(ab);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const raw = buf.toString('utf8');

  const body =
    contentType.includes('text/html') || /^\s*<!doctype html|<html/i.test(raw)
      ? htmlToText(raw)
      : raw;

  const fm = buildFrontmatter({
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    fetcher: 'rig-wiki-fetch',
    contentType: contentType || 'unknown',
    contentSha: sha,
  });
  fs.writeFileSync(destPath, fm + '\n' + body.trimEnd() + '\n', 'utf8');
}

async function fetchViaAgent(wiki: WikiEntry, url: string, destPath: string): Promise<void> {
  const adapter = adapters.find(a => a.name === 'claude');
  if (!adapter) { print.error('no claude adapter available.'); process.exit(1); }
  const detect = await adapter.detect();
  if (!detect.installed) {
    print.error('claude not installed on PATH; pass without --via-agent or install Claude Code.');
    process.exit(1);
  }
  const rel = path.relative(wiki.path, destPath);
  const fetchedAt = new Date().toISOString();
  const prompt = [
    `WebFetch the URL: ${url}`,
    `Convert HTML to clean markdown (no script/style/nav noise). DO NOT summarize.`,
    `Write the result verbatim to ${rel} with this frontmatter at the top:`,
    ``,
    '---',
    `source-url: ${url}`,
    `fetched-at: ${fetchedAt}`,
    `fetcher: claude-webfetch`,
    `content-type: text/html`,
    '---',
    ``,
    `Then a blank line, then the converted markdown body. Nothing else.`,
  ].join('\n');
  print.start(`claude WebFetch ${url}`);
  const res = await adapter.run({
    prompt,
    cwd: wiki.path,
    allowWrite: true,
    tools: ['webfetch'],
    timeoutMs: 5 * 60 * 1000,
  });
  if (!res.ok) {
    print.error(`claude failed (code ${res.exitCode})${res.stderr ? `: ${res.stderr.trim().slice(0, 300)}` : ''}`);
    process.exit(1);
  }
  if (!fs.existsSync(destPath)) {
    print.error(`claude reported success but file not written: ${rel}`);
    process.exit(1);
  }
  // Stamp content-sha after the agent wrote the file.
  const buf = fs.readFileSync(destPath);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const content = buf.toString('utf8');
  const stamped = content.startsWith('---\n')
    ? content.replace('---\n', `---\ncontent-sha: ${sha}\n`)
    : `---\ncontent-sha: ${sha}\n---\n\n` + content;
  fs.writeFileSync(destPath, stamped, 'utf8');
}

function buildFrontmatter(fm: {
  sourceUrl: string;
  fetchedAt: string;
  fetcher: string;
  contentType: string;
  contentSha: string;
}): string {
  return [
    '---',
    `source-url: ${fm.sourceUrl}`,
    `fetched-at: ${fm.fetchedAt}`,
    `fetcher: ${fm.fetcher}`,
    `content-type: ${fm.contentType}`,
    `content-sha: ${fm.contentSha}`,
    '---',
  ].join('\n');
}

// Best-effort HTML → text. Drops script/style/nav/svg blocks, decodes the
// handful of common entities, collapses whitespace. Not a replacement for
// readability — that's what --via-agent is for.
function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|nav|svg|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|td|th)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function urlToSlug(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    const last = path.split('/').filter(Boolean).pop() || u.hostname;
    return last
      .toLowerCase()
      .replace(/\.(html?|md|txt|aspx?|php|jsp)$/, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'page';
  } catch { return 'page'; }
}
