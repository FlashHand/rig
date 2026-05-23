import fs from 'fs';
import path from 'path';
import os from 'os';
import print from '../print';
import { paths } from './paths';

const BUNDLED_SKILLS = ['rig-wiki', 'rig-crew'];

interface UninstallOpts { project?: boolean; }

/**
 * Remove bundled-skill symlinks. Mirrors `installSkill` flags:
 *   default       — `~/.claude/skills/<name>/SKILL.md`
 *   `--project`   — both `<cwd>/.claude/skills/<name>/SKILL.md`
 *                   and `<cwd>/.agents/skills/<name>/SKILL.md`
 */
export default function wikiUninstallSkill(opts: UninstallOpts): void {
  const parents = opts.project
    ? [
        path.join(process.cwd(), '.claude', 'skills'),
        path.join(process.cwd(), '.agents', 'skills'),
      ]
    : [paths.claudeSkillsDir];

  let removed = 0;
  for (const parent of parents) {
    for (const name of BUNDLED_SKILLS) {
      const targetDir = path.join(parent, name);
      const target = path.join(targetDir, 'SKILL.md');

      if (fs.existsSync(target) || isBrokenSymlink(target)) {
        fs.rmSync(target, { force: true });
        print.succeed(`removed ${shortPath(target)}`);
        removed++;
      }

      if (fs.existsSync(targetDir)) {
        try {
          if (fs.readdirSync(targetDir).length === 0) {
            fs.rmdirSync(targetDir);
          }
        } catch { /* non-fatal */ }
      }
    }
  }

  if (removed === 0) print.info('nothing to remove.');
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
