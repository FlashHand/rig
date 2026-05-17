import fs from 'fs';
import { spawnSync } from 'child_process';
import print from '../../print';
import { paths, daemonLabel } from '../paths';
import { requireMacOS } from '../platform';

export default function daemonStatus(): void {
  requireMacOS();
  if (!fs.existsSync(paths.launchAgent)) {
    print.info('not installed (run `rig wiki daemon install`)');
    return;
  }
  const uid = process.getuid?.() ?? 0;
  const res = spawnSync('launchctl', ['print', `gui/${uid}/${daemonLabel}`], { encoding: 'utf8' });
  if (res.status !== 0) {
    print.warn('not running (installed but unloaded)');
    return;
  }
  const out = res.stdout || '';
  const state = (out.match(/state\s*=\s*(\S+)/) || [])[1] || 'unknown';
  const pid = (out.match(/pid\s*=\s*(\d+)/) || [])[1];
  print.info(`state=${state}${pid ? `  pid=${pid}` : ''}`);
}
