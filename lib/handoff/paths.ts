import fs from 'fs';
import os from 'os';
import path from 'path';

export interface HandoffPaths {
  rigRoot: string;
  handoffSkillSource: string;
  fromClaudeSkillSource: string;
  claudeConfigDir: string;
  claudeSettings: string;
  claudeSkill: string;
  codexHome: string;
  codexSkill: string;
  handoffExecutable: string;
  backups: string;
  claudeProjects: string;
}

export function findRigRoot(start: string = __dirname): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 12; i++) {
    const packageJson = path.join(dir, 'package.json');
    if (fs.existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
        if (pkg && pkg.name === 'rigjs') return dir;
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveHandoffPaths(env: NodeJS.ProcessEnv = process.env): HandoffPaths {
  const home = env.HOME || os.homedir();
  const rigRoot = env.RIG_HANDOFF_RIG_ROOT || findRigRoot() || '';
  const claudeConfigDir = env.RIG_HANDOFF_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const codexHome = env.RIG_HANDOFF_CODEX_HOME || env.CODEX_HOME || path.join(home, '.codex');
  const rigHome = env.RIG_HOME || path.join(home, '.rig');

  return {
    rigRoot,
    handoffSkillSource: path.join(rigRoot, 'skills', 'handoff'),
    fromClaudeSkillSource: path.join(rigRoot, 'skills', 'from-claude'),
    claudeConfigDir,
    claudeSettings: env.RIG_HANDOFF_CLAUDE_SETTINGS || path.join(claudeConfigDir, 'settings.json'),
    claudeSkill: path.join(claudeConfigDir, 'skills', 'handoff'),
    codexHome,
    codexSkill: path.join(codexHome, 'skills', 'from-claude'),
    handoffExecutable: path.join(rigHome, 'bin', 'rig-handoff'),
    backups: env.RIG_HANDOFF_BACKUP_DIR || path.join(rigHome, 'backups', 'handoff'),
    claudeProjects: path.join(claudeConfigDir, 'projects'),
  };
}

export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const pathValue = env.PATH || '';
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* continue */ }
  }
  return null;
}

export function shortPath(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME || os.homedir();
  return value.startsWith(home + path.sep) ? '~' + value.slice(home.length) : value;
}
