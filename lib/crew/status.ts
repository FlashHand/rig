import print from '../print';
import { requireCrew, shortPath } from './config';
import { scanTasks, openPendingQuestions, summarize } from './task';
import { writeCrewState } from './state';

interface StatusOpts { crew?: string; json?: boolean; }

export default function crewStatus(opts: StatusOpts): void {
  const crew = requireCrew(opts.crew);
  const tasks = scanTasks(crew);
  const pending = openPendingQuestions(crew);
  const s = summarize(tasks);
  writeCrewState(crew, tasks);
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, crew: crew.name, vault: crew.vault, summary: s, pendingQuestions: pending.length }, null, 2));
    return;
  }
  print.info(`crew: ${crew.name}`);
  // eslint-disable-next-line no-console
  console.log(`vault: ${shortPath(crew.vault)}`);
  // eslint-disable-next-line no-console
  console.log(`tasks: ${s.done}/${s.total} done, ${s.open} open, ${s.blocked} blocked, ${s.doing} doing`);
  // eslint-disable-next-line no-console
  console.log(`pending questions: ${pending.length} open`);
}

