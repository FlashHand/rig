import fs from 'fs';
import path from 'path';
import { CrewEntry } from './config';
import { projectAgentFolder, rootPath } from './vault';
import { normalizeRoleName, roleDefinitionsForCrew } from './role';

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
  ];
  const roles = roleDefinitionsForCrew(crew);

  // Backward compatibility: old crew roots may still contain global role
  // task files. New init writes role descriptions only and scopes concrete
  // work under Projects/<project>/Agents/<role>/Tasks.md.
  for (const role of roles) {
    const legacy = rootPath(crew, path.join(role.folder, 'Tasks.md'));
    if (fs.existsSync(legacy)) files.push({ file: legacy, scope: `legacy-role:${role.name}` });
  }

  const projectsDir = rootPath(crew, 'Projects');
  const projectNames = configuredProjectNames(crew, projectsDir);
  for (const name of projectNames) {
    const base = path.join(projectsDir, name);
    const file = path.join(base, 'Tasks.md');
    if (fs.existsSync(file)) files.push({ file, scope: `project:${name}` });
    files.push(...tasklistFiles(path.join(base, 'Tasklists', 'active'), `project:${name}:tasklist`));

    const seenRoleFolders = new Set<string>();
    for (const role of roles) {
      const folder = projectAgentFolder(role);
      seenRoleFolders.add(folder);
      const roleFile = path.join(base, 'Agents', folder, 'Tasks.md');
      if (fs.existsSync(roleFile)) files.push({ file: roleFile, scope: `project:${name}:role:${role.name}` });
      files.push(...tasklistFiles(path.join(base, 'Agents', folder, 'Tasklists', 'active'), `project:${name}:role:${role.name}:tasklist`));
    }

    const agentsDir = path.join(base, 'Agents');
    if (fs.existsSync(agentsDir)) {
      for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || seenRoleFolders.has(entry.name)) continue;
        const roleFile = path.join(agentsDir, entry.name, 'Tasks.md');
        const roleName = normalizeRoleName(entry.name);
        if (fs.existsSync(roleFile)) files.push({ file: roleFile, scope: `project:${name}:role:${roleName}` });
        files.push(...tasklistFiles(path.join(agentsDir, entry.name, 'Tasklists', 'active'), `project:${name}:role:${roleName}:tasklist`));
      }
    }
  }
  return files.filter(item => fs.existsSync(item.file));
}

function configuredProjectNames(crew: CrewEntry, projectsDir: string): string[] {
  if (crew.projects && crew.projects.length > 0) return crew.projects.map(p => p.name);
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map(entry => entry.name);
}

function tasklistFiles(dir: string, scope: string): { file: string; scope: string }[] {
  if (!fs.existsSync(dir)) return [];
  const files: { file: string; scope: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...tasklistFiles(full, scope));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push({ file: full, scope });
    }
  }
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
