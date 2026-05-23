import print from '../print';
import { requireCrew } from './config';
import { scanTasks, summarize } from './task';
import { writeCrewState } from './state';

interface SyncOpts { crew?: string; }

export default function crewSync(opts: SyncOpts): void {
  const crew = requireCrew(opts.crew);
  const tasks = scanTasks(crew);
  writeCrewState(crew, tasks);
  const s = summarize(tasks);
  print.succeed(`crew state synced: ${s.done}/${s.total} tasks done`);
}

