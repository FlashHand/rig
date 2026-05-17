import fs from 'fs';
import { spawnSync } from 'child_process';
import print from '../../print';
import { paths } from '../paths';
import { requireMacOS } from '../platform';

export default function daemonStart(): void {
  requireMacOS();
  if (!fs.existsSync(paths.launchAgent)) {
    print.error('launchd agent not installed. Run `rig wiki daemon install` first.');
    process.exit(1);
  }
  const uid = process.getuid?.() ?? 0;
  const res = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, paths.launchAgent], { stdio: 'inherit' });
  if (res.status !== 0 && res.status !== 17 /* already loaded */) {
    print.error('launchctl bootstrap failed');
    process.exit(1);
  }
  print.succeed('daemon started');
}
