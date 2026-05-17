import fs from 'fs';
import path from 'path';
import print from '../print';
import { paths } from './paths';

export default function wikiUninstallSkill(): void {
  const targetDir = path.join(paths.claudeSkillsDir, 'rig-wiki');
  const target = path.join(targetDir, 'SKILL.md');

  let removed = false;
  if (fs.existsSync(target) || isBrokenSymlink(target)) {
    fs.rmSync(target, { force: true });
    print.succeed(`removed ${target}`);
    removed = true;
  }

  // Clean the rig-wiki/ dir if we left it empty.
  if (fs.existsSync(targetDir)) {
    try {
      if (fs.readdirSync(targetDir).length === 0) {
        fs.rmdirSync(targetDir);
        print.info(`removed empty dir ${targetDir}`);
      }
    } catch { /* non-fatal */ }
  }

  if (!removed) print.info(`nothing to remove at ${target}`);
}

function isBrokenSymlink(p: string): boolean {
  try {
    fs.statSync(p);
    return false;
  } catch {
    try { return Boolean(fs.readlinkSync(p)); } catch { return false; }
  }
}
