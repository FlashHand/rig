// `rig wiki lint` — health-check a wiki.
//
// Checks:
//   - every wiki/**/*.md has YAML frontmatter with required keys
//   - source pages reference a real raw/ file and the recorded source-sha
//     still matches (drift → MODIFIED, not an error in lint, just info)
//   - [[wikilink]] targets exist (broken refs → severe)
//   - orphan pages (linked-by 0, excluding sources/) → warn
//   - reviews.md backlog count → warn
//
// Output: human-readable summary on stdout, full report at
// <wiki>/lint-report-YYYY-MM-DD.md.
// Exit 11 if any severe finding. Other findings are non-fatal.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import print from '../print';
import { requireVault, WikiEntry } from './config';
import { recordLastRun } from './db';

interface LintOpts { json?: boolean; }

interface PageMeta {
  rel: string;          // vault-relative path, e.g. "sources/foo.md"
  slug: string;         // filename without ext
  sub: string;          // "sources" | "entities" | "concepts" | "synthesis" | "queries"
  frontmatter: Record<string, unknown> | null;
  links: string[];      // [[wikilink]] targets
}

interface Findings {
  missingFrontmatter: string[];
  missingRequiredKey: { rel: string; key: string }[];
  brokenWikilinks: { rel: string; target: string }[];
  missingRawSource: { rel: string; sourcePath: string }[];
  shaDriftSource: { rel: string; oldSha: string; newSha: string }[];
  orphanPages: string[];
  reviewsBacklog: number;
}

const REQUIRED_KEYS = ['type', 'sources', 'ingested-at', 'last-updated'] as const;
const SOURCE_EXTRA_KEYS = ['source-sha', 'source-path'] as const;
const WIKI_SUBDIRS = ['sources', 'entities', 'concepts', 'synthesis', 'queries'] as const;
const TOP_LEVEL_WIKILINK_TARGETS = ['index', 'overview', 'log', 'reviews', 'purpose', 'schema'] as const;

export default async function wikiLint(opts: LintOpts): Promise<void> {
  const target = requireVault();
  const findings = lintOne(target);
  const sev =
    findings.missingFrontmatter.length +
    findings.missingRequiredKey.length +
    findings.brokenWikilinks.length +
    findings.missingRawSource.length;
  const severeFound = sev > 0;
  if (!opts.json) printSummary(target.name, findings);
  writeReport(target, findings);
  recordLastRun(target.name, 'lint', severeFound ? 11 : 0);

  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: !severeFound, code: severeFound ? 11 : 0,
      data: [{ wiki: target.name, findings }],
    }, null, 2));
  }
  if (severeFound) process.exit(11);
}

function lintOne(wiki: WikiEntry): Findings {
  const f: Findings = {
    missingFrontmatter: [],
    missingRequiredKey: [],
    brokenWikilinks: [],
    missingRawSource: [],
    shaDriftSource: [],
    orphanPages: [],
    reviewsBacklog: 0,
  };

  const pages: PageMeta[] = [];
  for (const sub of WIKI_SUBDIRS) {
    const dir = path.join(wiki.path, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md') || name === '.gitkeep') continue;
      const abs = path.join(dir, name);
      pages.push(parsePage(wiki.path, abs, sub));
    }
  }

  const slugToRel = new Map<string, string>();
  for (const slug of TOP_LEVEL_WIKILINK_TARGETS) {
    const rel = `${slug}.md`;
    if (fs.existsSync(path.join(wiki.path, rel))) slugToRel.set(slug, rel);
  }
  for (const p of pages) slugToRel.set(p.slug, p.rel);

  const linkedSlugs = new Set<string>();
  for (const p of pages) {
    if (!p.frontmatter) { f.missingFrontmatter.push(p.rel); continue; }
    for (const k of REQUIRED_KEYS) {
      if (!(k in p.frontmatter)) f.missingRequiredKey.push({ rel: p.rel, key: k });
    }
    if (p.sub === 'sources') {
      for (const k of SOURCE_EXTRA_KEYS) {
        if (!(k in p.frontmatter)) f.missingRequiredKey.push({ rel: p.rel, key: k });
      }
      const sourcePath = String(p.frontmatter['source-path'] || '');
      if (sourcePath) {
        const abs = resolveSourcePath(wiki, sourcePath);
        if (!fs.existsSync(abs)) {
          f.missingRawSource.push({ rel: p.rel, sourcePath });
        } else {
          const newSha = sha256(abs);
          const oldSha = String(p.frontmatter['source-sha'] || '');
          if (oldSha && oldSha !== newSha) f.shaDriftSource.push({ rel: p.rel, oldSha, newSha });
        }
      }
    }
    for (const target of p.links) {
      if (!slugToRel.has(target)) {
        f.brokenWikilinks.push({ rel: p.rel, target });
      } else {
        linkedSlugs.add(target);
      }
    }
  }

  // Orphans: non-source pages that nothing else links to. Sources may
  // legitimately have no inbound links until ingested into a synthesis.
  for (const p of pages) {
    if (p.sub === 'sources') continue;
    if (!linkedSlugs.has(p.slug)) f.orphanPages.push(p.rel);
  }

  // Reviews backlog: count non-empty bullet lines in reviews.md.
  const reviewsPath = path.join(wiki.path, 'reviews.md');
  if (fs.existsSync(reviewsPath)) {
    const lines = fs.readFileSync(reviewsPath, 'utf8').split('\n');
    f.reviewsBacklog = lines.filter(l => /^\s*[-*]\s+\S/.test(l)).length;
  }

  return f;
}

function parsePage(wikiRoot: string, abs: string, sub: string): PageMeta {
  const rel = path.relative(wikiRoot, abs);
  const slug = path.basename(abs, path.extname(abs));
  const content = fs.readFileSync(abs, 'utf8');
  const { frontmatter, body } = splitFrontmatter(content);
  const links = extractWikilinks(body);
  return { rel, slug, sub, frontmatter, links };
}

function splitFrontmatter(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
  if (!content.startsWith('---\n')) return { frontmatter: null, body: content };
  const end = content.indexOf('\n---\n', 4);
  if (end < 0) return { frontmatter: null, body: content };
  const yaml = content.slice(4, end);
  const body = content.slice(end + 5);
  return { frontmatter: parseTinyYaml(yaml), body };
}

// Minimal YAML parser — handles the rig wiki frontmatter shape only
// (key: scalar / key: [a, b, c]). Anything else returns null for that key.
function parseTinyYaml(src: string): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const line of src.split('\n')) {
    const trimmed = line.replace(/#.*$/, '').trimEnd();
    if (!trimmed) continue;
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw.trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else {
      out[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|\n]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const slug = m[1].trim().split('#')[0].split('/').pop() || '';
    if (slug) out.push(slug);
  }
  return out;
}

function resolveSourcePath(wiki: WikiEntry, sourcePath: string): string {
  const obsidian = parseObsidianFilePath(sourcePath);
  if (obsidian) return path.resolve(path.dirname(wiki.path), obsidian);
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(wiki.path, sourcePath);
}

function parseObsidianFilePath(sourcePath: string): string | null {
  if (!sourcePath.startsWith('obsidian://open?')) return null;
  try {
    const url = new URL(sourcePath);
    const file = url.searchParams.get('file');
    return file && file.trim() ? file : null;
  } catch {
    return null;
  }
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function printSummary(wikiName: string, f: Findings): void {
  print.info(`lint: ${wikiName}`);
  const lines: string[] = [];
  if (f.missingFrontmatter.length) lines.push(`  MISSING FRONTMATTER (${f.missingFrontmatter.length})`);
  if (f.missingRequiredKey.length) lines.push(`  MISSING REQUIRED KEY (${f.missingRequiredKey.length})`);
  if (f.brokenWikilinks.length) lines.push(`  BROKEN WIKILINKS (${f.brokenWikilinks.length})`);
  if (f.missingRawSource.length) lines.push(`  MISSING RAW SOURCE (${f.missingRawSource.length})`);
  if (f.shaDriftSource.length) lines.push(`  SOURCE SHA DRIFT (${f.shaDriftSource.length})  [info — propose re-ingest]`);
  if (f.orphanPages.length) lines.push(`  ORPHAN PAGES (${f.orphanPages.length})  [warn]`);
  if (f.reviewsBacklog) lines.push(`  REVIEWS BACKLOG (${f.reviewsBacklog} item${f.reviewsBacklog === 1 ? '' : 's'})  [warn]`);
  if (lines.length === 0) {
    print.succeed('  clean');
  } else {
    for (const l of lines) {
      // eslint-disable-next-line no-console
      console.log(l);
    }
  }
}

function writeReport(wiki: WikiEntry, f: Findings): void {
  const today = new Date().toISOString().slice(0, 10);
  const out = path.join(wiki.path, `lint-report-${today}.md`);
  const parts: string[] = [];
  parts.push(`# lint report — ${wiki.name} — ${today}`);
  parts.push('');
  parts.push(`Generated by \`rig wiki lint\`. Severe sections trigger exit code 11.`);
  parts.push('');

  section(parts, 'Missing frontmatter (severe)', f.missingFrontmatter.map(r => `- ${r}`));
  section(parts, 'Missing required key (severe)', f.missingRequiredKey.map(x => `- ${x.rel} — \`${x.key}\``));
  section(parts, 'Broken wikilinks (severe)', f.brokenWikilinks.map(x => `- ${x.rel} → [[${x.target}]]`));
  section(parts, 'Missing raw source (severe)', f.missingRawSource.map(x => `- ${x.rel} → ${x.sourcePath}`));
  section(parts, 'Source sha drift (re-ingest recommended)', f.shaDriftSource.map(x => `- ${x.rel}\n  - old: \`${x.oldSha.slice(0, 12)}…\`\n  - new: \`${x.newSha.slice(0, 12)}…\``));
  section(parts, 'Orphan pages', f.orphanPages.map(r => `- ${r}`));
  parts.push(`## Reviews backlog\n\n${f.reviewsBacklog} item(s).`);
  parts.push('');

  fs.writeFileSync(out, parts.join('\n'), 'utf8');
}

function section(out: string[], title: string, items: string[]): void {
  out.push(`## ${title}`);
  out.push('');
  if (items.length === 0) out.push('_(none)_');
  else for (const item of items) out.push(item);
  out.push('');
}
