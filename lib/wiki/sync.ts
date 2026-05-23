// `rig wiki sync` — one-shot wiki update.
//
//   1. scan: compute NEW / MODIFIED / DELETED against state.db.source_sha
//      (hidden + .gitignored + binary-extension filters apply at walk time,
//      and the gitignore check is multi-repo-aware so git submodules are
//      respected — see `lib/wiki/gitignore.ts`).
//   2. ingest each NEW + MODIFIED source via the existing `wikiIngest`
//      code path. Sequential so Claude doesn't double-write the same wiki
//      page from concurrent runs, and so token spend is bounded.
//   3. prune the wiki pages whose underlying source files have been
//      deleted: removes `sources/<slug>.md`, strips that slug from derived
//      pages' `sources: [...]` frontmatter, drops the source_sha row.
//
// RAW DRIFT (a `raw/` file's bytes changed in place) is surfaced as an
// error — we do NOT try to "fix" it via re-ingest. raw/ is immutable by
// design; drift means something else (a copy-on-write filesystem,
// accidental edit, etc.) and the user needs to look.

import path from 'path';
import print from '../print';
import { requireVault } from './config';
import { recordLastRun } from './db';
import { scanOne, ScanReport } from './scan';
import { pruneDeletedSources, PruneReport } from './prune';
import { default as wikiIngest } from './ingest';

interface SyncOpts {
  json?: boolean;
  dryRun?: boolean;
  noPrune?: boolean;
}

export default async function wikiSync(opts: SyncOpts): Promise<void> {
  const target = requireVault();

  // Step 1: scan. We don't baseline yet — ingest+prune are the ground truth
  // for what gets recorded, and baselining before would mark unprocessed
  // files as "known" prematurely.
  const scan: ScanReport = scanOne(target, false);

  if (scan.rawDrift.length > 0) {
    print.error(`RAW DRIFT detected — ${scan.rawDrift.length} file(s) in raw/ changed. raw/ is immutable; resolve manually before syncing.`);
    for (const p of scan.rawDrift) {
      // eslint-disable-next-line no-console
      console.log(`  ${p}`);
    }
    recordLastRun(target.name, 'sync', 10);
    process.exit(10);
  }

  const toIngest = [...scan.new, ...scan.modified];
  print.info(`sync: ${target.name}  NEW ${scan.new.length}  MODIFIED ${scan.modified.length}  DELETED ${scan.deleted.length}  UNCHANGED ${scan.unchanged}`);

  // Step 2: ingest NEW + MODIFIED (one Claude call per file).
  let ingestOk = 0, ingestFail = 0;
  for (const rel of toIngest) {
    const abs = path.resolve(target.root, rel);
    print.start(`ingest ${rel}`);
    try {
      await wikiIngest(abs, { dryRun: !!opts.dryRun });
      ingestOk++;
    } catch (e) {
      ingestFail++;
      print.error(`ingest ${rel} failed: ${(e as Error).message}`);
    }
  }

  // Step 3: prune DELETED unless --no-prune / --dry-run.
  let prune: PruneReport = { deletedSourcePages: [], scrubbedDerivedPages: [], shaRowsDropped: [] };
  if (scan.deleted.length > 0 && !opts.noPrune && !opts.dryRun) {
    prune = pruneDeletedSources(target, scan.deleted);
  }

  // Step 4: report.
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: ingestFail === 0,
      code: ingestFail === 0 ? 0 : 1,
      data: {
        wiki: target.name,
        scan,
        ingested: { ok: ingestOk, failed: ingestFail },
        pruned: prune,
        dryRun: !!opts.dryRun,
      },
    }, null, 2));
  } else {
    print.succeed(`sync: ingested ${ingestOk} ok, ${ingestFail} failed.`);
    if (prune.deletedSourcePages.length > 0) {
      print.info(`pruned ${prune.deletedSourcePages.length} source page(s):`);
      for (const p of prune.deletedSourcePages) {
        // eslint-disable-next-line no-console
        console.log(`  − ${p}`);
      }
    }
    if (prune.scrubbedDerivedPages.length > 0) {
      print.info(`scrubbed deleted-source refs from ${prune.scrubbedDerivedPages.length} derived page(s):`);
      for (const p of prune.scrubbedDerivedPages) {
        // eslint-disable-next-line no-console
        console.log(`  ~ ${p}`);
      }
    }
    if (opts.dryRun && scan.deleted.length > 0) {
      print.info(`dry-run: ${scan.deleted.length} delete(s) NOT applied. Re-run without --dry-run to prune.`);
    }
  }

  recordLastRun(target.name, 'sync', ingestFail === 0 ? 0 : 1);
  if (ingestFail > 0) process.exit(1);
}
