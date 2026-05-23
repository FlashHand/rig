import fs from 'fs';
import path from 'path';
import { CrewEntry } from './config';
import { rootPath } from './vault';
import { roleDefinitionsForCrew } from './role';

export interface CrewTask {
  id?: string;
  text: string;
  done: boolean;
  file: string;
  line: number;
  scope: string;
  fields: { [key: string]: string };
}

export interface CrewSummary {
  total: number;
  done: number;
  open: number;
  blocked: number;
  doing: number;
}

export function scanTasks(crew: CrewEntry): CrewTask[] {
  const files = taskFiles(crew);
  const tasks: CrewTask[] = [];
  for (const item of files) tasks.push(...parseTasks(item.file, item.scope));
  return tasks;
}

export function parseTasks(file: string, scope: string): CrewTask[] {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const tasks: CrewTask[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseTaskLine(lines[i]);
    if (parsed) tasks.push({ ...parsed, file, line: i + 1, scope });
  }
  return tasks;
}

export function summarize(tasks: CrewTask[]): CrewSummary {
  let done = 0, blocked = 0, doing = 0;
  for (const t of tasks) {
    if (t.done) done++;
    const status = (t.fields.status || '').toLowerCase();
    if (status === 'blocked') blocked++;
    if (status === 'doing' || status === 'in-progress') doing++;
  }
  return { total: tasks.length, done, open: tasks.length - done, blocked, doing };
}

export function openInboxTasks(crew: CrewEntry): CrewTask[] {
  return parseTasks(rootPath(crew, 'Inbox.md'), 'inbox').filter(t => !t.done);
}

export function taskProgress(tasks: CrewTask[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((summarize(tasks).done / tasks.length) * 100);
}

function parseTaskLine(line: string): Omit<CrewTask, 'file' | 'line' | 'scope'> | undefined {
  const match = line.match(/^\s*-\s+\[([ xX-])\]\s+(.+)$/);
  if (!match) return undefined;
  const done = match[1].toLowerCase() === 'x';
  const raw = match[2].trim();
  const fields: { [key: string]: string } = {};
  const fieldRe = /\[([A-Za-z0-9_-]+)::\s*([^\]]+)\]/g;
  let f: RegExpExecArray | null;
  while ((f = fieldRe.exec(raw))) fields[f[1]] = f[2].trim();
  const idMatch = raw.match(/\b(?:AT|D|Q|A|R)-\d{6}-\d{3}\b/);
  return { id: idMatch ? idMatch[0] : undefined, text: raw, done, fields };
}

function taskFiles(crew: CrewEntry): { file: string; scope: string }[] {
  const files = [
    { file: rootPath(crew, 'Inbox.md'), scope: 'inbox' },
    ...roleDefinitionsForCrew(crew).map(role => ({
      file: rootPath(crew, path.join(role.folder, 'Tasks.md')),
      scope: `role:${role.name}`,
    })),
  ];
  const projectsDir = rootPath(crew, 'Projects');
  if (fs.existsSync(projectsDir)) {
    for (const name of fs.readdirSync(projectsDir)) {
      const file = path.join(projectsDir, name, 'Tasks.md');
      if (fs.existsSync(file)) files.push({ file, scope: `project:${name}` });
    }
  }
  return files.filter(item => fs.existsSync(item.file));
}
