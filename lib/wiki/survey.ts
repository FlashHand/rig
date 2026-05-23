// `rig wiki survey` — schema-driven ingestion candidate triage.
//
// Walks the vault's scan root, skips obvious non-sources (hidden /
// gitignored / binary extensions), then asks the configured agent
// (Claude by default) to classify each remaining candidate against the
// wiki's schema.md "Ingestion policy" section.
//
// Output:
//   - default: human-readable table  path | decision | reason
//   - --json:  { ok, code, data: { wiki, decisions: [{path, decision, reason}] } }
//
// --apply iterates over `decision === 'ingest'` and runs the same code
// path as `rig wiki ingest <path>` for each, in series.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import print from '../print';
import { requireVault, loadRigConfig, WikiEntry } from './config';
import { isBinaryExtension } from './fileTypes';
import { adapters } from './agent/registry';
import { default as wikiIngest } from './ingest';

interface SurveyOpts {
  apply?: boolean;
  json?: boolean;
  limit?: number;       // cap candidates passed to the agent (cost/latency safety)
  noAgent?: boolean;    // skip Claude classification — local rules only
}

type Decision = 'ingest' | 'skip' | 'unclear';

interface SurveyRow {
  path: string;          // root-relative
  decision: Decision;
  reason: string;
  size: number;
}

const DEFAULT_LIMIT = 500;
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

export default async function wikiSurvey(opts: SurveyOpts): Promise<void> {
  const target = requireVault();
  const candidates = collectCandidates(target);

  if (candidates.length === 0) {
    print.info('no candidates under scan root.');
    return;
  }

  const limit = Math.max(1, opts.limit ?? DEFAULT_LIMIT);
  if (candidates.length > limit) {
    print.warn(`${candidates.length} candidates found; capping to first ${limit}. Pass --limit <n> to override.`);
  }
  const truncated = candidates.slice(0, limit);

  // Classify
  let rows: SurveyRow[];
  if (opts.noAgent) {
    rows = truncated.map(c => ({ path: c.rel, decision: 'ingest' as Decision, reason: 'no-agent mode — accepts every non-binary candidate', size: c.size }));
  } else {
    rows = await classifyWithAgent(target, truncated);
  }

  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true, code: 0,
      data: { wiki: target.name, decisions: rows },
    }, null, 2));
  } else {
    printTable(target, rows);
  }

  if (opts.apply) await applyIngest(target, rows);
}

interface Candidate { abs: string; rel: string; size: number; }

function collectCandidates(entry: WikiEntry): Candidate[] {
  const out: Candidate[] = [];
  const root = entry.root;
  const vaultRel = path.relative(root, entry.path) || path.basename(entry.path);
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(cur, e.name);
      const rel = path.relative(root, full);
      // Skip the vault dir itself (we don't ingest our own wiki pages)
      if (rel === vaultRel || rel.startsWith(vaultRel + path.sep)) continue;
      // Skip node_modules unconditionally — never useful as wiki sources
      if (e.name === 'node_modules') continue;
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && !isBinaryExtension(full)) {
        try {
          const stat = fs.statSync(full);
          out.push({ abs: full, rel, size: stat.size });
        } catch { /* unreadable — skip */ }
      }
    }
  }
  // Gitignore filter via batch `git check-ignore --stdin -z` (best-effort,
  // silent fallback outside a git repo)
  const ignored = batchGitignored(root, out.map(c => c.abs));
  return out.filter(c => !ignored.has(c.abs));
}

function batchGitignored(root: string, abs: string[]): Set<string> {
  const ignored = new Set<string>();
  if (abs.length === 0) return ignored;
  const r = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: root,
    input: Buffer.from(abs.join('\0') + '\0'),
  });
  if (r.status === 128 || !r.stdout || r.stdout.length === 0) return ignored;
  const lines = Buffer.isBuffer(r.stdout)
    ? r.stdout.toString('utf8').split('\0')
    : String(r.stdout).split('\0');
  for (const line of lines) if (line) ignored.add(path.resolve(root, line));
  return ignored;
}

async function classifyWithAgent(target: WikiEntry, candidates: Candidate[]): Promise<SurveyRow[]> {
  const rig = loadRigConfig();
  const which = rig.wiki?.defaultAgent || 'claude';
  const adapter = adapters.find(a => a.name === which);
  const detect = adapter ? await adapter.detect() : { installed: false };
  if (!adapter || !detect.installed) {
    print.warn(`${which} not available — falling back to local rules (every non-binary candidate accepted).`);
    return candidates.map(c => ({ path: c.rel, decision: 'ingest', reason: `local-rules (${which} unavailable)`, size: c.size }));
  }

  const policy = readPolicySection(target);
  const prompt = buildPrompt(policy, candidates);

  print.start(`${which} survey (${candidates.length} candidates)`);
  const res = await adapter.run({
    prompt,
    cwd: target.path,
    allowWrite: false,
    tools: [],
    timeoutMs: AGENT_TIMEOUT_MS,
  });

  if (!res.ok) {
    print.warn(`${which} survey failed (code ${res.exitCode}) — falling back to local rules.`);
    return candidates.map(c => ({ path: c.rel, decision: 'unclear', reason: 'agent-failed', size: c.size }));
  }

  const parsed = parseJsonDecisions(res.stdout, candidates);
  if (!parsed) {
    print.warn(`could not parse ${which}'s JSON response — falling back.`);
    return candidates.map(c => ({ path: c.rel, decision: 'unclear', reason: 'parse-failed', size: c.size }));
  }
  return parsed;
}

function readPolicySection(target: WikiEntry): string {
  const schemaPath = path.join(target.path, 'schema.md');
  let body = '';
  try { body = fs.readFileSync(schemaPath, 'utf8'); } catch { /* missing schema — use empty policy */ }
  // Extract the "## Ingestion policy" section to end-of-file or next H2.
  const m = body.match(/##\s+Ingestion policy[\s\S]*?(?=\n##\s|\n$|$)/i);
  if (m) return m[0];
  // Fallback: hand-rolled default if the schema doesn't have the section.
  return [
    '## Ingestion policy (default — schema.md has no explicit section)',
    'Ingest: markdown, plain text, PDF, images of documents/receipts,',
    'structured text (csv/json/yaml). Skip: archives, binaries, AV, design,',
    'model weights, lockfiles, anything under hidden/gitignored paths.',
  ].join('\n');
}

function buildPrompt(policy: string, candidates: Candidate[]): string {
  const list = candidates
    .map((c, i) => `${i + 1}. ${c.rel}  (${humanSize(c.size)})`)
    .join('\n');
  return [
    `You are triaging files for a rig wiki ingestion run.`,
    ``,
    `Below is the wiki's ingestion policy (extracted from schema.md):`,
    ``,
    `\`\`\``,
    policy.trim(),
    `\`\`\``,
    ``,
    `Below is the list of candidate files (already filtered for hidden /`,
    `gitignored / known-binary extensions). For each candidate, decide:`,
    ``,
    `  - "ingest"  — matches the policy, should become a wiki source`,
    `  - "skip"    — should not be ingested per the policy`,
    `  - "unclear" — needs a human look (e.g. ambiguous filename)`,
    ``,
    `Output ONE JSON array. Each element MUST be:`,
    ``,
    `  {"i": <1-based-index>, "decision": "ingest"|"skip"|"unclear", "reason": "<≤80 chars>"}`,
    ``,
    `Output ONLY the JSON array. No prose, no markdown fences.`,
    ``,
    `Candidates:`,
    list,
  ].join('\n');
}

function parseJsonDecisions(stdout: string, candidates: Candidate[]): SurveyRow[] | null {
  if (!stdout) return null;
  // Find the first '[' and last ']' to handle stray prose from the model.
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(stdout.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(parsed)) return null;

  const byIndex = new Map<number, { decision: Decision; reason: string }>();
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const i = typeof o.i === 'number' ? o.i : NaN;
    const d = typeof o.decision === 'string' ? o.decision.toLowerCase() : '';
    if (!isFinite(i) || (d !== 'ingest' && d !== 'skip' && d !== 'unclear')) continue;
    byIndex.set(i, { decision: d as Decision, reason: typeof o.reason === 'string' ? o.reason : '' });
  }

  return candidates.map((c, idx) => {
    const r = byIndex.get(idx + 1);
    return r
      ? { path: c.rel, decision: r.decision, reason: r.reason, size: c.size }
      : { path: c.rel, decision: 'unclear', reason: 'no-decision-from-agent', size: c.size };
  });
}

function printTable(target: WikiEntry, rows: SurveyRow[]): void {
  print.info(`survey: ${target.name}  (${rows.length} candidate${rows.length === 1 ? '' : 's'})`);
  const counts = rows.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {} as Record<string, number>);
  // eslint-disable-next-line no-console
  console.log(`  ingest ${counts.ingest || 0}   skip ${counts.skip || 0}   unclear ${counts.unclear || 0}\n`);

  const widths = {
    decision: 7,
    path: Math.min(60, Math.max(4, ...rows.map(r => r.path.length))),
    size: Math.max(4, ...rows.map(r => humanSize(r.size).length)),
  };
  // eslint-disable-next-line no-console
  console.log(`  ${'DECISION'.padEnd(widths.decision)}  ${'SIZE'.padStart(widths.size)}  PATH`);
  // eslint-disable-next-line no-console
  console.log(`  ${'-'.repeat(widths.decision)}  ${'-'.repeat(widths.size)}  ${'-'.repeat(widths.path)}`);
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.decision.padEnd(widths.decision)}  ${humanSize(r.size).padStart(widths.size)}  ${r.path}`);
    if (r.decision !== 'ingest' && r.reason) {
      // eslint-disable-next-line no-console
      console.log(`  ${''.padEnd(widths.decision)}  ${''.padStart(widths.size)}    ↳ ${r.reason}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log('');
  if (!counts.ingest) {
    print.info(`nothing tagged "ingest". Edit schema.md's "Ingestion policy" if this is wrong.`);
  } else {
    print.info(`re-run with --apply to ingest the ${counts.ingest} "ingest" candidate${counts.ingest === 1 ? '' : 's'}.`);
  }
}

async function applyIngest(target: WikiEntry, rows: SurveyRow[]): Promise<void> {
  const targets = rows.filter(r => r.decision === 'ingest');
  if (targets.length === 0) {
    print.info('nothing to apply (no "ingest" decisions).');
    return;
  }
  print.info(`applying ${targets.length} ingest${targets.length === 1 ? '' : 's'} (in series)…`);
  let okCount = 0, failCount = 0;
  for (const r of targets) {
    const absSource = path.resolve(target.root, r.path);
    print.start(`ingest ${r.path}`);
    try {
      // wikiIngest reads CWD-resolved vault; it'll pick up the same target.
      // It calls process.exit on error, so wrap defensively if needed.
      await wikiIngest(absSource, { dryRun: false });
      okCount++;
    } catch (e) {
      failCount++;
      print.error(`ingest ${r.path} failed: ${(e as Error).message}`);
    }
  }
  print.succeed(`survey --apply done: ${okCount} ok, ${failCount} failed.`);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}
