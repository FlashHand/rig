import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { installHandoff } from './install';
import { uninstallHandoff } from './uninstall';
import { hasInstalledHook } from './settings';

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
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test('installs both skills and merges hooks idempotently', () => {
    const first = installHandoff({ platform: 'darwin', env });
    expect(first.claudeSkillChanged).toBe(true);
    expect(first.codexSkillChanged).toBe(true);
    expect(first.launcherChanged).toBe(true);
    expect(first.settingsChanged).toBe(true);
    expect(fs.lstatSync(first.paths.claudeSkill).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(first.paths.codexSkill).isSymbolicLink()).toBe(true);
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

    const settings = JSON.parse(fs.readFileSync(first.paths.claudeSettings, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.Notification).toHaveLength(1);
    expect(settings.hooks.UserPromptExpansion).toHaveLength(2);
    expect(settings.hooks.UserPromptExpansion[1].matcher).toBe('^handoff$');
    expect(settings.hooks.UserPromptExpansion[1].hooks[0].command).toBe(first.paths.handoffExecutable);
    expect(first.settingsBackup && fs.existsSync(first.settingsBackup)).toBe(true);

    const second = installHandoff({ platform: 'darwin', env });
    expect(second.claudeSkillChanged).toBe(false);
    expect(second.codexSkillChanged).toBe(false);
    expect(second.launcherChanged).toBe(false);
    expect(second.settingsChanged).toBe(false);
  });

  test('uninstall removes only owned symlinks and hooks', () => {
    const installed = installHandoff({
      platform: 'darwin',
      env,
    });
    const result = uninstallHandoff({ platform: 'darwin', env });
    expect(result.removed).toHaveLength(3);
    expect(fs.existsSync(installed.paths.claudeSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.codexSkill)).toBe(false);
    expect(fs.existsSync(installed.paths.handoffExecutable)).toBe(false);
    const settings = JSON.parse(fs.readFileSync(installed.paths.claudeSettings, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.Notification).toHaveLength(1);
    expect(settings.hooks.UserPromptExpansion).toEqual([expect.objectContaining({ matcher: '^other$' })]);
    expect(settings.hooks.StopFailure).toBeUndefined();
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
    const codexSkill = path.join(home, '.codex', 'skills', 'from-claude');
    fs.mkdirSync(codexSkill, { recursive: true });
    fs.writeFileSync(path.join(codexSkill, 'KEEP.md'), 'user-owned');

    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('already exists');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
    expect(fs.readFileSync(path.join(codexSkill, 'KEEP.md'), 'utf8')).toBe('user-owned');
  });

  test('rejects a dangling settings symlink before creating links', () => {
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.rmSync(settingsPath, { force: true });
    fs.symlinkSync(path.join(home, 'missing-settings.json'), settingsPath);

    expect(() => installHandoff({ platform: 'darwin', env })).toThrow('symlink is dangling');
    expect(fs.existsSync(path.join(home, '.rig', 'bin', 'rig-handoff'))).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'handoff'))).toBe(false);
  });
});
