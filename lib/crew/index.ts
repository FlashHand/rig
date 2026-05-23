import crewInit from './init';
import crewStatus from './status';
import crewBoard from './board';
import crewInbox from './inbox';
import crewSync from './sync';
import crewDoctor from './doctor';
import crewAsk from './ask';
import crewStub from './stub';
import { projectAdd, projectList, projectStatus } from './project';
import { roleAdd, roleList, roleShow } from './roleCommand';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCrewCommands(program: any): void {
  const crew = program.command('crew [message...]')
    .description('Leader-first multi-agent workspace over an Obsidian vault')
    .option('-c, --crew <name>', 'target crew name')
    .action((message: string[] | undefined, opts: { crew?: string }) => crewAsk(message, opts));

  crew.command('init')
    .description('initialize a crew vault')
    .requiredOption('--vault <path>', 'Obsidian vault path')
    .option('-n, --as <name>', 'crew name')
    .option('--root <path>', 'root folder inside the vault (default: Agents)')
    .option('--allow-project-vault', 'allow a vault path under projects/<submodule>')
    .action(crewInit);

  crew.command('ask <message...>')
    .description('send a message to the Lead (MVP appends to Current-Goal.md)')
    .option('-c, --crew <name>', 'target crew name')
    .action(crewAsk);

  crew.command('status')
    .description('show crew progress summary')
    .option('-c, --crew <name>', 'target crew name')
    .option('--json', 'machine-readable output')
    .action(crewStatus);

  crew.command('inbox')
    .description('show open user attention items')
    .option('-c, --crew <name>', 'target crew name')
    .option('--json', 'machine-readable output')
    .action(crewInbox);

  crew.command('board')
    .description('refresh Agents/Team-Dashboard.md')
    .option('-c, --crew <name>', 'target crew name')
    .action(crewBoard);

  crew.command('sync')
    .description('scan Markdown tasks and update crew state cache')
    .option('-c, --crew <name>', 'target crew name')
    .action(crewSync);

  crew.command('doctor')
    .description('check crew config, vault, rules, and project wiring')
    .option('-c, --crew <name>', 'target crew name')
    .action(crewDoctor);

  const project = crew.command('project').description('manage project owners');
  project.command('add <name>')
    .description('register a project owner')
    .requiredOption('--path <path>', 'project path')
    .option('--owner <name>', 'owner alias (default: maintainer:<name>)')
    .option('--executor <name>', 'claude | codex | pi (default: crew defaultExecutor)')
    .option('--test-command <cmd>', 'default focused test command')
    .option('--no-write', 'mark owner as read-only')
    .option('-c, --crew <name>', 'target crew name')
    .action(projectAdd);
  project.command('list')
    .description('list registered projects')
    .option('-c, --crew <name>', 'target crew name')
    .action(projectList);
  project.command('status <name>')
    .description('show one project status')
    .option('-c, --crew <name>', 'target crew name')
    .action(projectStatus);

  const role = crew.command('role').description('manage global crew roles');
  role.command('add <name>')
    .description('add or update a global role from a markdown description')
    .requiredOption('--from <file>', 'role description markdown file')
    .option('--title <title>', 'display title')
    .option('--summary <text>', 'short description')
    .option('--agent <name>', 'agent/subagent name to use for this role')
    .option('--executor <name>', 'claude | codex | pi')
    .option('--force', 'update an existing custom role')
    .option('-c, --crew <name>', 'also materialize role files in this crew vault')
    .action(roleAdd);
  role.command('list')
    .description('list built-in and custom roles')
    .option('-c, --crew <name>', 'target crew name')
    .action(roleList);
  role.command('show <name>')
    .description('show one role definition')
    .option('-c, --crew <name>', 'target crew name')
    .action(roleShow);

  crew.command('plan').description('planned: Lead refine + decompose').action(crewStub('plan'));
  crew.command('refine').description('planned: update Shared/Spec.md').action(crewStub('refine'));
  crew.command('decompose').description('planned: split Spec into owner/role tasks').action(crewStub('decompose'));
  crew.command('run [target]').description('planned: run owner/role work').action(crewStub('run'));
  crew.command('research <topic...>').description('planned: ask Researcher to write a report').action(crewStub('research'));
  crew.command('report').description('planned: generate Lead report').action(crewStub('report'));

  const pm = crew.command('pm').description('PM tools');
  pm.command('prd').description('planned: generate/update PRD').action(crewStub('pm prd'));
  pm.command('review <file>').description('planned: review PRD/Spec').action(crewStub('pm review'));
}
