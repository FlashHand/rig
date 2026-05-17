import path from 'path';
import print from '../print';
import { loadWikiConfig, saveWikiConfig } from './config';

export default function wikiUnregister(nameOrPath: string): void {
  const cfg = loadWikiConfig();
  const target = path.resolve(nameOrPath);
  const before = cfg.wikis.length;
  cfg.wikis = cfg.wikis.filter(w => w.name !== nameOrPath && w.path !== target);
  if (cfg.wikis.length === before) {
    print.error(`no registered wiki matches "${nameOrPath}"`);
    process.exit(1);
  }
  saveWikiConfig(cfg);
  print.succeed(`unregistered "${nameOrPath}" (disk contents untouched)`);
}
