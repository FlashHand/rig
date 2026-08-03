import fs from 'fs';
import path from 'path';
import print from '../print';
import { resolveHandoffPaths, shortPath, HandoffPaths } from './paths';
import { requireMacOS } from './platform';
import { installHooks, HookInvocation, readSettings, uniqueBackupPath } from './settings';
import { installLauncher, preflightLauncher } from './launcher';
import { buildCodexHookCommand, installCodexHooks, isCodexHooksFeatureDisabled, readCodexHooks } from './codex-settings';

export interface InstallOptions {
  force?: boolean;
  stopFailure?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  invocation?: HookInvocation;
}

export interface InstallResult {
  claudeSkillChanged: boolean;
  claudeFromCodexSkillChanged: boolean;
  codexSkillChanged: boolean;
  codexHandoffSkillChanged: boolean;
  legacyCodexSkillRemoved: boolean;
  launcherChanged: boolean;
  settingsChanged: boolean;
  settingsBackup?: string;
  codexHooksChanged: boolean;
  codexHooksBackup?: string;
  invocation: HookInvocation;
  paths: HandoffPaths;
}

export function installHandoff(options: InstallOptions = {}): InstallResult {
  requireMacOS(options.platform || process.platform);
  const env = options.env || process.env;
  const paths = resolveHandoffPaths(env);
  validateSources(paths);
  const rigBin = path.join(paths.rigRoot, 'bin', 'rig.js');
  preflightInstall(paths, rigBin, options.force);
  const launcherChanged = installLauncher(
    rigBin,
    paths.handoffExecutable,
    paths.backups,
    env.RIG_HANDOFF_NODE_BIN || process.execPath,
    options.force,
  );
  const invocation = options.invocation || resolveRigInvocation(paths, env);

  const claudeSkillChanged = linkSkillDirectory(
    paths.handoffSkillSource,
    paths.claudeSkill,
    paths.backups,
    options.force,
  );
  const codexSkillChanged = linkSkillDirectory(
    paths.rigFromClaudeSkillSource,
    paths.codexSkill,
    paths.backups,
    options.force,
  );
  const codexHandoffSkillChanged = linkSkillDirectory(
    paths.handoffSkillSource,
    paths.codexHandoffSkill,
    paths.backups,
    options.force,
  );
  const claudeFromCodexSkillChanged = linkSkillDirectory(
    paths.rigFromCodexSkillSource,
    paths.claudeFromCodexSkill,
    paths.backups,
    options.force,
  );
  const legacyCodexSkillRemoved = removeOwnedLegacySkillLink(paths);
  const settings = installHooks(
    paths.claudeSettings,
    paths.backups,
    invocation,
    options.stopFailure !== false,
    paths.claudeSkillOverrideState,
  );
  const codexHooks = installCodexHooks(
    paths.codexHooks,
    paths.backups,
    buildCodexHookCommand(paths.handoffExecutable),
  );

  return {
    claudeSkillChanged,
    claudeFromCodexSkillChanged,
    codexSkillChanged,
    codexHandoffSkillChanged,
    legacyCodexSkillRemoved,
    launcherChanged,
    settingsChanged: settings.changed,
    settingsBackup: settings.backupPath,
    codexHooksChanged: codexHooks.changed,
    codexHooksBackup: codexHooks.backupPath,
    invocation,
    paths,
  };
}

export default function installHandoffCli(options: InstallOptions = {}): void {
  try {
    const result = installHandoff(options);
    reportSkill('Claude /handoff', result.paths.claudeSkill, result.claudeSkillChanged);
    reportSkill('Codex rig-from-claude adapter', result.paths.codexSkill, result.codexSkillChanged);
    reportSkill('Codex /handoff', result.paths.codexHandoffSkill, result.codexHandoffSkillChanged);
    reportSkill('Claude rig-from-codex adapter', result.paths.claudeFromCodexSkill, result.claudeFromCodexSkillChanged);
    if (result.legacyCodexSkillRemoved) print.succeed(`removed legacy skill link: ${shortPath(result.paths.legacyCodexSkill)}`);
    reportLauncher(result.paths.handoffExecutable, result.launcherChanged);
    if (result.settingsChanged) print.succeed(`updated ${shortPath(result.paths.claudeSettings)}`);
    else print.info(`hooks already installed in ${shortPath(result.paths.claudeSettings)}`);
    if (result.settingsBackup) print.info(`settings backup: ${shortPath(result.settingsBackup)}`);
    if (result.codexHooksChanged) print.succeed(`updated ${shortPath(result.paths.codexHooks)}`);
    else print.info(`hooks already installed in ${shortPath(result.paths.codexHooks)}`);
    if (result.codexHooksBackup) print.info(`Codex hooks backup: ${shortPath(result.codexHooksBackup)}`);
    if (isCodexHooksFeatureDisabled(result.paths.codexConfig)) {
      print.warn(`Codex hooks are disabled in ${shortPath(result.paths.codexConfig)}; enable [features].hooks before using /handoff.`);
    }
    print.warn('Codex trust cannot be verified by Rig: open /hooks once and trust the Rig UserPromptSubmit hook.');
    print.succeed('installed: use /handoff in Claude or Codex after that trust step; Codex $handoff remains compatible.');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

function validateSources(paths: HandoffPaths): void {
  if (!paths.rigRoot) throw new Error('could not locate the rigjs package root.');
  for (const source of [
    paths.handoffSkillSource,
    paths.rigFromClaudeSkillSource,
    paths.rigFromCodexSkillSource,
  ]) {
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`bundled skill is missing: ${path.join(source, 'SKILL.md')}`);
    }
  }
}

function preflightInstall(paths: HandoffPaths, rigBin: string, force = false): void {
  preflightLauncher(paths.handoffExecutable, rigBin, force);
  preflightSkillDirectory(paths.handoffSkillSource, paths.claudeSkill, force);
  preflightSkillDirectory(paths.rigFromClaudeSkillSource, paths.codexSkill, force);
  preflightSkillDirectory(paths.handoffSkillSource, paths.codexHandoffSkill, force);
  preflightSkillDirectory(paths.rigFromCodexSkillSource, paths.claudeFromCodexSkill, force);
  // Parse settings before creating any links, so a malformed dotfile cannot
  // leave a predictable partial installation behind.
  readSettings(paths.claudeSettings);
  readCodexHooks(paths.codexHooks);
}

export function resolveRigInvocation(paths: HandoffPaths, env: NodeJS.ProcessEnv = process.env): HookInvocation {
  const explicit = env.RIG_HANDOFF_RIG_BIN;
  const rig = explicit || paths.handoffExecutable;
  if (!fs.existsSync(rig)) throw new Error(`Rig handoff launcher is missing: ${rig}`);
  return { command: path.resolve(rig), args: ['handoff', 'hook'] };
}

function linkSkillDirectory(source: string, target: string, backupDir: string, force = false): boolean {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = lstat(target);
  if (existing) {
    if (existing.isSymbolicLink()) {
      const current = fs.readlinkSync(target);
      const resolved = path.resolve(path.dirname(target), current);
      if (resolved === path.resolve(source)) return false;
      if (!force) throw new Error(`${target} already links to ${current}; pass --force to replace it.`);
      fs.rmSync(target, { force: true });
    } else {
      if (!force) throw new Error(`${target} already exists; pass --force to back it up and replace it.`);
      fs.mkdirSync(backupDir, { recursive: true });
      const backup = uniqueBackupPath(backupDir, skillBackupPrefix(target));
      fs.renameSync(target, backup);
    }
  }
  fs.symlinkSync(source, target, 'dir');
  return true;
}

function skillBackupPrefix(target: string): string {
  if (target.includes('rig-from-claude')) return 'codex-rig-from-claude-skill';
  if (target.includes(`${path.sep}.codex${path.sep}skills${path.sep}handoff`)) return 'codex-handoff-skill';
  if (target.includes('rig-from-codex')) return 'claude-rig-from-codex-skill';
  return 'claude-handoff-skill';
}

function removeOwnedLegacySkillLink(paths: HandoffPaths): boolean {
  const existing = lstat(paths.legacyCodexSkill);
  if (!existing || !existing.isSymbolicLink()) return false;
  const resolved = path.resolve(path.dirname(paths.legacyCodexSkill), fs.readlinkSync(paths.legacyCodexSkill));
  const ownedSources = [paths.legacyFromClaudeSkillSource, paths.rigFromClaudeSkillSource].map(source => path.resolve(source));
  if (!ownedSources.includes(resolved)) return false;
  fs.rmSync(paths.legacyCodexSkill, { force: true });
  return true;
}

function preflightSkillDirectory(source: string, target: string, force = false): void {
  const existing = lstat(target);
  if (!existing || force) return;
  if (existing.isSymbolicLink()) {
    const resolved = path.resolve(path.dirname(target), fs.readlinkSync(target));
    if (resolved === path.resolve(source)) return;
    throw new Error(`${target} already links elsewhere; pass --force to replace it.`);
  }
  throw new Error(`${target} already exists; pass --force to back it up and replace it.`);
}

function lstat(value: string): fs.Stats | null {
  try { return fs.lstatSync(value); } catch { return null; }
}

function reportSkill(label: string, target: string, changed: boolean): void {
  if (changed) print.succeed(`linked ${label}: ${shortPath(target)}`);
  else print.info(`${label} already linked: ${shortPath(target)}`);
}

function reportLauncher(target: string, changed: boolean): void {
  if (changed) print.succeed(`wrote stable handoff launcher: ${shortPath(target)}`);
  else print.info(`stable handoff launcher already current: ${shortPath(target)}`);
}
