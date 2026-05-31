import crewInit from './init';
import crewStatus from './status';
import crewBoard from './board';
import crewPendingQuestions from './pendingQuestions';
import crewSync from './sync';
import crewDoctor from './doctor';
import crewEngine from './engine';
import crewDispatch from './dispatchCommand';
import crewRun from './run';
import crewAsk from './ask';
import crewStub from './stub';
import { crewOverview } from '../overmind/rollup';
import omJournal from '../overmind/journal';
import omTaskNew from '../overmind/taskNew';
import { projectAdd, projectList, projectStatus, projectSync } from './project';
import { roleAdd, roleList, roleShow } from './roleCommand';
import { pendingAdd, pendingAnswer, pendingList, pendingRemove } from './pending';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCrewCommands(program: any): void {
  const orchestrate = program.command('orchestrate [message...]')
    .aliases(['crew', 'om', 'overmind'])
    .description('Orchestrator-first multi-agent workspace over an Obsidian vault (aliases: crew, om, overmind)')
    .option('--crew <name>', 'target crew name')
    .action((message: string[] | undefined, opts: { crew?: string }) => crewAsk(message, opts));

  orchestrate.command('init')
    .description('initialize a crew vault')
    .requiredOption('--vault <path>', 'Obsidian vault path')
    .option('-n, --as <name>', 'crew name')
    .option('--root <path>', 'root folder inside the vault (default: rig-crew)')
    .option('--allow-project-vault', 'allow a vault path under projects/<submodule>')
    .action(crewInit);

  orchestrate.command('ask <message...>')
    .description('send a message to the Orchestrator (MVP appends to Current-Goal.md)')
    .option('--crew <name>', 'target crew name')
    .action(crewAsk);

  orchestrate.command('status')
    .description('show crew progress summary')
    .option('--crew <name>', 'target crew name')
    .option('--json', 'machine-readable output')
    .action(crewStatus);

  orchestrate.command('pending-questions')
    .alias('inbox')
    .description('show open system→user pending questions (alias: inbox)')
    .option('--crew <name>', 'target crew name')
    .option('--json', 'machine-readable output')
    .action(crewPendingQuestions);

  orchestrate.command('board')
    .description('refresh Dashboard.md')
    .option('--crew <name>', 'target crew name')
    .action(crewBoard);

  orchestrate.command('sync')
    .description('scan Markdown tasks and update crew state cache')
    .option('--crew <name>', 'target crew name')
    .action(crewSync);

  // --- overmind aggregation (merged from the former `rig om`; see CLAUDE.md) ---
  orchestrate.command('overview')
    .description('cross-entity task-status rollup; --write (re)generates overmind.md')
    .option('--write', 'also (re)generate overmind.md at the vault root')
    .option('--crew <name>', 'target crew name')
    .action(crewOverview);

  orchestrate.command('journal [date]')
    .description('roll completed tasks (status done + done-at; default today) into journal/<entity>/<YYMM>.md')
    .option('--crew <name>', 'target crew name')
    .action(omJournal);

  orchestrate.command('task <project> <id>')
    .description('scaffold a docs-sprint task file (docs/plan/tasks/<id>.md) for <project>')
    .option('--role <role>', 'coder | designer | tester | researcher (default coder)')
    .option('--engine <engine>', 'engine override (claude | codex | pi)')
    .option('--status <status>', 'initial status (default draft)')
    .option('--crew <name>', 'target crew name')
    .action(omTaskNew);

  orchestrate.command('doctor')
    .description('check crew config, vault, rules, and project wiring')
    .option('--crew <name>', 'target crew name')
    .action(crewDoctor);

  orchestrate.command('engine')
    .description('show which execution engine resolves and why (5-level order; debug)')
    .option('--crew <name>', 'target crew name')
    .option('-p, --project <name>', 'resolve as if dispatching for this project')
    .option('--engine <engine>', 'explicit task-level engine override (claude | codex | pi)')
    .option('--json', 'machine-readable output')
    .action(crewEngine);

  orchestrate.command('dispatch <project>')
    .description('run a prompt via the resolved engine in a fresh task/<id> worktree of <project> (MVP runtime)')
    .requiredOption('--prompt <text>', 'prompt for the engine')
    .option('--engine <engine>', 'engine override (claude | codex | pi); else resolved from project/crew/host')
    .option('--task <id>', 'task id for the worktree branch (default: adhoc-<ts>)')
    .option('--timeout <ms>', 'timeout in ms (default 600000)')
    .option('--crew <name>', 'target crew name')
    .action(crewDispatch);

  const project = orchestrate.command('project').description('manage project owners');
  project.command('add <name>')
    .description('register a project owner')
    .requiredOption('--path <path>', 'project path')
    .option('--owner <name>', 'owner alias (default: maintainer:<name>)')
    .option('--executor <name>', 'claude | codex | pi (default: crew defaultExecutor)')
    .option('--test-command <cmd>', 'default focused test command')
    .option('--no-write', 'mark owner as read-only')
    .option('--crew <name>', 'target crew name')
    .action(projectAdd);
  project.command('sync')
    .description('sync project owners from the vault projects/ directory')
    .option('--from <path>', 'projects directory, relative to the vault (default: projects)')
    .option('--executor <name>', 'default executor for newly discovered projects')
    .option('--test-command <cmd>', 'default focused test command for newly discovered projects')
    .option('--no-write', 'mark newly discovered owners as read-only')
    .option('--keep-missing', 'keep projects that disappeared from the scanned directory')
    .option('--no-archive-missing', 'do not archive stale rig-agents project folders')
    .option('--crew <name>', 'target crew name')
    .action(projectSync);
  project.command('list')
    .description('list registered projects')
    .option('--crew <name>', 'target crew name')
    .action(projectList);
  project.command('status <name>')
    .description('show one project status')
    .option('--crew <name>', 'target crew name')
    .action(projectStatus);

  const role = orchestrate.command('role').description('manage global crew roles');
  role.command('add <name>')
    .description('add or update a global role from a markdown description')
    .requiredOption('--from <file>', 'role description markdown file')
    .option('--title <title>', 'display title')
    .option('--summary <text>', 'short description')
    .option('--agent <name>', 'agent/subagent name to use for this role')
    .option('--executor <name>', 'claude | codex | pi')
    .option('--force', 'update an existing custom role')
    .option('--crew <name>', 'also materialize role files in this crew vault')
    .action(roleAdd);
  role.command('list')
    .description('list built-in and custom roles')
    .option('--crew <name>', 'target crew name')
    .action(roleList);
  role.command('show <name>')
    .description('show one role definition')
    .option('--crew <name>', 'target crew name')
    .action(roleShow);

  const pending = orchestrate.command('pending')
    .description('list and manage materials the user must supply (per project)');
  pending.command('list', { isDefault: true })
    .description('list pending questions (default action; runs when `orchestrate pending` is used without a subcommand)')
    .option('--crew <name>', 'target crew name')
    .option('-p, --project <name>', 'limit to one project')
    .option('--all', 'include resolved questions')
    .option('--json', 'machine-readable output')
    .action(pendingList);
  pending.command('add <title...>')
    .description('record a new pending question / missing material')
    .option('--crew <name>', 'target crew name')
    .option('-p, --project <name>', 'project name (auto-detected from CWD if omitted)')
    .option('--why <text>', 'why this information is needed')
    .option('--need <text>', 'what to provide (file path, value, decision, etc.)')
    .option('--priority <level>', 'high | medium | low')
    .option('--asked-by <role>', 'role or person who raised the question (default: orchestrator)')
    .action((title: string[], opts: { crew?: string; project?: string; why?: string; need?: string; priority?: string; askedBy?: string }) => pendingAdd(title, opts));
  pending.command('answer <id>')
    .description('mark a pending question as resolved')
    .option('--crew <name>', 'target crew name')
    .option('-p, --project <name>', 'limit to one project')
    .option('-n, --note <text>', 'short note describing what the user supplied')
    .action(pendingAnswer);
  pending.command('remove <id>')
    .description('delete a pending question (use answer to keep history)')
    .option('--crew <name>', 'target crew name')
    .option('-p, --project <name>', 'limit to one project')
    .action(pendingRemove);

  orchestrate.command('plan').description('planned: Orchestrator refine + decompose').action(crewStub('plan'));
  orchestrate.command('refine').description('planned: update Shared/Spec.md').action(crewStub('refine'));
  orchestrate.command('decompose').description('planned: split Spec into owner/role tasks').action(crewStub('decompose'));
  orchestrate.command('run <project>')
    .description('dispatch all ready docs/plan/tasks of <project> to their engines in task worktrees (MVP develop)')
    .option('--concurrency <n>', 'max parallel dispatches (default 4)')
    .option('--timeout <ms>', 'per-task timeout in ms (default 600000)')
    .option('--dry-run', 'show what would dispatch without running')
    .option('--crew <name>', 'target crew name')
    .action(crewRun);
  orchestrate.command('research <topic...>').description('planned: ask Researcher to write a report').action(crewStub('research'));
  orchestrate.command('report').description('planned: generate Orchestrator report').action(crewStub('report'));

  const pm = orchestrate.command('pm').description('PM tools');
  pm.command('prd').description('planned: generate/update PRD').action(crewStub('pm prd'));
  pm.command('review <file>').description('planned: review PRD/Spec').action(crewStub('pm review'));
}
