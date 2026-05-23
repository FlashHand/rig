import path from 'path';
import print from '../print';
import { loadRegistry, saveRegistry, loadVaultConfig } from './config';

/**
 * `rig wiki unregister <nameOrPath>` — drop a vault path from
 * `~/.rig/wikis.yml`. The vault's own `<vault>/.rig/config.yml` (and the
 * rest of its on-disk contents) is left untouched.
 */
export default function wikiUnregister(nameOrPath: string): void {
  const reg = loadRegistry();
  const targetAbs = path.resolve(nameOrPath);
  const before = reg.wikis.length;

  reg.wikis = reg.wikis.filter(p => {
    if (p === targetAbs) return false;
    const v = loadVaultConfig(p);
    if (v && v.name === nameOrPath) return false;
    return true;
  });

  if (reg.wikis.length === before) {
    print.error(`no registered wiki matches "${nameOrPath}"`);
    process.exit(1);
  }
  saveRegistry(reg);
  print.succeed(`unregistered "${nameOrPath}" (disk contents untouched)`);
}
