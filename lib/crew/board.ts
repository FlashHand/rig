import path from 'path';
import print from '../print';
import { requireCrew, shortPath } from './config';
import { scanTasks, openPendingQuestions, summarize, taskProgress, CrewTask } from './task';
import { rootPath, writeText, readText } from './vault';
import { writeCrewState } from './state';
import { roleDefinitionsForCrew } from './role';

interface BoardOpts { crew?: string; }

export default function crewBoard(opts: BoardOpts): void {
  const crew = requireCrew(opts.crew);
  const tasks = scanTasks(crew);
  const pending = openPendingQuestions(crew);
  const summary = summarize(tasks);
  const dashboard = renderDashboard(crew, tasks, pending);
  const file = rootPath(crew, 'Dashboard.md');
  writeText(file, dashboard);
  writeCrewState(crew, tasks);
  print.succeed(`crew dashboard refreshed: ${shortPath(file)}`);
  print.info(`tasks: ${summary.done}/${summary.total} done, pending questions: ${pending.length} open`);
}

function renderDashboard(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[], pending: CrewTask[]): string {
  const summary = summarize(tasks);
  const health = summary.blocked > 0 ? 'At Risk' : 'On Track';
  const goal = currentGoal(rootPath(crew, 'Current-Goal.md'));
  return [
    '# Dashboard',
    '',
    `Last updated: ${new Date().toISOString()}`,
    '',
    '## Orchestrator Brief',
    '',
    `Current Goal: ${goal || '_No current goal yet_'}`,
    `Overall: ${taskProgress(tasks)}% (${summary.done}/${summary.total})`,
    `Health: ${health}`,
    `Next Agent Action: ${pending.length > 0 ? 'Read `rig orchestrate pending-questions` and surface only needed decisions to the human.' : 'Run `rig orchestrate` to continue the next Orchestrator tick.'}`,
    '',
    '## Needs Your Attention',
    '',
    pendingTable(pending),
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

function pendingTable(tasks: CrewTask[]): string {
  if (tasks.length === 0) return '_No open pending questions._';
  const rows = tasks.map(t => `| ${t.id || '-'} | ${t.fields.type || '-'} | ${cleanTaskText(t.text)} | ${t.fields.priority || '-'} |`);
  return ['| ID | Type | Item | Priority |', '|---|---|---|---|'].concat(rows).join('\n');
}

function projectTable(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[]): string {
  const projects = crew.projects || [];
  if (projects.length === 0) return '_No projects registered yet._';
  const rows = projects.map(p => {
    const scoped = tasks.filter(t => t.scope !== 'pending' && (t.scope === `project:${p.name}` || t.scope.startsWith(`project:${p.name}:`) || t.fields.project === p.name));
    const s = summarize(scoped);
    const health = s.blocked > 0 ? 'At Risk' : 'On Track';
    return `| ${p.name} | ${p.owner} | ${p.defaultExecutor || crew.defaultExecutor || 'claude'} | ${health} | ${s.open} | ${s.blocked} | ${shortPath(p.path)} |`;
  });
  return ['| Project | Owner | Executor | Health | Open | Blocked | Path |', '|---|---|---|---|---:|---:|---|'].concat(rows).join('\n');
}

function roleTable(crew: ReturnType<typeof requireCrew>, tasks: CrewTask[]): string {
  const roles = roleDefinitionsForCrew(crew);
  const rows = roles.map(role => {
    const scoped = tasks.filter(t => t.scope === `legacy-role:${role.name}` || t.scope.includes(`:role:${role.name}`) || t.fields.role === role.name || t.fields.owner === role.name);
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
  const active = tasks.filter(t => !t.done && t.scope !== 'pending').slice(0, 20);
  if (active.length === 0) return '_No active tasks._';
  const rows = active.map(t => `| ${t.id || '-'} | ${t.fields.project || '-'} | ${t.fields.owner || displayScope(t.scope)} | ${t.fields.status || 'pending'} | ${cleanTaskText(t.text)} |`);
  return ['| ID | Project | Owner | Status | Task |', '|---|---|---|---|---|'].concat(rows).join('\n');
}

function displayScope(scope: string): string {
  if (scope.startsWith('legacy-role:')) return scope.slice('legacy-role:'.length);
  const projectRole = scope.match(/^project:([^:]+):role:([^:]+)/);
  if (projectRole) return `${projectRole[1]}/${projectRole[2]}`;
  const projectTasklist = scope.match(/^project:([^:]+):tasklist/);
  if (projectTasklist) return projectTasklist[1];
  return scope;
}

function cleanTaskText(text: string): string {
  return text.replace(/\[[A-Za-z0-9_-]+::\s*[^\]]+\]/g, '').trim().replace(/\|/g, '\\|');
}

function relFile(t: CrewTask): string {
  return path.basename(t.file) + ':' + t.line;
}
