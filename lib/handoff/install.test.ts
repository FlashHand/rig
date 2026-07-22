import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { installHandoff } from './install';
import { uninstallHandoff } from './uninstall';
import { hasInstalledHook } from './settings';
import { CODEX_HANDOFF_OWNER, hasInstalledCodexHook } from './codex-settings';
import { writeCodexLatestPointer } from './codex-pointer';
import { resolveHandoffPaths } from './paths';

describe('handoff installation', () => {
  let home: string;
  let env: NodeJS.ProcessEnv;
  const rigRoot = path.resolve(__dirname, '../..');

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-handoff-install-'));
    env = {
      HOME: home,
      RIG_HANDOFF_RIG_ROOT: rigRoot,
      RIG_HANDOFF_CLAUDE_DIR: path.join(home, '.claude'),
      RIG_HANDOFF_CODEX_HOME: path.join(home, '.codex'),
      RIG_HANDOFF_BACKUP_DIR: path.join(home, '.rig', 'backups', 'handoff'),
    };
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
      hooks: {
        Notification: [{ matcher: 'idle_prompt', hooks: [{ type: 'command', command: '/bin/true', args: [] }] }],
        UserPromptExpansion: [{ matcher: '^other$', hooks: [{
          type: 'command',
          command: '/usr/local/bin/not-rig',
          args: ['handoff', 'hook'],
          statusMessage: 'Other tool handoff',
        }] }],
      },
      theme: 'dark',
    }, null, 2));
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(home, '.codex', 'hooks.json'), JSON.stringify({
      description: 'user hooks',
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: '/bin/true' }] }],
        UserPromptSubmit: [{ hooks: [{
          type: 'command',
          command: "'/Applications/Bitterless/bin/session-hook'",
          timeout: 2,
        }] }],
      },
    }, null, 2));
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test('installs one shared sender plus two receiver adapters across four locations and merges both hook files idempotently', () => {
    const first = installHandoff({ platform: 'darwin', env });
    expect(first.claudeSkillChanged).toBe(true);
    expect(first.codexSkillChanged).toBe(true);
    expect(first.codexHandoffSkillChanged).toBe(true);
    expect(first.claudeFromCodexSkillChanged).toBe(true);
    expect(first.launcherChanged).toBe(true);
    expect(first.settingsChanged).toBe(true);
    expect(fs.lstatSync(first.paths.claudeSkill).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(first.paths.codexSkill).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(first.paths.codexHandoffSkill).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(first.paths.claudeFromCodexSkill).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(first.paths.handoffExecutable).isFile()).toBe(true);
    expect(fs.readFileSync(first.paths.handoffExecutable, 'utf8')).toContain(process.execPath);
    const launcher = spawnSync(first.paths.handoffExecutable, ['--version'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    expect(launcher.status).toBe(0);
    expect(launcher.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(hasInstalledHook(first.paths.claudeSettings, 'UserPromptExpansion')).toBe(true);
    expect(hasInstalledHook(first.paths.claudeSettings, 'StopFailure')).toBe(true);
    expect(hasInstalledCodexHook(first.paths.codexHooks)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(first.paths.claudeSettings, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.Notification).toHaveLength(1);
    expect(settings.hooks.UserPromptExpansion).toHaveLength(2);
    expect(settings.hooks.UserPromptExpansion[1].matcher).toBe('^handoff$');
    expect(settings.hooks.UserPromptExpansion[1].hooks[0].command).toBe(first.paths.handoffExecutable);
    expect(settings.skillOverrides.handoff).toBe('user-invocable-only');
    expect(fs.existsSync(first.paths.claudeSkillOverrideState)).toBe(true);
    expect(first.settingsBackup && fs.existsSync(first.settingsBackup)).toBe(true);

    const codexHooks = JSON.parse(fs.readFileSync(first.paths.codexHooks, 'utf8'));
    expect(codexHooks.description).toBe('user hooks');
    expect(codexHooks.hooks.Stop).toHaveLength(1);
    expect(codexHooks.hooks.UserPromptSubmit).toHaveLength(2);
    expect(codexHooks.hooks.UserPromptSubmit[1].matcher).toBe(CODEX_HANDOFF_OWNER);
    expect(codexHooks.hooks.UserPromptSubmit[1].hooks[0].command).toContain('handoff from-codex hook');
    expect(first.codexHooksBackup && fs.existsSync(first.codexHooksBackup)).toBe(true);

    const second = installHandoff({ platform: 'darwin', env });
    expect(second.claudeSkillChanged).toBe(false);
    expect(second.codexSkillChanged).toBe(false);
    expect(second.codexHandoffSkillChanged).toBe(false);
    expect(second.claudeFromCodexSkillChanged).toBe(false);
    expect(second.launcherChanged).toBe(false);
    expect(second.settingsChanged).toBe(false);
    expect(second.codexHooksChanged).toBe(false);
  });

  test('uninstall removes only owned symlinks and hooks', () => {
    const installed = installHandoff({
      platform: 'darwin',
      env,
    });
    writeCodexLatestPointer(installed.paths.codexLatestPointer, {
      schemaVersion: 1,
      sessionId: 'owned-session',
      transcriptPath: path.join(home, '.codex', 'sessions', 'owned.jsonl'),
      cwd: home,
      updatedAt: '2026-07-20T00:00:00Z',
    });
    const result = uninstallHandoff({ platform: 'darwin', env });
    expect(result.removed).toHaveLength(6);
    expect(fs.existsSync(installed.paths.claudeSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.codexSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.codexHandoffSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.claudeFromCodexSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.handoffExecutable)).toBe(false);
    expect(fs.existsSync(installed.paths.codexLatestPointer)).toBe(false);
    const settings = JSON.parse(fs.readFileSync(installed.paths.claudeSettings, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.Notification).toHaveLength(1);
    expect(settings.hooks.UserPromptExpansion).toEqual([expect.objectContaining({ matcher: '^other$' })]);
    expect(settings.hooks.StopFailure).toBeUndefined();
    expect(settings.skillOverrides).toBeUndefined();
    expect(fs.existsSync(installed.paths.claudeSkillOverrideState)).toBe(false);
    const codexHooks = JSON.parse(fs.readFileSync(installed.paths.codexHooks, 'utf8'));
    expect(codexHooks.description).toBe('user hooks');
    expect(codexHooks.hooks.Stop).toHaveLength(1);
    expect(codexHooks.hooks.UserPromptSubmit).toHaveLength(1);
    expect(codexHooks.hooks.UserPromptSubmit[0].hooks[0].command).toContain('Bitterless');
  });

  test('can omit the emergency StopFailure hook', () => {
    const result = installHandoff({
      platform: 'darwin',
      env,
      stopFailure: false,
    });
    expect(hasInstalledHook(result.paths.claudeSettings, 'UserPromptExpansion')).toBe(true);
    expect(hasInstalledHook(result.paths.claudeSettings, 'StopFailure')).toBe(false);
  });

  test('restores a pre-existing Claude handoff skill visibility on uninstall', () => {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ skillOverrides: { handoff: 'off', other: 'on' } }, null, 2));
    const installed = installHandoff({ platform: 'darwin', env });
    expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).skillOverrides.handoff)
      .toBe('user-invocable-only');

    uninstallHandoff({ platform: 'darwin', env });

    expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).skillOverrides)
      .toEqual({ handoff: 'off', other: 'on' });
    expect(fs.existsSync(installed.paths.claudeSkillOverrideState)).toBe(false);
  });

  test('keeps Claude skill override restoration state separate per profile', () => {
    const first = resolveHandoffPaths({ ...env, RIG_HANDOFF_CLAUDE_DIR: path.join(home, '.claude-a') });
    const second = resolveHandoffPaths({ ...env, RIG_HANDOFF_CLAUDE_DIR: path.join(home, '.claude-b') });
    expect(first.claudeSkillOverrideState).not.toBe(second.claudeSkillOverrideState);
  });

  test('preserves a symlinked Claude settings file', () => {
    const dotfiles = path.join(home, 'dotfiles');
    const target = path.join(dotfiles, 'claude-settings.json');
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(dotfiles, { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ theme: 'dark' }, null, 2));
    fs.rmSync(settingsPath, { force: true });
    fs.symlinkSync(target, settingsPath);

    installHandoff({ platform: 'darwin', env });

    expect(fs.lstatSync(settingsPath).isSymbolicLink()).toBe(true);
    const settings = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.UserPromptExpansion).toHaveLength(1);
  });

  test('preflights conflicts before creating any handoff links', () => {
    const codexSkill = path.join(home, '.codex', 'skills', 'rig-from-claude');
    fs.mkdirSync(codexSkill, { recursive: true });
    fs.writeFileSync(path.join(codexSkill, 'KEEP.md'), 'user-owned');

    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('already exists');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
    expect(fs.readFileSync(path.join(codexSkill, 'KEEP.md'), 'utf8')).toBe('user-owned');
  });

  test('migrates only the installer-owned legacy from-claude link', () => {
    const legacyTarget = path.join(home, '.codex', 'skills', 'from-claude');
    const legacySource = path.join(rigRoot, 'skills', 'from-claude');
    fs.mkdirSync(path.dirname(legacyTarget), { recursive: true });
    fs.symlinkSync(legacySource, legacyTarget, 'dir');

    const result = installHandoff({ platform: 'darwin', env });

    expect(result.legacyCodexSkillRemoved).toBe(true);
    expect(() => fs.lstatSync(legacyTarget)).toThrow();
    expect(fs.lstatSync(result.paths.codexSkill).isSymbolicLink()).toBe(true);
  });

  test('preserves an unrelated legacy from-claude link', () => {
    const legacyTarget = path.join(home, '.codex', 'skills', 'from-claude');
    const unrelatedSource = path.join(home, 'other-skill');
    fs.mkdirSync(unrelatedSource, { recursive: true });
    fs.mkdirSync(path.dirname(legacyTarget), { recursive: true });
    fs.symlinkSync(unrelatedSource, legacyTarget, 'dir');

    const result = installHandoff({ platform: 'darwin', env });

    expect(result.legacyCodexSkillRemoved).toBe(false);
    expect(path.resolve(path.dirname(legacyTarget), fs.readlinkSync(legacyTarget))).toBe(unrelatedSource);
  });

  test('rejects a dangling settings symlink before creating links', () => {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.rmSync(settingsPath, { force: true });
    fs.symlinkSync(path.join(home, 'missing-settings.json'), settingsPath);

    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('symlink is dangling');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
  });

  test('rejects malformed Codex hooks before creating links', () => {
    fs.writeFileSync(path.join(home, '.codex', 'hooks.json'), '{bad');
    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('cannot parse Codex hooks');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
  });

  test('rejects a parseable but invalid Claude hook shape before creating links', () => {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
      hooks: { UserPromptExpansion: { matcher: '^keep$' } },
    }));
    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('UserPromptExpansion must contain an array');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
  });
});
