import omJournal from './journal';

// `rig overmind` (alias `rig om`) — overmind cross-project aggregation layer (design §4.4),
// parallel to `rig orchestrate` and `rig wiki`. MVP: `journal`. More (status/sync/...) deferred.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOvermindCommands(program: any): void {
  const om = program.command('overmind')
    .alias('om')
    .description('overmind cross-project aggregation (alias: om)');

  om.command('journal [date]')
    .description('aggregate completed tasks (status done + done-at; default today) into journal/<entity>/<YYMM>.md')
    .option('-c, --crew <name>', 'target crew name')
    .action(omJournal);
}
