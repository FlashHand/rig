import print from '../print';
import { loadWikiConfig, resolveWiki, WikiEntry } from './config';
import { qmdEmbed } from './qmd';

interface IndexOpts { wiki?: string; all?: boolean; force?: boolean; }

export default async function wikiIndex(opts: IndexOpts): Promise<void> {
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
    const res = await qmdEmbed(t.name, t.path, { force: !!opts.force });
    if (res.ok) print.succeed(`qmd embed: ${t.name} done`);
    else { print.error(`qmd embed: ${t.name} failed: ${res.stderr.trim()}`); process.exitCode = 1; }
  }
}
