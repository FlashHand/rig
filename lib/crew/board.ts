import path from 'path';
import print from '../print';
import { requireCrew, shortPath } from './config';
import { scanTasks, openInboxTasks, summarize, taskProgress, CrewTask } from './task';
import { rootPath, writeText, readText } from './vault';
import { writeCrewState } from './state';
import { roleDefinitionsForCrew } from './role';

interface BoardOpts { crew?: string; }

export default function crewBoard(opts: BoardOpts): void {
  const crew = requireCrew(opts.crew);
  const tasks = scanTasks(crew);
  const inbox = openInboxTasks(crew);
  const summary = summarize(tasks);
  const dashboard = renderDashboard(crew, tasks, inbox);
  const file = rootPath(crew, 'Team-Dashboard.md');
  writeText(file, dashboard);
  writeCrewState(crew, tasks);
  print.succeed(`crew dashboard refreshed: ${shortPath(file)}`);
  print.info(`tasks: ${summary.done}/${summary.total} done, inbox: ${inbox.length} open`);
}

function renderDashboard(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[], inbox: CrewTask[]): string {
  const summary = summarize(tasks);
  const health = summary.blocked > 0 ? 'At Risk' : 'On Track';
  const goal = currentGoal(rootPath(crew, 'Current-Goal.md'));
  return [
    '# Team Dashboard',
    '',
    `Last updated: ${new Date().toISOString()}`,
    '',
    '## Lead Brief',
    '',
    `Current Goal: ${goal || '_No current goal yet_'}`,
    `Overall: ${taskProgress(tasks)}% (${summary.done}/${summary.total})`,
    `Health: ${health}`,
    `Next Agent Action: ${inbox.length > 0 ? 'Read `rig crew inbox` and surface only needed decisions to the human.' : 'Run `rig crew` to continue the next Lead tick.'}`,
    '',
    '## Needs Your Attention',
    '',
    inboxTable(inbox),
    '',
    '## Project Progress',
    '',
    projectTable(crew, tasks),
    '',
    '## Role Progress',
    '',
    roleTable(crew, tasks),
    '',
    '## Blockers',
    '',
    blockersTable(tasks),
    '',
    '## Active Tasks',
    '',
    activeTable(tasks),
    '',
  ].join('\n');
}

function currentGoal(file: string): string {
  const lines = readText(file)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && l.charAt(0) !== '#');
  return lines.length ? lines[lines.length - 1].replace(/^\-\s*/, '') : '';
}

function inboxTable(tasks: CrewTask[]): string {
  if (tasks.length === 0) return '_No open inbox items._';
  const rows = tasks.map(t => `| ${t.id || '-'} | ${t.fields.type || '-'} | ${cleanTaskText(t.text)} | ${t.fields.priority || '-'} |`);
  return ['| ID | Type | Item | Priority |', '|---|---|---|---|'].concat(rows).join('\n');
}

function projectTable(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[]): string {
  const projects = crew.projects || [];
  if (projects.length === 0) return '_No projects registered yet._';
  const rows = projects.map(p => {
    const scoped = tasks.filter(t => t.scope !== 'inbox' && (t.scope === `project:${p.name}` || t.fields.project === p.name));
    const s = summarize(scoped);
    const health = s.blocked > 0 ? 'At Risk' : 'On Track';
    return `| ${p.name} | ${p.owner} | ${p.defaultExecutor || crew.defaultExecutor || 'claude'} | ${health} | ${s.open} | ${s.blocked} | ${shortPath(p.path)} |`;
  });
  return ['| Project | Owner | Executor | Health | Open | Blocked | Path |', '|---|---|---|---|---:|---:|---|'].concat(rows).join('\n');
}

function roleTable(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[]): string {
  const roles = roleDefinitionsForCrew(crew);
  const rows = roles.map(role => {
    const scoped = tasks.filter(t => t.scope === `role:${role.name}` || t.fields.role === role.name || t.fields.owner === role.name);
    const s = summarize(scoped);
    return `| ${role.title} | ${taskProgress(scoped)}% | ${s.doing} | ${s.blocked} | ${s.open} |`;
  });
  return ['| Role | Progress | WIP | Blocked | Open |', '|---|---:|---:|---:|---:|'].concat(rows).join('\n');
}

function blockersTable(tasks: CrewTask[]): string {
  const blocked = tasks.filter(t => (t.fields.status || '').toLowerCase() === 'blocked');
  if (blocked.length === 0) return '_No blockers._';
  const rows = blocked.slice(0, 20).map(t => `| ${t.id || '-'} | ${t.fields.owner || t.scope} | ${cleanTaskText(t.text)} | ${relFile(t)} |`);
  return ['| ID | Owner | Blocker | File |', '|---|---|---|---|'].concat(rows).join('\n');
}

function activeTable(tasks: CrewTask[]): string {
  const active = tasks.filter(t => !t.done && t.scope !== 'inbox').slice(0, 20);
  if (active.length === 0) return '_No active tasks._';
  const rows = active.map(t => `| ${t.id || '-'} | ${t.fields.project || '-'} | ${t.fields.owner || displayScope(t.scope)} | ${t.fields.status || 'pending'} | ${cleanTaskText(t.text)} |`);
  return ['| ID | Project | Owner | Status | Task |', '|---|---|---|---|---|'].concat(rows).join('\n');
}

function displayScope(scope: string): string {
  return scope.startsWith('role:') ? scope.slice('role:'.length) : scope;
}

function cleanTaskText(text: string): string {
  return text.replace(/\[[A-Za-z0-9_-]+::\s*[^\]]+\]/g, '').trim().replace(/\|/g, '\\|');
}

function relFile(t: CrewTask): string {
  return path.basename(t.file) + ':' + t.line;
}
