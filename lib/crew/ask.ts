import fs from 'fs';
import print from '../print';
import { requireCrew } from './config';
import { appendLog, rootPath } from './vault';
import crewBoard from './board';

interface AskOpts { crew?: string; }

export default function crewAsk(messageParts: string[] | string | undefined, opts: AskOpts): void {
  const crew = requireCrew(opts.crew);
  const message = Array.isArray(messageParts) ? messageParts.join(' ') : (messageParts || '');
  if (!message.trim()) {
    print.info('no message supplied; running a lightweight Orchestrator tick.');
    print.info('MVP Orchestrator tick only refreshes status. LLM delegation will be added in a later phase.');
    crewBoard({ crew: crew.name });
    return;
  }
  const file = rootPath(crew, 'Current-Goal.md');
  fs.appendFileSync(file, `\n- ${new Date().toISOString()} ${message.trim()}\n`, 'utf8');
  appendLog(crew, `Orchestrator input: ${message.trim()}`);
  print.succeed(`added goal input to ${file}`);
  crewBoard({ crew: crew.name });
}

