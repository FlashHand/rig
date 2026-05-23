import print from '../print';
import { requireCrew } from './config';
import { openInboxTasks } from './task';

interface InboxOpts { crew?: string; json?: boolean; }

export default function crewInbox(opts: InboxOpts): void {
  const crew = requireCrew(opts.crew);
  const items = openInboxTasks(crew);
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, data: items }, null, 2));
    return;
  }
  if (items.length === 0) {
    print.info('inbox is empty.');
    return;
  }
  print.info(`open inbox items: ${items.length}`);
  for (const t of items) {
    // eslint-disable-next-line no-console
    console.log(`- ${t.id || 'NO-ID'} ${clean(t.text)} (${t.fields.priority || 'no priority'})`);
  }
}

function clean(text: string): string {
  return text.replace(/\[[A-Za-z0-9_-]+::\s*[^\]]+\]/g, '').trim();
}

