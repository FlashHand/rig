import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildCodexHookCommand,
  CODEX_HANDOFF_OWNER,
  hasInstalledCodexHook,
  installCodexHooks,
  isCodexHooksFeatureDisabled,
  uninstallCodexHooks,
} from './codex-settings';

describe('Codex hooks settings', () => {
  let dir: string;
  let hooks: string;
  let backups: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-codex-settings-'));
    hooks = path.join(dir, '.codex', 'hooks.json');
    backups = path.join(dir, 'backups');
    fs.mkdirSync(path.dirname(hooks), { recursive: true });
    fs.writeFileSync(hooks, JSON.stringify({
      description: 'keep me',
      hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: '/bin/keep' }] }] },
    }, null, 2));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('merges, quotes, backs up, and uninstalls only the owned handler', () => {
    const command = buildCodexHookCommand(path.join(dir, "Rig's bin", 'rig-handoff'));
    expect(command).toContain("'\"'\"'");
    const first = installCodexHooks(hooks, backups, command);
    expect(first.changed).toBe(true);
    expect(first.backupPath && fs.existsSync(first.backupPath)).toBe(true);
    expect(hasInstalledCodexHook(hooks)).toBe(true);
    const installed = JSON.parse(fs.readFileSync(hooks, 'utf8'));
    expect(installed.description).toBe('keep me');
    expect(installed.hooks.UserPromptSubmit).toHaveLength(2);
    expect(installed.hooks.UserPromptSubmit[1].matcher).toBe(CODEX_HANDOFF_OWNER);

    expect(installCodexHooks(hooks, backups, command).changed).toBe(false);
    const removed = uninstallCodexHooks(hooks, backups);
    expect(removed.changed).toBe(true);
    const remaining = JSON.parse(fs.readFileSync(hooks, 'utf8'));
    expect(remaining.hooks.UserPromptSubmit).toHaveLength(1);
    expect(remaining.hooks.UserPromptSubmit[0].hooks[0].command).toBe('/bin/keep');
  });

  test('preserves an unmarked lookalike command owned by someone else', () => {
    const lookalike = "'/other/rig' handoff from-codex hook";
    fs.writeFileSync(hooks, JSON.stringify({
      hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: lookalike }] }] },
    }, null, 2));

    const command = buildCodexHookCommand(path.join(dir, 'rig-handoff'));
    installCodexHooks(hooks, backups, command);
    uninstallCodexHooks(hooks, backups);

    const remaining = JSON.parse(fs.readFileSync(hooks, 'utf8'));
    expect(remaining.hooks.UserPromptSubmit).toHaveLength(1);
    expect(remaining.hooks.UserPromptSubmit[0].hooks[0].command).toBe(lookalike);
    expect(hasInstalledCodexHook(hooks)).toBe(false);
  });

  test('migrates only the branded legacy Rig handler', () => {
    const legacy = "'/old/rig-handoff' handoff from-codex hook";
    const lookalike = "'/other/rig' handoff from-codex hook";
    fs.writeFileSync(hooks, JSON.stringify({
      hooks: { UserPromptSubmit: [{ hooks: [
        { type: 'command', command: legacy, timeout: 5, statusMessage: 'Preparing Claude handoff…' },
        { type: 'command', command: lookalike },
      ] }] },
    }, null, 2));

    installCodexHooks(hooks, backups, buildCodexHookCommand(path.join(dir, 'rig-handoff')));

    const installed = JSON.parse(fs.readFileSync(hooks, 'utf8'));
    expect(JSON.stringify(installed)).not.toContain(legacy);
    expect(JSON.stringify(installed)).toContain(lookalike);
    expect(installed.hooks.UserPromptSubmit).toEqual(expect.arrayContaining([
      expect.objectContaining({ matcher: CODEX_HANDOFF_OWNER }),
    ]));
  });

  test('detects only an explicit false hooks feature flag', () => {
    const config = path.join(dir, 'config.toml');
    fs.writeFileSync(config, '[features]\njs_repl = true\nhooks = false # disabled\n\n[other]\nhooks = true\n');
    expect(isCodexHooksFeatureDisabled(config)).toBe(true);
    fs.writeFileSync(config, '[features]\nhooks = true\n');
    expect(isCodexHooksFeatureDisabled(config)).toBe(false);
    expect(isCodexHooksFeatureDisabled(path.join(dir, 'missing.toml'))).toBe(false);
  });

  test('refuses to replace a present but invalid user hook shape', () => {
    fs.writeFileSync(hooks, JSON.stringify({ hooks: { UserPromptSubmit: { command: '/bin/keep' } } }));
    expect(() => installCodexHooks(hooks, backups, buildCodexHookCommand('/rig')))
      .toThrow('UserPromptSubmit must contain an array');
    expect(JSON.parse(fs.readFileSync(hooks, 'utf8')).hooks.UserPromptSubmit)
      .toEqual({ command: '/bin/keep' });
  });
});
