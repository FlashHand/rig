import daemonInstall from './install';
import daemonUninstall from './uninstall';
import daemonStart from './start';
import daemonStop from './stop';
import daemonStatus from './status';
import daemonLogs from './logs';
import daemonRunner from './runner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDaemonCommands(parent: any): void {
  const daemon = parent.command('daemon').description('launchd-managed background runner');

  daemon.command('install').description('install ~/Library/LaunchAgents/ai.flashhand.rig.wiki.plist').action(daemonInstall);
  daemon.command('uninstall').description('remove plist + bootout').action(daemonUninstall);
  daemon.command('start').description('bootstrap launchd agent').action(daemonStart);
  daemon.command('stop').description('bootout launchd agent').action(daemonStop);
  daemon.command('status').description('print state + pid').action(daemonStatus);
  daemon.command('logs')
    .option('-f, --follow', 'tail -f')
    .description('tail the daemon log')
    .action(daemonLogs);

  // hidden — launchctl invokes this; humans should never type it
  daemon.command('runner').description('launchd entry — do not invoke directly').action(daemonRunner);
}
