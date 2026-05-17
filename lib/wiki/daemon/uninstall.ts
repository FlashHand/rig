import fs from 'fs';
import { spawnSync } from 'child_process';
import print from '../../print';
import { paths } from '../paths';
import { requireMacOS } from '../platform';

export default function daemonUninstall(): void {
  requireMacOS();
  const uid = process.getuid?.() ?? 0;
  if (fs.existsSync(paths.launchAgent)) {
    spawnSync('launchctl', ['bootout', `gui/${uid}`, paths.launchAgent], { stdio: 'ignore' });
    fs.rmSync(paths.launchAgent);
    print.succeed(`removed ${paths.launchAgent}`);
  } else {
    print.info('no launchd agent installed');
  }
}
