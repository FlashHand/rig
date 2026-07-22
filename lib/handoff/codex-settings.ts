import fs from 'fs';
import path from 'path';
import { uniqueBackupPath } from './settings';

type JsonObject = Record<string, any>;

export interface CodexHooksMutation {
  changed: boolean;
  backupPath?: string;
}

// Codex ignores matchers for UserPromptSubmit. Keep a stable marker on Rig's
// group so install/uninstall never claims another tool's lookalike command.
export const CODEX_HANDOFF_OWNER = 'rigjs:handoff:v1';
const LEGACY_CODEX_HANDOFF_STATUS = 'Preparing Claude handoff…';

export function buildCodexHookCommand(executable: string): string {
  return `${shellQuote(path.resolve(executable))} handoff from-codex hook`;
}

export function installCodexHooks(hooksPath: string, backupDir: string, command: string): CodexHooksMutation {
  const config = readCodexHooks(hooksPath);
  const before = stableJson(config);
  stripOwnedCodexHooks(config);
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) config.hooks = {};
  if (!Array.isArray(config.hooks.UserPromptSubmit)) config.hooks.UserPromptSubmit = [];
  config.hooks.UserPromptSubmit.push({
    matcher: CODEX_HANDOFF_OWNER,
    hooks: [{
      type: 'command',
      command,
      timeout: 5,
    }],
  });
  if (before === stableJson(config)) return { changed: false };
  const backupPath = writeCodexHooks(hooksPath, backupDir, config);
  return { changed: true, backupPath };
}

export function uninstallCodexHooks(hooksPath: string, backupDir: string): CodexHooksMutation {
  if (!fs.existsSync(hooksPath)) return { changed: false };
  const config = readCodexHooks(hooksPath);
  const before = stableJson(config);
  stripOwnedCodexHooks(config);
  if (before === stableJson(config)) return { changed: false };
  const backupPath = writeCodexHooks(hooksPath, backupDir, config);
  return { changed: true, backupPath };
}

export function hasInstalledCodexHook(hooksPath: string): boolean {
  if (!fs.existsSync(hooksPath)) return false;
  const config = readCodexHooks(hooksPath);
  const groups = config.hooks && config.hooks.UserPromptSubmit;
  if (!Array.isArray(groups)) return false;
  return groups.some((group: any) => isOwnedCodexGroup(group)
    && group.hooks.some(isOwnedCodexHandler));
}

export function readCodexHooks(hooksPath: string): JsonObject {
  if (!fs.existsSync(hooksPath)) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(hooksPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Codex hooks symlink is dangling: ${hooksPath}`);
    return {};
  }
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8')); }
  catch (error) {
    throw new Error(`cannot parse Codex hooks ${hooksPath}: ${error instanceof Error ? error.message : error}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Codex hooks must contain a JSON object: ${hooksPath}`);
  }
  const config = parsed as JsonObject;
  if (config.hooks != null && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) {
    throw new Error(`Codex hooks.hooks must contain a JSON object: ${hooksPath}`);
  }
  if (config.hooks && config.hooks.UserPromptSubmit != null
    && !Array.isArray(config.hooks.UserPromptSubmit)) {
    throw new Error(`Codex hooks.UserPromptSubmit must contain an array: ${hooksPath}`);
  }
  return config;
}

export function isCodexHooksFeatureDisabled(configPath: string): boolean {
  let content: string;
  try { content = fs.readFileSync(configPath, 'utf8'); } catch { return false; }
  const match = content.match(/(?:^|\n)\s*\[features\]\s*\n([\s\S]*?)(?=\n\s*\[|$)/);
  return !!match && /^\s*hooks\s*=\s*false\s*(?:#.*)?$/m.test(match[1]);
}

function stripOwnedCodexHooks(config: JsonObject): void {
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) return;
  const groups = config.hooks.UserPromptSubmit;
  if (!Array.isArray(groups)) return;
  const nextGroups: any[] = [];
  for (const group of groups) {
    const currentOwned = isOwnedCodexGroup(group);
    const legacyOwned = isLegacyOwnedCodexGroup(group);
    if (!currentOwned && !legacyOwned) {
      nextGroups.push(group);
      continue;
    }
    const hooks = group.hooks.filter((handler: any) => currentOwned
      ? !isOwnedCodexHandler(handler)
      : !isLegacyOwnedCodexHandler(handler));
    if (hooks.length > 0) nextGroups.push({ ...group, hooks });
  }
  if (nextGroups.length > 0) config.hooks.UserPromptSubmit = nextGroups;
  else delete config.hooks.UserPromptSubmit;
  if (Object.keys(config.hooks).length === 0) delete config.hooks;
}

function isOwnedCodexGroup(group: any): boolean {
  return !!group
    && typeof group === 'object'
    && group.matcher === CODEX_HANDOFF_OWNER
    && Array.isArray(group.hooks);
}

function isOwnedCodexHandler(handler: any): boolean {
  return !!handler
    && handler.type === 'command'
    && typeof handler.command === 'string'
    && /(?:^|\s)handoff\s+from-codex\s+hook(?:\s|$)/.test(handler.command);
}

function isLegacyOwnedCodexGroup(group: any): boolean {
  return !!group
    && typeof group === 'object'
    && group.matcher == null
    && Array.isArray(group.hooks)
    && group.hooks.some(isLegacyOwnedCodexHandler);
}

function isLegacyOwnedCodexHandler(handler: any): boolean {
  return isOwnedCodexHandler(handler)
    && handler.statusMessage === LEGACY_CODEX_HANDOFF_STATUS;
}

function writeCodexHooks(hooksPath: string, backupDir: string, config: JsonObject): string | undefined {
  const writePath = resolveWritePath(hooksPath);
  fs.mkdirSync(path.dirname(writePath), { recursive: true });
  let backupPath: string | undefined;
  let mode = 0o600;
  if (fs.existsSync(writePath)) {
    mode = fs.statSync(writePath).mode & 0o777;
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = uniqueBackupPath(backupDir, 'codex-hooks', '.json');
    fs.copyFileSync(writePath, backupPath);
    fs.chmodSync(backupPath, 0o600);
  }
  const temp = `${writePath}.rig-handoff-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, stableJson(config), { mode });
    fs.renameSync(temp, writePath);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  return backupPath;
}

function resolveWritePath(value: string): string {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(value); } catch { return value; }
  if (!stat.isSymbolicLink()) return value;
  try { return fs.realpathSync(value); }
  catch { throw new Error(`Codex hooks symlink is dangling: ${value}`); }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function stableJson(value: JsonObject): string {
  return JSON.stringify(value, null, 2) + '\n';
}
