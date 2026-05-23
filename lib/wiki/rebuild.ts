// `rig wiki rebuild` — refresh local-only caches for a wiki.
//
// Use cases:
//   1. New device: source markdown is checked out, but `~/.rig/state.db` and
//      `~/.cache/qmd/index.sqlite` are empty. Run rebuild to populate both.
//   2. Switched embedding model: old vectors are now meaningless. Rebuild
//      reembeds everything against the current QMD_EMBED_MODEL.
//   3. Local cache corruption: nuke and start over.
//
// What it does:
//   - clear `source_sha` rows for the wiki in ~/.rig/state.db (so the next
//     `scan` reports everything as NEW and re-baselines)
//   - if qmd is installed, run `qmd embed --collection <wiki>` (full re-embed)
//   - print the new-device checklist if anything looks off

import print from '../print';
import { loadWikiConfig, resolveWiki, WikiEntry } from './config';
import { getDb, recordLastRun } from './db';
import { qmdEmbed, qmdResetStore } from './qmd';

interface RebuildOpts { wiki?: string; all?: boolean; skipEmbed?: boolean; }

export default async function wikiRebuild(opts: RebuildOpts): Promise<void> {
  const cfg = loadWikiConfig();
  const targets: WikiEntry[] = opts.all
    ? cfg.wikis
    : [resolveWiki(cfg, opts.wiki)].filter(Boolean) as WikiEntry[];
  if (targets.length === 0) {
    print.error('no wiki resolved. Pass --wiki <name>, --all, or run from inside a registered project.');
    process.exit(1);
  }

  const db = getDb();
  for (const t of targets) {
    print.start(`rebuild: ${t.name}`);
    const del = db.prepare('DELETE FROM source_sha WHERE wiki = ?').run(t.name);
    print.info(`  cleared ${del.changes} source_sha rows for ${t.name}`);

    if (!opts.skipEmbed) {
      // Force a clean re-embed: drop the per-wiki sqlite store first, then
      // run a fresh full embed. Cheaper than `embed({ force:true })` because
      // the store doesn't have to diff every chunk.
      qmdResetStore(t.name);
      const res = await qmdEmbed(t.name, t.path, { force: true });
      if (res.ok) print.info(`  qmd embed: ${t.name} done`);
      else {
        print.error(`  qmd embed: ${t.name} failed: ${res.stderr.trim()}`);
        recordLastRun(t.name, 'rebuild', 1);
        process.exitCode = 1;
        continue;
      }
    }

    recordLastRun(t.name, 'rebuild', 0);
    print.succeed(`rebuilt: ${t.name}`);
  }

  print.info('next: run `rig wiki scan` to baseline the new sha index.');
}
