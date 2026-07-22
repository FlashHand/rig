import fs from 'fs';
import path from 'path';
import print from '../print';
import { resolveHandoffPaths, shortPath } from './paths';
import { requireMacOS } from './platform';
import { uninstallHooks } from './settings';
import { removeOwnedLauncher } from './launcher';
import { uninstallCodexHooks } from './codex-settings';

interface UninstallOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function uninstallHandoff(options: UninstallOptions = {}): {
  removed: string[];
  settingsChanged: boolean;
  backupPath?: string;
  codexHooksChanged: boolean;
  codexHooksBackup?: string;
} {
  requireMacOS(options.platform || process.platform);
  const env = options.env || process.env;
  const paths = resolveHandoffPaths(env);
  const removed: string[] = [];
  if (removeOwnedSkillLink(paths.claudeSkill, paths.handoffSkillSource)) removed.push(paths.claudeSkill);
  if (removeOwnedSkillLink(paths.codexSkill, paths.rigFromClaudeSkillSource)) removed.push(paths.codexSkill);
  if (removeOwnedSkillLink(paths.codexHandoffSkill, paths.handoffSkillSource)) removed.push(paths.codexHandoffSkill);
  if (removeOwnedSkillLink(paths.claudeFromCodexSkill, paths.rigFromCodexSkillSource)) removed.push(paths.claudeFromCodexSkill);
  if (removeOwnedSkillLink(paths.legacyCodexSkill, paths.legacyFromClaudeSkillSource)
    || removeOwnedSkillLink(paths.legacyCodexSkill, paths.rigFromClaudeSkillSource)) removed.push(paths.legacyCodexSkill);
  const settings = uninstallHooks(paths.claudeSettings, paths.backups, paths.claudeSkillOverrideState);
  const codexHooks = uninstallCodexHooks(paths.codexHooks, paths.backups);
  if (removeOwnedPointer(paths.codexLatestPointer)) removed.push(paths.codexLatestPointer);
  if (removeOwnedLauncher(paths.handoffExecutable, path.join(paths.rigRoot, 'bin', 'rig.js'))) removed.push(paths.handoffExecutable);
  return {
    removed,
    settingsChanged: settings.changed,
    backupPath: settings.backupPath,
    codexHooksChanged: codexHooks.changed,
    codexHooksBackup: codexHooks.backupPath,
  };
}

export default function uninstallHandoffCli(options: UninstallOptions = {}): void {
  try {
    const result = uninstallHandoff(options);
    for (const item of result.removed) print.succeed(`removed ${shortPath(item)}`);
    if (result.settingsChanged) print.succeed('removed Rig handoff hooks from Claude settings.');
    if (result.backupPath) print.info(`settings backup: ${shortPath(result.backupPath)}`);
    if (result.codexHooksChanged) print.succeed('removed Rig handoff hook from Codex hooks.');
    if (result.codexHooksBackup) print.info(`Codex hooks backup: ${shortPath(result.codexHooksBackup)}`);
    if (result.removed.length === 0 && !result.settingsChanged && !result.codexHooksChanged) print.info('nothing to remove.');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

function removeOwnedPointer(target: string): boolean {
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return false; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as any).schemaVersion !== 1) return false;
  fs.rmSync(target, { force: true });
  return true;
}

function removeOwnedSkillLink(target: string, expectedSource: string): boolean {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(target); } catch { return false; }
  if (!stat.isSymbolicLink()) return false;
  const resolved = path.resolve(path.dirname(target), fs.readlinkSync(target));
  if (resolved !== path.resolve(expectedSource)) return false;
  fs.rmSync(target, { force: true });
  return true;
}
