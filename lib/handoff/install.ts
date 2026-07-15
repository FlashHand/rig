import fs from 'fs';
import path from 'path';
import print from '../print';
import { resolveHandoffPaths, shortPath, HandoffPaths } from './paths';
import { requireMacOS } from './platform';
import { installHooks, HookInvocation, readSettings, uniqueBackupPath } from './settings';
import { installLauncher, preflightLauncher } from './launcher';

export interface InstallOptions {
  force?: boolean;
  stopFailure?: boolean;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  invocation?: HookInvocation;
}

export interface InstallResult {
  claudeSkillChanged: boolean;
  codexSkillChanged: boolean;
  launcherChanged: boolean;
  settingsChanged: boolean;
  settingsBackup?: string;
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
    paths.fromClaudeSkillSource,
    paths.codexSkill,
    paths.backups,
    options.force,
  );
  const settings = installHooks(
    paths.claudeSettings,
    paths.backups,
    invocation,
    options.stopFailure !== false,
  );

  return {
    claudeSkillChanged,
    codexSkillChanged,
    launcherChanged,
    settingsChanged: settings.changed,
    settingsBackup: settings.backupPath,
    invocation,
    paths,
  };
}

export default function installHandoffCli(options: InstallOptions = {}): void {
  try {
    const result = installHandoff(options);
    reportSkill('Claude /handoff', result.paths.claudeSkill, result.claudeSkillChanged);
    reportSkill('Codex from-claude', result.paths.codexSkill, result.codexSkillChanged);
    reportLauncher(result.paths.handoffExecutable, result.launcherChanged);
    if (result.settingsChanged) print.succeed(`updated ${shortPath(result.paths.claudeSettings)}`);
    else print.info(`hooks already installed in ${shortPath(result.paths.claudeSettings)}`);
    if (result.settingsBackup) print.info(`settings backup: ${shortPath(result.settingsBackup)}`);
    print.succeed('ready: type /handoff in Claude, then paste into Codex.');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

function validateSources(paths: HandoffPaths): void {
  if (!paths.rigRoot) throw new Error('could not locate the rigjs package root.');
  for (const source of [paths.handoffSkillSource, paths.fromClaudeSkillSource]) {
    if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
      throw new Error(`bundled skill is missing: ${path.join(source, 'SKILL.md')}`);
    }
  }
}

function preflightInstall(paths: HandoffPaths, rigBin: string, force = false): void {
  preflightLauncher(paths.handoffExecutable, rigBin, force);
  preflightSkillDirectory(paths.handoffSkillSource, paths.claudeSkill, force);
  preflightSkillDirectory(paths.fromClaudeSkillSource, paths.codexSkill, force);
  // Parse settings before creating any links, so a malformed dotfile cannot
  // leave a predictable partial installation behind.
  readSettings(paths.claudeSettings);
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
      const backup = uniqueBackupPath(backupDir, target.includes('from-claude') ? 'codex-from-claude-skill' : 'claude-handoff-skill');
      fs.renameSync(target, backup);
    }
  }
  fs.symlinkSync(source, target, 'dir');
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
