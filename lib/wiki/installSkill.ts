import fs from 'fs';
import path from 'path';
import os from 'os';
import print from '../print';
import { paths } from './paths';

const BUNDLED_SKILLS = [
  { name: 'rig-wiki', file: 'RIG_WIKI_SKILL.md' },
  { name: 'rig-crew', file: 'RIG_CREW_SKILL.md' },
];

/** Find rig's package root by walking up from built/ or lib/. */
function findRigRoot(): string | undefined {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (p.name === 'rigjs') return dir;
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

interface InstallOpts { force?: boolean; project?: boolean; }

/**
 * Install bundled skills (rig-wiki, rig-crew) as symlinks.
 *
 * Default (global): link into `~/.claude/skills/<name>/SKILL.md`. Affects
 * every project that uses Claude Code on this machine.
 *
 * `--project` (project-level override for overmind-style monorepos):
 * link into BOTH `<cwd>/.claude/skills/<name>/SKILL.md` (Claude Code) AND
 * `<cwd>/.agents/skills/<name>/SKILL.md` (Codex). When the user is inside
 * the project, the project-local skill files override the global ones.
 */
export default function wikiInstallSkill(opts: InstallOpts): void {
  const root = findRigRoot();
  if (!root) {
    print.error('could not locate the rigjs install root. Reinstall rigjs?');
    process.exit(1);
  }

  const targetRoots = resolveTargetRoots(opts);
  for (const tr of targetRoots) {
    if (!fs.existsSync(tr.parent)) {
      // Project-level install creates the dirs on demand (parent is <cwd>).
      // Global install requires the dir to already exist — that's how we
      // detect "Claude Code is installed on this machine".
      if (tr.kind === 'global') {
        print.error(`${tr.label} dir not found: ${tr.parent}`);
        print.info(`install ${tr.label} first, then re-run \`rig wiki install-skill\`.`);
        process.exit(1);
      }
    }

    for (const skill of BUNDLED_SKILLS) {
      const src = path.join(root, skill.file);
      if (!fs.existsSync(src)) {
        print.warn(`skipping ${skill.name}: ${skill.file} not found inside rigjs install`);
        continue;
      }
      linkSkill(skill.name, src, tr.parent, opts);
    }
  }

  if (opts.project) {
    print.info('project-local skills will override global ones when this project is the cwd.');
  } else {
    print.info('restart Claude Code to pick up new or updated skills.');
  }
}

interface TargetRoot {
  /** `<parent>/<skill-name>/SKILL.md` is the resulting symlink. */
  parent: string;
  kind: 'global' | 'project';
  label: string;
}

function resolveTargetRoots(opts: InstallOpts): TargetRoot[] {
  if (opts.project) {
    const cwd = process.cwd();
    return [
      { parent: path.join(cwd, '.claude', 'skills'), kind: 'project', label: 'Claude Code project skills' },
      { parent: path.join(cwd, '.agents', 'skills'), kind: 'project', label: 'Codex project skills' },
    ];
  }
  return [
    { parent: paths.claudeSkillsDir, kind: 'global', label: 'Claude Code skills' },
  ];
}

function linkSkill(name: string, src: string, parentDir: string, opts: InstallOpts): void {
  const targetDir = path.join(parentDir, name);
  const target = path.join(targetDir, 'SKILL.md');
  fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(target) || isBrokenSymlink(target)) {
    const existing = safeReadlink(target);
    if (existing === src) {
      print.info(`already linked: ${shortPath(target)}`);
      return;
    }
    if (!opts.force) {
      const what = existing ? `symlink -> ${existing}` : 'a regular file';
      print.error(`${shortPath(target)} exists as ${what}. Pass --force to replace.`);
      process.exit(1);
    }
    fs.rmSync(target, { force: true });
  }

  fs.symlinkSync(src, target);
  print.succeed(`linked ${shortPath(target)} -> ${shortPath(src)}`);
}

function safeReadlink(p: string): string | null {
  try { return fs.readlinkSync(p); } catch { return null; }
}

function isBrokenSymlink(p: string): boolean {
  try {
    fs.statSync(p);
    return false;
  } catch {
    try { return Boolean(fs.readlinkSync(p)); } catch { return false; }
  }
}

function shortPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home + path.sep)) return '~' + p.slice(home.length);
  return p;
}
