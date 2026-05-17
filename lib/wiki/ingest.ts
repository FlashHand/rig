import print from '../print';

interface IngestOpts { wiki?: string; dryRun?: boolean; json?: boolean; }

export default function wikiIngest(_source: string, _opts: IngestOpts): void {
  print.warn('rig wiki ingest — not yet implemented (P1 in progress).');
  print.info('Plan: sandbox-copy → Claude adapter (two-step CoT) → host-diff → apply. See doc/architecture/wiki.md §3 + agents.md §2.');
  process.exit(0);
}
