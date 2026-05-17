import fs from 'fs';
import path from 'path';
import print from '../print';
import { paths } from './paths';

/** Find rig's canonical skill file at `<rigjs>/RIG_WIKI_SKILL.md`. */
function findBundledSkill(): string | undefined {
  // Walk up from `built/index.js` (prod) or `lib/wiki/installSkill.ts` (dev)
  // looking for the rigjs package root.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (p.name === 'rigjs') {
          const skill = path.join(dir, paths.builtinSkillRelative);
          if (fs.existsSync(skill)) return skill;
        }
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
  const src = findBundledSkill();
  if (!src) {
    print.error('could not locate RIG_WIKI_SKILL.md inside the rigjs install. Reinstall rigjs?');
    process.exit(1);
  }

  if (!fs.existsSync(paths.claudeSkillsDir)) {
    print.error(`Claude Code skills dir not found: ${paths.claudeSkillsDir}`);
    print.info('install Claude Code first, then re-run `rig wiki install-skill`.');
    process.exit(1);
  }

  const targetDir = path.join(paths.claudeSkillsDir, 'rig-wiki');
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
  print.info('restart Claude Code to pick up the new skill.');
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
