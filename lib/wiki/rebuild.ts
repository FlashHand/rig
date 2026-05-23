// `rig wiki rebuild` — refresh local-only caches for a wiki.
//
// Use cases:
//   1. New device: source markdown is checked out, but ~/.rig/state.db and
//      ~/.rig/<project>/wiki/<wiki>.sqlite are empty. Rebuild populates both.
//   2. Switched embedding model: old vectors are now meaningless. Rebuild
//      re-embeds against the current QMD_EMBED_MODEL.
//   3. Local cache corruption: nuke and start over.
//
// What it does:
//   - clear `source_sha` rows for the wiki in ~/.rig/state.db
//   - drop the per-wiki qmd sqlite store
//   - full re-embed (Qwen3-Embedding by default)

import print from '../print';
import { requireVault } from './config';
import { getDb, recordLastRun } from './db';
import { qmdEmbed, qmdResetStore } from './qmd';

interface RebuildOpts { skipEmbed?: boolean; }

export default async function wikiRebuild(opts: RebuildOpts): Promise<void> {
  const t = requireVault();
  const db = getDb();

  print.start(`rebuild: ${t.name}`);
  const del = db.prepare('DELETE FROM source_sha WHERE wiki = ?').run(t.name);
  print.info(`  cleared ${del.changes} source_sha rows for ${t.name}`);

  qmdResetStore(t.name, t.root);

  if (!opts.skipEmbed) {
    const res = await qmdEmbed(t.name, t.path, t.root, { force: true });
    if (res.ok) print.info(`  qmd embed: ${t.name} done`);
    else {
      print.error(`  qmd embed: ${t.name} failed: ${res.stderr.trim()}`);
      recordLastRun(t.name, 'rebuild', 1);
      process.exit(1);
    }
  }

  recordLastRun(t.name, 'rebuild', 0);
  print.succeed(`rebuilt: ${t.name}`);
  print.info('next: run `rig wiki scan` to baseline the new sha index.');
}
