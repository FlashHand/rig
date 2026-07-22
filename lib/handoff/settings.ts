import fs from 'fs';
import path from 'path';

type JsonObject = Record<string, any>;

export interface HookInvocation {
  command: string;
  args: string[];
}

export interface SettingsMutation {
  changed: boolean;
  backupPath?: string;
}

const MANUAL_MATCHER = '^handoff$';
const FAILURE_MATCHER = '^(rate_limit|billing_error|max_output_tokens|authentication_failed|oauth_org_not_allowed)$';
const OWNED_STATUS_MESSAGE = 'Preparing Codex handoff…';
const HANDOFF_SKILL_VISIBILITY = 'user-invocable-only';

interface SkillOverrideState {
  schemaVersion: 1;
  skill: 'handoff';
  hadSkillOverrides: boolean;
  hadHandoff: boolean;
  previousValue?: unknown;
}

export function installHooks(
  settingsPath: string,
  backupDir: string,
  invocation: HookInvocation,
  includeStopFailure = true,
  overrideStatePath?: string,
): SettingsMutation {
  const settings = readSettings(settingsPath);
  const before = stableJson(settings);
  stripOwnedHooks(settings);
  addHook(settings, 'UserPromptExpansion', MANUAL_MATCHER, invocation);
  if (includeStopFailure) addHook(settings, 'StopFailure', FAILURE_MATCHER, invocation);
  const newOverrideState = overrideStatePath
    ? applyHandoffSkillOverride(settings, readSkillOverrideState(overrideStatePath))
    : null;
  const after = stableJson(settings);
  if (before === after) return { changed: false };
  if (newOverrideState && overrideStatePath) writeSkillOverrideState(overrideStatePath, newOverrideState);
  let backupPath: string | undefined;
  try { backupPath = writeSettings(settingsPath, backupDir, settings); }
  catch (error) {
    if (newOverrideState && overrideStatePath) fs.rmSync(overrideStatePath, { force: true });
    throw error;
  }
  return { changed: true, backupPath };
}

export function uninstallHooks(settingsPath: string, backupDir: string, overrideStatePath?: string): SettingsMutation {
  if (!fs.existsSync(settingsPath)) {
    if (overrideStatePath) fs.rmSync(overrideStatePath, { force: true });
    return { changed: false };
  }
  const settings = readSettings(settingsPath);
  const before = stableJson(settings);
  stripOwnedHooks(settings);
  const overrideState = overrideStatePath ? readSkillOverrideState(overrideStatePath) : null;
  if (overrideState) restoreHandoffSkillOverride(settings, overrideState);
  const after = stableJson(settings);
  if (before === after) {
    if (overrideStatePath) fs.rmSync(overrideStatePath, { force: true });
    return { changed: false };
  }
  const backupPath = writeSettings(settingsPath, backupDir, settings);
  if (overrideStatePath) fs.rmSync(overrideStatePath, { force: true });
  return { changed: true, backupPath };
}

export function hasInstalledHook(settingsPath: string, event: 'UserPromptExpansion' | 'StopFailure'): boolean {
  if (!fs.existsSync(settingsPath)) return false;
  const settings = readSettings(settingsPath);
  const groups = settings.hooks && settings.hooks[event];
  if (!Array.isArray(groups)) return false;
  return groups.some((group: any) => Array.isArray(group && group.hooks) && group.hooks.some(isOwnedHandler));
}

export function hasUserOnlyHandoffSkill(settingsPath: string): boolean {
  if (!fs.existsSync(settingsPath)) return false;
  const settings = readSettings(settingsPath);
  return !!settings.skillOverrides
    && settings.skillOverrides.handoff === HANDOFF_SKILL_VISIBILITY;
}

export function readSettings(settingsPath: string): JsonObject {
  if (!fs.existsSync(settingsPath)) {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(settingsPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Claude settings symlink is dangling: ${settingsPath}`);
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot parse Claude settings ${settingsPath}: ${error instanceof Error ? error.message : error}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Claude settings must contain a JSON object: ${settingsPath}`);
  }
  const settings = parsed as JsonObject;
  validateOwnedSettingsShape(settings, settingsPath);
  return settings;
}

function addHook(settings: JsonObject, event: string, matcher: string, invocation: HookInvocation): void {
  if (!settings.hooks) settings.hooks = {};
  if (settings.hooks[event] == null) settings.hooks[event] = [];
  settings.hooks[event].push({
    matcher,
    hooks: [{
      type: 'command',
      command: invocation.command,
      args: invocation.args,
      timeout: 5,
      statusMessage: OWNED_STATUS_MESSAGE,
    }],
  });
}

function validateOwnedSettingsShape(settings: JsonObject, settingsPath: string): void {
  if (settings.hooks != null && (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks))) {
    throw new Error(`Claude hooks must contain a JSON object: ${settingsPath}`);
  }
  for (const event of ['UserPromptExpansion', 'StopFailure']) {
    if (settings.hooks && settings.hooks[event] != null && !Array.isArray(settings.hooks[event])) {
      throw new Error(`Claude hooks.${event} must contain an array: ${settingsPath}`);
    }
  }
  if (settings.skillOverrides != null
    && (typeof settings.skillOverrides !== 'object' || Array.isArray(settings.skillOverrides))) {
    throw new Error(`Claude skillOverrides must contain a JSON object: ${settingsPath}`);
  }
}

function applyHandoffSkillOverride(settings: JsonObject, existingState: SkillOverrideState | null): SkillOverrideState | null {
  const hadSkillOverrides = !!settings.skillOverrides;
  const overrides = settings.skillOverrides || {};
  const hadHandoff = Object.prototype.hasOwnProperty.call(overrides, 'handoff');
  const previousValue = overrides.handoff;
  if (previousValue === HANDOFF_SKILL_VISIBILITY) return null;
  if (!settings.skillOverrides) settings.skillOverrides = overrides;
  settings.skillOverrides.handoff = HANDOFF_SKILL_VISIBILITY;
  return existingState || {
    schemaVersion: 1,
    skill: 'handoff',
    hadSkillOverrides,
    hadHandoff,
    previousValue,
  };
}

function restoreHandoffSkillOverride(settings: JsonObject, state: SkillOverrideState): void {
  if (!settings.skillOverrides || settings.skillOverrides.handoff !== HANDOFF_SKILL_VISIBILITY) return;
  if (state.hadHandoff) settings.skillOverrides.handoff = state.previousValue;
  else delete settings.skillOverrides.handoff;
  if (!state.hadSkillOverrides && Object.keys(settings.skillOverrides).length === 0) delete settings.skillOverrides;
}

function readSkillOverrideState(statePath: string): SkillOverrideState | null {
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.schemaVersion !== 1 || state.skill !== 'handoff'
    || typeof state.hadSkillOverrides !== 'boolean' || typeof state.hadHandoff !== 'boolean') return null;
  return state as unknown as SkillOverrideState;
}

function writeSkillOverrideState(statePath: string, state: SkillOverrideState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, statePath);
    fs.chmodSync(statePath, 0o600);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

function stripOwnedHooks(settings: JsonObject): void {
  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) return;
  for (const event of ['UserPromptExpansion', 'StopFailure']) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    const nextGroups: any[] = [];
    for (const group of groups) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
        nextGroups.push(group);
        continue;
      }
      const nextHandlers = group.hooks.filter((handler: any) => !isOwnedHandler(handler));
      if (nextHandlers.length > 0) nextGroups.push({ ...group, hooks: nextHandlers });
    }
    if (nextGroups.length > 0) settings.hooks[event] = nextGroups;
    else delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}

function isOwnedHandler(handler: any): boolean {
  if (!handler || handler.type !== 'command') return false;
  if (handler.statusMessage !== OWNED_STATUS_MESSAGE || !Array.isArray(handler.args)) return false;
  const args = handler.args.map(String);
  return args.length === 2 && args[0] === 'handoff' && args[1] === 'hook';
}

function writeSettings(settingsPath: string, backupDir: string, settings: JsonObject): string | undefined {
  const writePath = resolveSettingsWritePath(settingsPath);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  let backupPath: string | undefined;
  let mode = 0o600;
  if (fs.existsSync(writePath)) {
    const stat = fs.statSync(writePath);
    mode = stat.mode & 0o777;
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = uniqueBackupPath(backupDir, 'claude-settings', '.json');
    fs.copyFileSync(writePath, backupPath);
    fs.chmodSync(backupPath, 0o600);
  }

  const temp = `${writePath}.rig-handoff-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, stableJson(settings), { mode });
    fs.renameSync(temp, writePath);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  return backupPath;
}

function resolveSettingsWritePath(settingsPath: string): string {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(settingsPath); } catch { return settingsPath; }
  if (!stat.isSymbolicLink()) return settingsPath;
  try { return fs.realpathSync(settingsPath); }
  catch { throw new Error(`Claude settings symlink is dangling: ${settingsPath}`); }
}

export function uniqueBackupPath(dir: string, prefix: string, suffix = ''): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let candidate = path.join(dir, `${prefix}-${stamp}${suffix}`);
  let n = 1;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${prefix}-${stamp}-${n++}${suffix}`);
  return candidate;
}

function stableJson(value: JsonObject): string {
  return JSON.stringify(value, null, 2) + '\n';
}
