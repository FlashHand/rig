import print from '../print';
import { loadWikiConfig, resolveWiki, WikiEntry } from './config';
import { detectQmd, qmdEmbed } from './qmd';

interface IndexOpts { wiki?: string; all?: boolean; }

export default function wikiIndex(opts: IndexOpts): void {
  const qmd = detectQmd();
  if (!qmd.installed) {
    print.warn('qmd not installed — `rig wiki index` is a no-op.');
    print.info('install qmd: `npm i -g @tobilu/qmd`');
    process.exit(0);
  }

  const cfg = loadWikiConfig();
  const targets: WikiEntry[] = opts.all
    ? cfg.wikis
    : [resolveWiki(cfg, opts.wiki)].filter(Boolean) as WikiEntry[];
  if (targets.length === 0) {
    print.error('no wiki resolved. Pass --wiki <name>, --all, or run from inside a registered project.');
    process.exit(1);
  }

  for (const t of targets) {
    print.start(`qmd embed: ${t.name}`);
    const res = qmdEmbed(t.name, t.path);
    if (res.ok) print.succeed(`qmd embed: ${t.name} done`);
    else { print.error(`qmd embed: ${t.name} failed: ${res.stderr.trim()}`); process.exitCode = 1; }
  }
}
