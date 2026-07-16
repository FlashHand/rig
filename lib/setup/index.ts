import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import print from '../print';
import { findRigRoot, shortPath } from '../handoff/paths';

type AgentName = 'codex' | 'claude-code';

export interface SetupOptions {
  agents?: string;
  cli?: boolean;
  path?: boolean;
  force?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

export interface SetupDependencies {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  packageRoot?: string;
  run?: (command: string, args: string[]) => SpawnSyncReturns<Buffer>;
}

export interface SetupResult {
  version: string;
  cliRequested: boolean;
  cliInstalled: boolean;
  cliPath?: string;
  profilePath?: string;
  profileUpdated: boolean;
  agents: AgentName[];
  skillPaths: string[];
  dryRun: boolean;
}

const MANAGED_FILE = '.rigjs-managed.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSetupCommands(program: any): void {
  program.command('setup')
    .description('install the Rig CLI and global Rig skill for Codex and/or Claude Code')
    .option('-a, --agents <names>', 'comma-separated: auto, codex, claude-code, or all (default: auto)')
    .option('--no-cli', 'install the agent skill without installing the global Rig CLI')
    .option('--no-path', 'do not add Rig\'s user bin directory to ~/.zprofile')
    .option('-f, --force', 'back up and replace an existing non-Rig skill directory')
    .option('--dry-run', 'show what would be installed without changing files')
    .option('--json', 'machine-readable result')
    .action(setupCli);
}

export function setup(options: SetupOptions = {}, deps: SetupDependencies = {}): SetupResult {
  const env = deps.env || process.env;
  const platform = deps.platform || process.platform;
  if (platform !== 'darwin') throw new Error('Rig setup currently supports macOS only.');

  const packageRoot = deps.packageRoot || findRigRoot() || '';
  if (!packageRoot) throw new Error('could not locate the rigjs package.');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const version = String(pkg.version || '');
  if (!version) throw new Error('rigjs package version is missing.');

  const agents = resolveAgents(options.agents, env);
  const skillSource = path.join(packageRoot, 'skills', 'rig');
  validateSkillSource(skillSource);
  const skillPaths = agents.map(agent => skillTarget(agent, env));
  for (const target of skillPaths) preflightManagedSkill(target, Boolean(options.force));

  const cliRequested = options.cli !== false;
  const home = env.HOME || os.homedir();
  const rigHome = env.RIG_HOME || path.join(home, '.rig');
  const npmPrefix = env.RIG_NPM_PREFIX || path.join(rigHome, 'npm');
  const cliPath = path.join(rigHome, 'bin', 'rig');
  const profilePath = env.RIG_SHELL_PROFILE || path.join(home, '.zprofile');
  let profileUpdated = false;
  if (cliRequested) preflightCliLaunchers(npmPrefix, rigHome, Boolean(options.force));
  if (cliRequested && !options.dryRun) {
    const run = deps.run || ((command: string, args: string[]) => spawnSync(command, args, {
      stdio: 'inherit',
      env: { ...env, RIG_NO_AUTO_SKILL: '1' },
    }));
    const installed = run('npm', ['install', '--global', '--prefix', npmPrefix, `rigjs@${version}`]);
    if (installed.error) throw installed.error;
    if (installed.status !== 0) {
      const error = new Error(
        `npm could not install the user-wide Rig CLI (exit ${installed.status}).`,
      ) as Error & { exitCode?: number };
      error.exitCode = installed.status || 1;
      throw error;
    }
    installCliLaunchers(npmPrefix, rigHome, Boolean(options.force));
    if (options.path !== false) profileUpdated = ensureShellPath(profilePath, path.join(rigHome, 'bin'));
  }

  if (!options.dryRun) {
    for (const target of skillPaths) installManagedSkill(skillSource, target, version, Boolean(options.force), env);
  }

  return {
    version,
    cliRequested,
    cliInstalled: cliRequested && !options.dryRun,
    cliPath: cliRequested ? cliPath : undefined,
    profilePath: cliRequested && options.path !== false ? profilePath : undefined,
    profileUpdated,
    agents,
    skillPaths,
    dryRun: Boolean(options.dryRun),
  };
}

export function setupCli(options: SetupOptions = {}): void {
  try {
    const result = setup(options);
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    const verb = result.dryRun ? 'would install' : 'installed';
    if (result.cliRequested) print.succeed(`${verb} Rig CLI ${result.version} -> ${shortPath(result.cliPath || 'rig')}`);
    for (let i = 0; i < result.agents.length; i++) {
      print.succeed(`${verb} Rig skill for ${result.agents[i]} -> ${shortPath(result.skillPaths[i])}`);
    }
    print.info(result.dryRun
      ? 'dry run only; no files were changed'
      : 'open a new terminal and start a new agent task so PATH and the Rig skill are reloaded');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

export function resolveAgents(value: string | undefined, env: NodeJS.ProcessEnv = process.env): AgentName[] {
  const requested = (value || 'auto').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (requested.includes('all')) return ['codex', 'claude-code'];
  if (requested.includes('auto')) {
    if (requested.length !== 1) throw new Error('auto cannot be combined with explicit agent names.');
    const detected: AgentName[] = [];
    const home = env.HOME || os.homedir();
    const codexHome = env.CODEX_HOME || path.join(home, '.codex');
    const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
    if (fs.existsSync(codexHome)) detected.push('codex');
    if (fs.existsSync(claudeHome)) detected.push('claude-code');
    return detected.length ? detected : ['codex', 'claude-code'];
  }

  const aliases: Record<string, AgentName> = {
    codex: 'codex',
    claude: 'claude-code',
    'claude-code': 'claude-code',
  };
  const agents: AgentName[] = [];
  for (const name of requested) {
    const agent = aliases[name];
    if (!agent) throw new Error(`unsupported agent: ${name}. Use codex, claude-code, all, or auto.`);
    if (!agents.includes(agent)) agents.push(agent);
  }
  if (!agents.length) throw new Error('at least one agent is required.');
  return agents;
}

function skillTarget(agent: AgentName, env: NodeJS.ProcessEnv): string {
  const home = env.HOME || os.homedir();
  const root = agent === 'codex'
    ? (env.CODEX_HOME || path.join(home, '.codex'))
    : (env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'));
  return path.join(root, 'skills', 'rig');
}

function validateSkillSource(source: string): void {
  const skill = path.join(source, 'SKILL.md');
  const metadata = path.join(source, 'agents', 'openai.yaml');
  if (!fs.existsSync(skill)) throw new Error(`bundled Rig skill is missing: ${skill}`);
  if (!fs.existsSync(metadata)) throw new Error(`bundled Rig skill metadata is missing: ${metadata}`);
}

function preflightCliLaunchers(npmPrefix: string, rigHome: string, force: boolean): void {
  for (const name of ['rig', 'rigjs']) {
    const source = path.join(npmPrefix, 'bin', name);
    const target = path.join(rigHome, 'bin', name);
    if (!fs.existsSync(target) && !isSymlink(target)) continue;
    let owned = false;
    try {
      const linked = fs.readlinkSync(target);
      owned = path.resolve(path.dirname(target), linked) === source;
    } catch { /* regular file is not owned */ }
    if (!owned && !force) throw new Error(`${target} already exists. Re-run with --force to replace it.`);
  }
}

function installCliLaunchers(npmPrefix: string, rigHome: string, force: boolean): void {
  const sourceDir = path.join(npmPrefix, 'bin');
  const targetDir = path.join(rigHome, 'bin');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of ['rig', 'rigjs']) {
    const source = path.join(sourceDir, name);
    const target = path.join(targetDir, name);
    if (!fs.existsSync(source)) throw new Error(`npm installed rigjs but its ${name} launcher is missing: ${source}`);
    if (fs.existsSync(target) || isSymlink(target)) {
      let owned = false;
      try { owned = fs.realpathSync(target) === fs.realpathSync(source); } catch { /* conflict */ }
      if (!owned && !force) throw new Error(`${target} already exists. Re-run with --force to replace it.`);
      if (owned) fs.rmSync(target, { force: true });
      else backupExisting(target, rigHome);
    }
    fs.symlinkSync(source, target);
  }
}

function ensureShellPath(profilePath: string, binDir: string): boolean {
  const markerStart = '# >>> rigjs setup >>>';
  const markerEnd = '# <<< rigjs setup <<<';
  const escaped = binDir.replace(/'/g, `'\\''`);
  const block = `${markerStart}\nexport PATH='${escaped}':"$PATH"\n${markerEnd}`;
  let source = '';
  try { source = fs.readFileSync(profilePath, 'utf8'); } catch { /* create it */ }
  const start = source.indexOf(markerStart);
  const end = start >= 0 ? source.indexOf(markerEnd, start) : -1;
  let updated: string;
  if (start >= 0 && end >= 0) {
    updated = source.slice(0, start) + block + source.slice(end + markerEnd.length);
  } else {
    updated = source.replace(/\s*$/, '') + (source.trim() ? '\n\n' : '') + block + '\n';
  }
  if (updated === source) return false;
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, updated, 'utf8');
  return true;
}

function preflightManagedSkill(target: string, force: boolean): void {
  if (!fs.existsSync(target) && !isSymlink(target)) return;
  const managed = fs.existsSync(path.join(target, MANAGED_FILE));
  if (!managed && !force) {
    throw new Error(`${target} already exists and is not managed by rigjs. Re-run with --force to back it up.`);
  }
}

function installManagedSkill(
  source: string,
  target: string,
  version: string,
  force: boolean,
  env: NodeJS.ProcessEnv,
): void {
  if (fs.existsSync(target) || isSymlink(target)) {
    const managed = fs.existsSync(path.join(target, MANAGED_FILE));
    if (!managed && !force) throw new Error(`${target} is no longer safe to replace.`);
    if (!managed) backupSkill(target, env);
    fs.rmSync(target, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, dereference: true });
  fs.writeFileSync(path.join(target, MANAGED_FILE), JSON.stringify({
    package: 'rigjs',
    skill: 'rig',
    version,
  }, null, 2) + '\n', { mode: 0o600 });
}

function backupSkill(target: string, env: NodeJS.ProcessEnv): string {
  const home = env.HOME || os.homedir();
  const backupRoot = env.RIG_HOME || path.join(home, '.rig');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const agent = path.basename(path.dirname(path.dirname(target)));
  const backup = path.join(backupRoot, 'backups', 'setup', `${stamp}-${agent}-rig`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.renameSync(target, backup);
  return backup;
}

function backupExisting(target: string, rigHome: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(rigHome, 'backups', 'setup', `${stamp}-${path.basename(target)}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.renameSync(target, backup);
  return backup;
}

function isSymlink(value: string): boolean {
  try { return fs.lstatSync(value).isSymbolicLink(); }
  catch { return false; }
}
