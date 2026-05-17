import print from '../print';

interface FetchOpts { wiki?: string; json?: boolean; }

export default function wikiFetch(_url: string, _opts: FetchOpts): void {
  print.warn('rig wiki fetch — not yet implemented (P1 in progress).');
  print.info('Plan: WebFetch via Claude adapter → write raw/YYYY-MM-DD-<slug>.md with frontmatter (source-url, fetched-at, fetcher, content-sha). See doc/architecture/wiki.md §3.');
  process.exit(0);
}
