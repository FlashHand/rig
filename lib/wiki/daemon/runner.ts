import print from '../../print';
import { resolveVault } from '../config';
import { paths } from '../paths';
import fs from 'fs';

/**
 * Daemon entry. launchctl invokes:
 *   node <rig-built>/index.js wiki daemon runner
 *
 * v1: minimal heartbeat loop that logs to ~/.rig/logs/wiki-daemon.log.
 * Without a global registry, the daemon resolves a vault from its CWD at
 * startup (whatever directory it was launched from). If none is found, it
 * still ticks but reports `(no vault)`.
 *
 * P2 will accept a configurable list of vault paths in ~/.rig/config.yml
 * (`wiki.watchedVaults`) and run cron-based scan/lint/ingest per entry.
 */
export default function daemonRunner(): void {
  fs.mkdirSync(paths.logs, { recursive: true });
  const log = (msg: string) =>
    fs.appendFileSync(paths.daemonLog, `[${new Date().toISOString()}] ${msg}\n`);

  log('rig wiki daemon: starting (v1 heartbeat-only)');
  const startVault = resolveVault();
  log(`startup vault: ${startVault ? `${startVault.name} (${startVault.path})` : '(none)'}`);

  setInterval(() => {
    try {
      const v = resolveVault();
      log(`heartbeat — vault=${v ? v.name : '(none)'}`);
    } catch (e: any) {
      log(`heartbeat — config error: ${e.message}`);
    }
  }, 10 * 60 * 1000);

  process.on('SIGTERM', () => { log('SIGTERM — shutting down'); process.exit(0); });
  process.on('SIGINT',  () => { log('SIGINT — shutting down'); process.exit(0); });

  print.info(`daemon up; logging to ${paths.daemonLog}`);
}
