import print from '../print';

interface LintOpts { wiki?: string; all?: boolean; json?: boolean; }

export default function wikiLint(_opts: LintOpts): void {
  print.warn('rig wiki lint — not yet implemented (P1 in progress).');
  print.info('Plan: walk wiki/, check contradictions/orphans/broken-sources[]/reviews-backlog; write lint-report-YYYY-MM-DD.md. See doc/architecture/wiki.md §3.');
  process.exit(0);
}
