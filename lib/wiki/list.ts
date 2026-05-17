import fs from 'fs';
import path from 'path';
import print from '../print';
import { loadWikiConfig, loadRigConfig } from './config';
import { getLastRun } from './db';
import { detectQmd } from './qmd';
import { adapters } from './agent/registry';

export default async function wikiList(): Promise<void> {
  const cfg = loadWikiConfig();
  const rig = loadRigConfig();
  if (cfg.wikis.length === 0) {
    print.info('no wikis registered. Use `rig wiki register [<path>]` to add one.');
  } else {
    const rows = cfg.wikis.map(w => ({
      name: w.name,
      path: shortPath(w.path),
      pages: countPages(w.path),
      lastScan: fmtTs(getLastRun(w.name, 'scan')?.ts),
      lastIngest: fmtTs(getLastRun(w.name, 'ingest')?.ts),
      lastLint: fmtTs(getLastRun(w.name, 'lint')?.ts),
    }));
    const header = ['NAME', 'PATH', 'PAGES', 'LAST SCAN', 'LAST INGEST', 'LAST LINT'];
    printTable(header, rows.map(r => [r.name, r.path, String(r.pages), r.lastScan, r.lastIngest, r.lastLint]));
  }

  const qmd = detectQmd();
  const defaultAgent = rig.wiki?.defaultAgent || 'claude';
  const agentDetect = await adapters.find(a => a.name === defaultAgent)?.detect();
  // eslint-disable-next-line no-console
  console.log(`\nagent: ${defaultAgent}${agentDetect?.installed ? ` (${agentDetect.version || 'installed'})` : ' (NOT installed)'}` +
              `   qmd: ${qmd.installed ? qmd.version || 'installed' : 'not installed (fallback mode)'}`);
}

function countPages(wikiDir: string): number {
  const wiki = path.join(wikiDir, 'wiki');
  if (!fs.existsSync(wiki)) return 0;
  let n = 0;
  for (const sub of ['sources', 'entities', 'concepts', 'synthesis', 'queries']) {
    const d = path.join(wiki, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.md') && f !== '.gitkeep') n++;
  }
  return n;
}

function shortPath(p: string): string {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}

function fmtTs(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function printTable(header: string[], rows: string[][]): void {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] || '').length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (c || '').padEnd(widths[i])).join('  ');
  // eslint-disable-next-line no-console
  console.log(fmt(header));
  // eslint-disable-next-line no-console
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(fmt(r));
  }
}
