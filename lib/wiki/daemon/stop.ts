import fs from 'fs';
import { spawnSync } from 'child_process';
import print from '../../print';
import { paths } from '../paths';
import { requireMacOS } from '../platform';

export default function daemonStop(): void {
  requireMacOS();
  if (!fs.existsSync(paths.launchAgent)) {
    print.info('no launchd agent installed');
    return;
  }
  const uid = process.getuid?.() ?? 0;
  spawnSync('launchctl', ['bootout', `gui/${uid}`, paths.launchAgent], { stdio: 'inherit' });
  print.succeed('daemon stopped');
}
