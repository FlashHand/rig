import fs from 'fs';
import path from 'path';
import print from '../print';
import { paths } from './paths';

const BUNDLED_SKILLS = [
  { name: 'rig-wiki', file: 'RIG_WIKI_SKILL.md' },
  { name: 'rig-crew', file: 'RIG_CREW_SKILL.md' },
];

/** Find rig's package root by walking up from built/ or lib/. */
function findRigRoot(): string | undefined {
  // Walk up from `built/index.js` (prod) or `lib/wiki/installSkill.ts` (dev)
  // looking for the rigjs package root.
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

interface InstallOpts { force?: boolean; }

export default function wikiInstallSkill(opts: InstallOpts): void {
  const root = findRigRoot();
  if (!root) {
    print.error('could not locate the rigjs install root. Reinstall rigjs?');
    process.exit(1);
  }

  if (!fs.existsSync(paths.claudeSkillsDir)) {
    print.error(`Claude Code skills dir not found: ${paths.claudeSkillsDir}`);
    print.info('install Claude Code first, then re-run `rig wiki install-skill`.');
    process.exit(1);
  }

  for (const skill of BUNDLED_SKILLS) {
    const src = path.join(root, skill.file);
    if (!fs.existsSync(src)) {
      print.warn(`skipping ${skill.name}: ${skill.file} not found inside rigjs install`);
      continue;
    }
    linkSkill(skill.name, src, opts);
  }

  print.info('restart Claude Code to pick up new or updated skills.');
}

function linkSkill(name: string, src: string, opts: InstallOpts): void {
  const targetDir = path.join(paths.claudeSkillsDir, name);
  const target = path.join(targetDir, 'SKILL.md');
  fs.mkdirSync(targetDir, { recursive: true });

  if (fs.existsSync(target) || isBrokenSymlink(target)) {
    const existing = safeReadlink(target);
    if (existing === src) {
      print.info(`already linked: ${target}`);
      return;
    }
    if (!opts.force) {
      const what = existing ? `symlink -> ${existing}` : 'a regular file';
      print.error(`${target} exists as ${what}. Pass --force to replace.`);
      process.exit(1);
    }
    fs.rmSync(target, { force: true });
  }

  fs.symlinkSync(src, target);
  print.succeed(`linked ${target} -> ${src}`);
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
