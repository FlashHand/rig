import fs from 'fs';
import { crewPaths } from './paths';
import { CrewEntry } from './config';
import { CrewTask, summarize } from './task';

export function writeCrewState(crew: CrewEntry, tasks: CrewTask[]): void {
  fs.mkdirSync(crewPaths.home, { recursive: true });
  const summary = summarize(tasks);
  const data = {
    updatedAt: new Date().toISOString(),
    crew: crew.name,
    vault: crew.vault,
    root: crew.root,
    summary,
    tasks,
  };
  fs.writeFileSync(crewPaths.state, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

