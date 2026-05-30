import omJournal from './journal';
import { omStatus, omSync } from './rollup';
import omTaskNew from './taskNew';

// `rig overmind` (alias `rig om`) — overmind cross-project aggregation layer (design §4.4),
// parallel to `rig orchestrate` and `rig wiki`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOvermindCommands(program: any): void {
  const om = program.command('overmind')
    .alias('om')
    .description('overmind cross-project aggregation (alias: om)');

  om.command('journal [date]')
    .description('aggregate completed tasks (status done + done-at; default today) into journal/<entity>/<YYMM>.md')
    .option('--crew <name>', 'target crew name')
    .action(omJournal);

  om.command('status')
    .description('cross-entity task-status rollup (per project, from journal/INDEX.md + docs/plan/tasks)')
    .option('--crew <name>', 'target crew name')
    .action(omStatus);

  om.command('sync')
    .description('(re)generate overmind.md — distilled cross-entity project + task-status index')
    .option('--crew <name>', 'target crew name')
    .action(omSync);

  om.command('task <project> <id>')
    .description('scaffold a docs-sprint task file (docs/plan/tasks/<id>.md) for <project>')
    .option('--role <role>', 'coder | designer | tester | researcher (default coder)')
    .option('--engine <engine>', 'engine override (claude | codex | pi)')
    .option('--status <status>', 'initial status (default draft)')
    .option('--crew <name>', 'target crew name')
    .action(omTaskNew);
}
