import fs from 'fs';
import { spawn } from 'child_process';
import print from '../../print';
import { paths } from '../paths';

interface LogsOpts { follow?: boolean; }

export default function daemonLogs(opts: LogsOpts): void {
  if (!fs.existsSync(paths.daemonLog)) {
    print.info(`no log yet at ${paths.daemonLog}`);
    return;
  }
  const args = opts.follow ? ['-f', paths.daemonLog] : [paths.daemonLog];
  const child = spawn('tail', args, { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
