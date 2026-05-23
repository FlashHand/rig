// `rig wiki ingest <source>` — two-step CoT digestion of one source file
// into a wiki page tree.
//
// Pipeline:
//   1. Snapshot every wiki/<sub>/*.md + index.md + overview.md + log.md +
//      reviews.md (NOT raw/, NOT purpose/schema) — these are LLM-writable.
//   2. Spawn Claude inside the wiki dir with --allowedTools Read,Write,Edit
//      and a two-step prompt (analysis → generation).
//   3. After Claude exits, diff the writable surface against the snapshot.
//   4. Filter the diff to reject any edit to forbidden paths (raw/, purpose,
//      schema). With --dry-run, print the diff and revert. Otherwise: keep
//      the agent's writes, append a log entry, trigger qmd incremental
//      embed.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import print from '../print';
import { loadWikiConfig, resolveWiki, loadRigConfig, WikiEntry } from './config';
import { paths } from './paths';
import { recordLastRun } from './db';
import { qmdEmbed } from './qmd';
import { adapters } from './agent/registry';

interface IngestOpts { wiki?: string; dryRun?: boolean; json?: boolean; }

const AGENT_TIMEOUT_MS = 15 * 60 * 1000;

// LLM-writable surface — everything outside this set is filtered out of the
// diff (raw/, purpose.md, schema.md, .gitignore, lint-report-*, proposals/).
const WRITABLE_TOP = new Set(['index.md', 'overview.md', 'log.md', 'reviews.md']);
const WRITABLE_DIRS = ['wiki/sources', 'wiki/entities', 'wiki/concepts', 'wiki/synthesis', 'wiki/queries'];

export default async function wikiIngest(source: string, opts: IngestOpts): Promise<void> {
  const cfg = loadWikiConfig();
  const target = resolveWiki(cfg, opts.wiki);
  if (!target) {
    print.error('no wiki resolved. Pass --wiki <name> or run from inside a registered project.');
    process.exit(1);
  }

  const absSource = path.isAbsolute(source) ? source : path.resolve(target.path, source);
  if (!fs.existsSync(absSource)) {
    print.error(`source not found: ${source}`);
    process.exit(1);
  }
  const relSource = path.relative(target.path, absSource);

  // Snapshot writable surface BEFORE the agent runs.
  const before = snapshot(target);

  const rig = loadRigConfig();
  const which = rig.wiki?.defaultAgent || 'claude';
  const adapter = adapters.find(a => a.name === which);
  if (!adapter) { print.error(`no agent adapter "${which}"`); process.exit(20); }
  const detect = await adapter.detect();
  if (!detect.installed) {
    print.error(`${which} not installed on PATH. Install Claude Code (\`yarn dlx @anthropics/claude-code\`) or pick another adapter via \`rig wiki agent use\`.`);
    process.exit(20);
  }

  const prompt = buildPrompt(target, absSource);
  print.start(`${which} ingest ${relSource}`);
  const res = await adapter.run({
    prompt,
    cwd: target.path,
    allowWrite: true,
    tools: ['bash'],
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!res.ok) {
    print.error(`${which} failed (code ${res.exitCode})${res.stderr ? `: ${res.stderr.trim().slice(0, 400)}` : ''}`);
    recordLastRun(target.name, 'ingest', 1);
    process.exit(1);
  }

  // Snapshot AFTER and diff.
  const after = snapshot(target);
  const { applied, rejected } = diffSnapshots(target, before, after);

  // Reject any edits to forbidden paths by reverting them to the snapshot.
  for (const r of rejected) revertOne(target, before, r);

  // Append a log entry. log.md is in WRITABLE_TOP so even if agent didn't
  // touch it, we do — this is the rig's contribution.
  appendLog(target, relSource, applied, !!opts.dryRun);

  if (opts.dryRun) {
    // Restore the writable surface from the snapshot — dry-run leaves no trace.
    for (const f of applied) revertOne(target, before, f);
    if (opts.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: true, code: 0, data: { source: relSource, applied, rejected, dryRun: true } }, null, 2));
    } else {
      print.info(`dry-run diff (${applied.length} file${applied.length === 1 ? '' : 's'} would be written; ${rejected.length} rejected):`);
      for (const f of applied) {
        // eslint-disable-next-line no-console
        console.log(`  + ${f}`);
      }
      for (const f of rejected) {
        // eslint-disable-next-line no-console
        console.log(`  ✗ ${f}  [rejected: outside writable surface]`);
      }
      print.info('re-run without --dry-run to apply.');
    }
    recordLastRun(target.name, 'ingest', 0);
    return;
  }

  // Real ingest — trigger incremental embed.
  print.info(`applied ${applied.length} file change${applied.length === 1 ? '' : 's'}; rejected ${rejected.length}.`);
  const embedRes = await qmdEmbed(target.name, target.path);
  if (!embedRes.ok) {
    print.warn(`qmd embed failed after ingest: ${embedRes.stderr.trim().slice(0, 300)}`);
    print.warn('your wiki content is committed to disk; only the vector index is stale.');
  }

  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, code: 0, data: { source: relSource, applied, rejected } }, null, 2));
  } else {
    print.succeed(`ingested ${relSource} → ${applied.length} file${applied.length === 1 ? '' : 's'}.`);
  }
  recordLastRun(target.name, 'ingest', 0);
}

// ----------------------------------------------------------------------
// snapshot + diff
// ----------------------------------------------------------------------

interface Snapshot {
  // wiki-relative path → content (or null if file was absent)
  files: Map<string, string | null>;
}

function snapshot(wiki: WikiEntry): Snapshot {
  const out: Snapshot = { files: new Map() };
  for (const top of WRITABLE_TOP) {
    const abs = path.join(wiki.path, top);
    out.files.set(top, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
  }
  for (const sub of WRITABLE_DIRS) {
    const dir = path.join(wiki.path, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === '.gitkeep') continue;
      const rel = path.join(sub, name);
      out.files.set(rel, fs.readFileSync(path.join(wiki.path, rel), 'utf8'));
    }
  }
  return out;
}

function diffSnapshots(wiki: WikiEntry, before: Snapshot, after: Snapshot): { applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];
  // Collect every path mentioned by either snapshot OR newly written.
  const seen = new Set<string>([...before.files.keys(), ...after.files.keys()]);
  // Also scan disk for any new files in writable dirs that "after" missed (it
  // shouldn't, but be defensive).
  for (const sub of WRITABLE_DIRS) {
    const dir = path.join(wiki.path, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name === '.gitkeep') continue;
      seen.add(path.join(sub, name));
    }
  }

  for (const rel of seen) {
    if (!isWritable(rel)) {
      // Edit outside writable surface — check if changed vs snapshot.
      const orig = before.files.get(rel);
      const now = readMaybe(path.join(wiki.path, rel));
      if (orig !== now) rejected.push(rel);
      continue;
    }
    const orig = before.files.get(rel) ?? null;
    const now = readMaybe(path.join(wiki.path, rel));
    if (orig !== now) applied.push(rel);
  }
  return { applied, rejected };
}

function isWritable(rel: string): boolean {
  if (WRITABLE_TOP.has(rel)) return true;
  return WRITABLE_DIRS.some(d => rel === d || rel.startsWith(d + path.sep) || rel.startsWith(d + '/'));
}

function readMaybe(abs: string): string | null {
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function revertOne(wiki: WikiEntry, before: Snapshot, rel: string): void {
  const abs = path.join(wiki.path, rel);
  const orig = before.files.get(rel);
  if (orig == null) {
    // file didn't exist before → delete
    if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  } else {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, orig, 'utf8');
  }
}

function appendLog(wiki: WikiEntry, relSource: string, applied: string[], dryRun: boolean): void {
  const logPath = path.join(wiki.path, 'log.md');
  const ts = new Date().toISOString();
  const entry = [
    ``,
    `## ${ts} — ingest ${relSource}${dryRun ? ' (dry-run)' : ''}`,
    ...applied.map(a => `- ${a}`),
    ``,
  ].join('\n');
  fs.appendFileSync(logPath, entry, 'utf8');
}

// ----------------------------------------------------------------------
// prompt
// ----------------------------------------------------------------------

function buildPrompt(wiki: WikiEntry, sourceAbs: string): string {
  const sourceRel = path.relative(wiki.path, sourceAbs);
  const sourceSha = crypto.createHash('sha256').update(fs.readFileSync(sourceAbs)).digest('hex');
  const today = new Date().toISOString();

  return [
    `You are running INGEST for the rig wiki at \`${wiki.path}\`.`,
    ``,
    `Step 1 — ANALYSIS (do NOT write files yet):`,
    `  - Read \`purpose.md\`, \`schema.md\`, \`overview.md\`, \`index.md\`.`,
    `  - Read the source: \`${sourceRel}\`.`,
    `  - In your head, list: entities mentioned, concepts touched, contradictions vs existing pages, items that need human review.`,
    ``,
    `Step 2 — GENERATION (write files):`,
    `  - Create \`wiki/sources/<slug>.md\` summarizing this source. \`<slug>\` = source basename minus YYYY-MM-DD prefix and extension, kebab-case.`,
    `  - For each new or affected entity / concept / synthesis page, create or UPDATE the corresponding file under \`wiki/entities/\`, \`wiki/concepts/\`, \`wiki/synthesis/\`.`,
    `  - Update \`index.md\` and \`overview.md\` to reflect the new content.`,
    `  - If anything is unclear or contradictory, append a bullet to \`reviews.md\`. Do NOT silently merge contradictions.`,
    ``,
    `Frontmatter — every wiki/**/*.md MUST have:`,
    '```yaml',
    `type: source | entity | concept | synthesis | query`,
    `sources: [<source-slug>, ...]      # source-slug is the source page slug, not raw filename`,
    `ingested-at: ${today}`,
    `last-updated: ${today}`,
    '```',
    `Source pages additionally need:`,
    '```yaml',
    `source-sha: ${sourceSha}`,
    `source-path: ${sourceRel}`,
    '```',
    ``,
    `Hard rules — the host will REJECT any patch that violates these:`,
    `  - DO NOT modify \`raw/\`, \`purpose.md\`, or \`schema.md\`.`,
    `  - Use kebab-case slugs; no spaces; no date prefixes inside \`wiki/\` filenames.`,
    `  - Link related pages with [[wikilink]]. Every wiki page should link to ≥1 other page.`,
    `  - For contradictions, write inline: \`> Contradiction: A vs B (see [[page-A]], [[page-B]])\`.`,
    ``,
    `Output: stdout is for status only. All content goes to files via the Write/Edit tools.`,
    `When done, print a single line: \`INGEST DONE: <slug>\`.`,
  ].join('\n');
}
