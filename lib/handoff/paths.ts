import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

export interface HandoffPaths {
  rigRoot: string;
  handoffSkillSource: string;
  rigFromClaudeSkillSource: string;
  rigFromCodexSkillSource: string;
  legacyFromClaudeSkillSource: string;
  claudeConfigDir: string;
  claudeSettings: string;
  claudeSkill: string;
  claudeFromCodexSkill: string;
  codexHome: string;
  codexSkill: string;
  codexHandoffSkill: string;
  codexHooks: string;
  codexConfig: string;
  codexSessions: string;
  codexLatestPointer: string;
  claudeSkillOverrideState: string;
  legacyCodexSkill: string;
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
  const claudeSettings = env.RIG_HANDOFF_CLAUDE_SETTINGS || path.join(claudeConfigDir, 'settings.json');
  const codexHome = env.RIG_HANDOFF_CODEX_HOME || env.CODEX_HOME || path.join(home, '.codex');
  const rigHome = env.RIG_HOME || path.join(home, '.rig');
  const claudeProfileKey = createHash('sha256').update(path.resolve(claudeSettings)).digest('hex').slice(0, 12);

  return {
    rigRoot,
    handoffSkillSource: path.join(rigRoot, 'skills', 'handoff'),
    rigFromClaudeSkillSource: path.join(rigRoot, 'skills', 'rig-from-claude'),
    rigFromCodexSkillSource: path.join(rigRoot, 'skills', 'rig-from-codex'),
    legacyFromClaudeSkillSource: path.join(rigRoot, 'skills', 'from-claude'),
    claudeConfigDir,
    claudeSettings,
    claudeSkill: path.join(claudeConfigDir, 'skills', 'handoff'),
    claudeFromCodexSkill: path.join(claudeConfigDir, 'skills', 'rig-from-codex'),
    codexHome,
    codexSkill: path.join(codexHome, 'skills', 'rig-from-claude'),
    codexHandoffSkill: path.join(codexHome, 'skills', 'handoff'),
    codexHooks: env.RIG_HANDOFF_CODEX_HOOKS || path.join(codexHome, 'hooks.json'),
    codexConfig: env.RIG_HANDOFF_CODEX_CONFIG || path.join(codexHome, 'config.toml'),
    codexSessions: env.RIG_HANDOFF_CODEX_SESSIONS || path.join(codexHome, 'sessions'),
    codexLatestPointer: env.RIG_HANDOFF_CODEX_POINTER || path.join(rigHome, 'handoff', 'codex-latest.json'),
    claudeSkillOverrideState: env.RIG_HANDOFF_CLAUDE_SKILL_OVERRIDE_STATE
      || path.join(rigHome, 'handoff', `claude-skill-override-${claudeProfileKey}.json`),
    legacyCodexSkill: path.join(codexHome, 'skills', 'from-claude'),
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
