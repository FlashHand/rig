import os from 'os';
import path from 'path';

export const RIG_HOME = process.env.RIG_HOME || path.join(os.homedir(), '.rig');

export const paths = {
  home: RIG_HOME,
  config: path.join(RIG_HOME, 'config.yml'),
  registry: path.join(RIG_HOME, 'wikis.yml'),
  stateDb: path.join(RIG_HOME, 'state.db'),
  locks: path.join(RIG_HOME, 'locks'),
  logs: path.join(RIG_HOME, 'logs'),
  daemonLog: path.join(RIG_HOME, 'logs', 'wiki-daemon.log'),
  cache: path.join(RIG_HOME, 'cache'),
  sandbox: path.join(RIG_HOME, 'cache', 'sandbox'),
  launchAgent: path.join(os.homedir(), 'Library', 'LaunchAgents', 'ai.flashhand.rig.wiki.plist'),
  claudeSkillsDir: path.join(os.homedir(), '.claude', 'skills'),
  builtinSkillRelative: 'RIG_WIKI_SKILL.md',
};

export const daemonLabel = 'ai.flashhand.rig.wiki';

export function wikiLogDir(wikiName: string) {
  return path.join(paths.logs, 'wikis', wikiName);
}

/** Per-vault config path: `<vault>/.rig/config.yml`. */
export function vaultConfigPath(vaultDir: string) {
  return path.join(vaultDir, '.rig', 'config.yml');
}

export function wikiLockFile(wikiName: string) {
  return path.join(paths.locks, `${wikiName}.lock`);
}
