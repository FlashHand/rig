import print from '../../print';
import { loadWikiConfig } from '../config';
import { paths } from '../paths';
import fs from 'fs';
import path from 'path';

/**
 * Daemon entry. launchctl invokes:
 *   node <rig-built>/index.js wiki daemon runner
 *
 * v1: minimal heartbeat loop that logs to ~/.rig/logs/wiki-daemon.log.
 * P2 will add: cron-job registration per wiki for `schedule.scan` / `schedule.lint`,
 * plus auto-on-new ingest from `ingestRules`.
 */
export default function daemonRunner(): void {
  fs.mkdirSync(paths.logs, { recursive: true });
  const log = (msg: string) =>
    fs.appendFileSync(paths.daemonLog, `[${new Date().toISOString()}] ${msg}\n`);

  log('rig wiki daemon: starting (v1 heartbeat-only)');

  let cfg = loadWikiConfig();
  log(`registered wikis: ${cfg.wikis.map(w => w.name).join(', ') || '(none)'}`);

  // Reload config every 10 minutes so daemon doesn't need restart when wikis change.
  setInterval(() => {
    try {
      cfg = loadWikiConfig();
      log(`heartbeat — wikis=${cfg.wikis.length}`);
    } catch (e: any) {
      log(`heartbeat — config error: ${e.message}`);
    }
  }, 10 * 60 * 1000);

  process.on('SIGTERM', () => { log('SIGTERM — shutting down'); process.exit(0); });
  process.on('SIGINT',  () => { log('SIGINT — shutting down'); process.exit(0); });

  // The interval keeps the event loop alive.
  print.info(`daemon up; logging to ${paths.daemonLog}`);
  // eslint-disable-next-line no-void
  void path; // unused-import placeholder, retained for future cron wiring
}
