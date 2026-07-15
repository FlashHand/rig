import fs from 'fs';
import path from 'path';
import print from '../print';
import { resolveHandoffPaths, shortPath } from './paths';
import { requireMacOS } from './platform';
import { uninstallHooks } from './settings';
import { removeOwnedLauncher } from './launcher';

interface UninstallOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function uninstallHandoff(options: UninstallOptions = {}): { removed: string[]; settingsChanged: boolean; backupPath?: string } {
  requireMacOS(options.platform || process.platform);
  const env = options.env || process.env;
  const paths = resolveHandoffPaths(env);
  const removed: string[] = [];
  if (removeOwnedSkillLink(paths.claudeSkill, paths.handoffSkillSource)) removed.push(paths.claudeSkill);
  if (removeOwnedSkillLink(paths.codexSkill, paths.fromClaudeSkillSource)) removed.push(paths.codexSkill);
  if (removeOwnedLauncher(paths.handoffExecutable, path.join(paths.rigRoot, 'bin', 'rig.js'))) removed.push(paths.handoffExecutable);
  const settings = uninstallHooks(paths.claudeSettings, paths.backups);
  return { removed, settingsChanged: settings.changed, backupPath: settings.backupPath };
}

export default function uninstallHandoffCli(options: UninstallOptions = {}): void {
  try {
    const result = uninstallHandoff(options);
    for (const item of result.removed) print.succeed(`removed ${shortPath(item)}`);
    if (result.settingsChanged) print.succeed('removed Rig handoff hooks from Claude settings.');
    if (result.backupPath) print.info(`settings backup: ${shortPath(result.backupPath)}`);
    if (result.removed.length === 0 && !result.settingsChanged) print.info('nothing to remove.');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
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
