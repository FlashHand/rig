import print from '../print';

interface QueryOpts { wiki?: string; json?: boolean; }

export default function wikiQuery(_q: string, _opts: QueryOpts): void {
  print.warn('rig wiki query — not yet implemented (P1 in progress).');
  print.info('Plan: with qmd → `qmd query --json` then Claude synthesizes; without qmd → inject index.md/overview.md + heuristics. See doc/architecture/wiki.md §3.');
  process.exit(0);
}
