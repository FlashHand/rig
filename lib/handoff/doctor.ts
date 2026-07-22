import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import print from '../print';
import { findLatestTranscript } from './transcript';
import { findOnPath, resolveHandoffPaths, shortPath } from './paths';
import { hasInstalledHook, hasUserOnlyHandoffSkill } from './settings';
import { isOwnedLauncher } from './launcher';
import { hasInstalledCodexHook, isCodexHooksFeatureDisabled } from './codex-settings';
import { findLatestCodexTranscript } from './codex-transcript';
import { readCodexLatestPointer } from './codex-pointer';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  fatal: boolean;
}

interface DoctorOptions {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export function inspectHandoffInstallation(options: DoctorOptions = {}): DoctorCheck[] {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const paths = resolveHandoffPaths(env);
  const rig = env.RIG_HANDOFF_RIG_BIN || paths.handoffExecutable;
  const claude = findOnPath('claude', env);
  const codex = findOnPath('codex', env);
  const claudeVersion = claude ? spawnSync(claude, ['--version'], { encoding: 'utf8', timeout: 3000 }) : null;
  const launcherVersion = isOwnedLauncher(rig)
    ? spawnSync(rig, ['--version'], { encoding: 'utf8', env: { ...env, PATH: '/usr/bin:/bin' }, timeout: 3000 })
    : null;
  const latest = findLatestTranscript(paths.claudeProjects);
  const latestCodex = findLatestCodexTranscript(paths.codexSessions, undefined, paths.codexLatestPointer);
  const codexPointer = readCodexLatestPointer(paths.codexLatestPointer);
  const hooksFeatureDisabled = isCodexHooksFeatureDisabled(paths.codexConfig);

  return [
    { name: 'platform', ok: platform === 'darwin', detail: platform, fatal: true },
    { name: 'handoff launcher', ok: !!launcherVersion && launcherVersion.status === 0, detail: launcherVersion && launcherVersion.status === 0 ? `${shortPath(rig, env)} — ${launcherVersion.stdout.trim()}` : shortPath(rig, env), fatal: true },
    { name: 'pbcopy', ok: fs.existsSync('/usr/bin/pbcopy'), detail: '/usr/bin/pbcopy', fatal: true },
    { name: 'Claude Code', ok: !!claude, detail: claude ? `${claude} — ${(claudeVersion && claudeVersion.stdout || '').trim()}` : 'not found on PATH', fatal: true },
    { name: 'Codex', ok: !!codex || fs.existsSync(paths.codexHome), detail: codex || paths.codexHome, fatal: false },
    { name: 'Codex hooks feature', ok: !hooksFeatureDisabled, detail: hooksFeatureDisabled ? `${shortPath(paths.codexConfig, env)} sets [features].hooks = false` : 'enabled or default', fatal: true },
    { name: 'Claude handoff skill', ok: isLinkTo(paths.claudeSkill, paths.handoffSkillSource), detail: shortPath(paths.claudeSkill, env), fatal: true },
    { name: 'Codex rig-from-claude adapter', ok: isLinkTo(paths.codexSkill, paths.rigFromClaudeSkillSource), detail: shortPath(paths.codexSkill, env), fatal: true },
    { name: 'Codex handoff skill', ok: isLinkTo(paths.codexHandoffSkill, paths.handoffSkillSource), detail: shortPath(paths.codexHandoffSkill, env), fatal: true },
    { name: 'Claude rig-from-codex adapter', ok: isLinkTo(paths.claudeFromCodexSkill, paths.rigFromCodexSkillSource), detail: shortPath(paths.claudeFromCodexSkill, env), fatal: true },
    { name: 'UserPromptExpansion hook', ok: hasInstalledHook(paths.claudeSettings, 'UserPromptExpansion'), detail: shortPath(paths.claudeSettings, env), fatal: true },
    { name: 'StopFailure hook', ok: hasInstalledHook(paths.claudeSettings, 'StopFailure'), detail: shortPath(paths.claudeSettings, env), fatal: false },
    { name: 'Claude handoff invocation', ok: hasUserOnlyHandoffSkill(paths.claudeSettings), detail: 'skillOverrides.handoff = user-invocable-only', fatal: true },
    { name: 'Codex UserPromptSubmit hook', ok: hasInstalledCodexHook(paths.codexHooks), detail: `${shortPath(paths.codexHooks, env)} — configured`, fatal: true },
    { name: 'Codex hook trust', ok: false, detail: 'trust state is not exposed to Rig; confirm once with /hooks', fatal: false },
    { name: 'Claude transcript', ok: !!latest, detail: latest ? shortPath(latest, env) : 'no JSONL transcript yet', fatal: false },
    { name: 'Codex transcript', ok: !!latestCodex && fs.existsSync(latestCodex), detail: latestCodex ? `${shortPath(latestCodex, env)}${fs.existsSync(latestCodex) ? '' : ' — waiting for first JSONL flush'}` : 'no root Codex rollout found', fatal: false },
    { name: 'Codex latest pointer', ok: !!codexPointer, detail: codexPointer ? shortPath(codexPointer.transcriptPath, env) : 'created by the next $handoff trigger', fatal: false },
  ];
}

export default function doctorHandoffCli(options: DoctorOptions = {}): void {
  const checks = inspectHandoffInstallation(options);
  if (options.json) {
    process.stdout.write(JSON.stringify({ ok: checks.every(c => c.ok || !c.fatal), checks }, null, 2) + '\n');
  } else {
    for (const check of checks) {
      if (check.ok) print.succeed(`${check.name}: ${check.detail}`);
      else if (check.fatal) print.error(`${check.name}: ${check.detail}`);
      else print.warn(`${check.name}: ${check.detail}`);
    }
  }
  if (checks.some(check => check.fatal && !check.ok)) process.exitCode = 1;
}

function isLinkTo(target: string, source: string): boolean {
  try {
    if (!fs.lstatSync(target).isSymbolicLink()) return false;
    return path.resolve(path.dirname(target), fs.readlinkSync(target)) === path.resolve(source);
  } catch { return false; }
}
