import fs from 'fs';
import os from 'os';
import path from 'path';
import { setup, resolveAgents } from './index';

describe('Rig npx setup', () => {
  let home: string;
  let packageRoot: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-setup-home-'));
    packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-setup-package-'));
    env = {
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
      RIG_HOME: path.join(home, '.rig'),
    };
    fs.mkdirSync(path.join(packageRoot, 'skills', 'rig', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'rigjs', version: '9.8.7' }));
    fs.writeFileSync(path.join(packageRoot, 'skills', 'rig', 'SKILL.md'), '---\nname: rig\ndescription: Test.\n---\n');
    fs.writeFileSync(path.join(packageRoot, 'skills', 'rig', 'agents', 'openai.yaml'), 'interface: {}\n');
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  });

  test('installs the CLI package and a managed skill for explicit agents', () => {
    const calls: Array<[string, string[]]> = [];
    const result = setup({ agents: 'codex,claude-code' }, {
      env,
      platform: 'darwin',
      packageRoot,
      run: (command, args) => {
        calls.push([command, args]);
        const bin = path.join(env.RIG_HOME as string, 'npm', 'bin');
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(path.join(bin, 'rig'), '#!/bin/sh\n');
        fs.writeFileSync(path.join(bin, 'rigjs'), '#!/bin/sh\n');
        return { status: 0 } as any;
      },
    });

    expect(calls).toEqual([['npm', ['install', '--global', '--prefix', path.join(env.RIG_HOME as string, 'npm'), 'rigjs@9.8.7']]]);
    expect(result.agents).toEqual(['codex', 'claude-code']);
    expect(fs.realpathSync(result.cliPath as string)).toBe(fs.realpathSync(path.join(env.RIG_HOME as string, 'npm', 'bin', 'rig')));
    expect(fs.readFileSync(path.join(home, '.zprofile'), 'utf8')).toContain("export PATH='");
    for (const target of result.skillPaths) {
      expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toContain('name: rig');
      expect(JSON.parse(fs.readFileSync(path.join(target, '.rigjs-managed.json'), 'utf8')).version).toBe('9.8.7');
    }
  });

  test('updates its own managed skill but preserves an unowned skill without force', () => {
    const target = path.join(env.CODEX_HOME as string, 'skills', 'rig');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'KEEP.md'), 'user-owned');

    expect(() => setup({ agents: 'codex', cli: false }, {
      env,
      platform: 'darwin',
      packageRoot,
    })).toThrow('not managed by rigjs');
    expect(fs.readFileSync(path.join(target, 'KEEP.md'), 'utf8')).toBe('user-owned');

    setup({ agents: 'codex', cli: false, force: true }, {
      env,
      platform: 'darwin',
      packageRoot,
    });
    expect(fs.existsSync(path.join(target, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'KEEP.md'))).toBe(false);
    const backups = fs.readdirSync(path.join(env.RIG_HOME as string, 'backups', 'setup'));
    expect(backups).toHaveLength(1);
  });

  test('auto-detects existing agent homes and supports aliases', () => {
    fs.mkdirSync(env.CODEX_HOME as string, { recursive: true });
    expect(resolveAgents('auto', env)).toEqual(['codex']);
    expect(resolveAgents('claude,codex', env)).toEqual(['claude-code', 'codex']);
    expect(() => resolveAgents('cursor', env)).toThrow('unsupported agent');
  });

  test('dry-run makes no filesystem or npm changes', () => {
    const run = jest.fn();
    const result = setup({ agents: 'all', dryRun: true }, {
      env,
      platform: 'darwin',
      packageRoot,
      run,
    });
    expect(run).not.toHaveBeenCalled();
    expect(result.cliInstalled).toBe(false);
    expect(result.cliRequested).toBe(true);
    expect(result.skillPaths.every(target => !fs.existsSync(target))).toBe(true);
  });
});
