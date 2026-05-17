#!/usr/bin/env node
// Runs after `npm i -g rigjs`. Symlinks the bundled rig-wiki skill into
// ~/.claude/skills/rig-wiki/SKILL.md so Claude Code sees it without the
// user needing to run `rig wiki install-skill` first.
//
// Guardrails (so this never breaks an `npm install`):
//   - macOS only (defense-in-depth alongside package.json `os: ["darwin"]`)
//   - exit 0 even when something goes wrong; print a hint instead
//   - opt-out via env: `RIG_NO_AUTO_SKILL=1 npm i -g rigjs`
//   - idempotent: re-running is safe
//   - never clobber a symlink that points elsewhere (user may have
//     `yarn link`-ed a dev copy on top of a registry install)

import { existsSync, mkdirSync, readlinkSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ok = () => process.exit(0);

if (process.platform !== 'darwin') {
  console.log('rig: postinstall skipping (rig wiki is macOS-only)');
  ok();
}

if (process.env.RIG_NO_AUTO_SKILL === '1') {
  console.log('rig: postinstall skipping (RIG_NO_AUTO_SKILL=1)');
  ok();
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'RIG_WIKI_SKILL.md');

if (!existsSync(src)) {
  console.log(`rig: postinstall skipping (RIG_WIKI_SKILL.md not found at ${src})`);
  ok();
}

const claudeSkillsDir = path.join(homedir(), '.claude', 'skills');
if (!existsSync(claudeSkillsDir)) {
  console.log([
    '',
    'rig: Claude Code skills dir not found.',
    `  Expected: ${claudeSkillsDir}`,
    '  Install Claude Code first, then run:  rig wiki install-skill',
    '',
  ].join('\n'));
  ok();
}

const targetDir = path.join(claudeSkillsDir, 'rig-wiki');
const target = path.join(targetDir, 'SKILL.md');

try {
  mkdirSync(targetDir, { recursive: true });

  if (existsSync(target) || isBrokenSymlink(target)) {
    const existing = safeReadlink(target);
    if (existing === src) {
      console.log(`rig: skill already linked  (${target})`);
      ok();
    }
    if (existing) {
      console.log([
        `rig: skill link target conflicts at ${target}`,
        `  existing → ${existing}`,
        `  wanted   → ${src}`,
        '  Refusing to clobber. Run `rig wiki install-skill --force` if you want to replace it.',
      ].join('\n'));
      ok();
    }
    // Regular file (not a symlink). Skip — user wrote something custom.
    console.log(`rig: ${target} exists as a regular file; leaving it alone`);
    ok();
  }

  symlinkSync(src, target);
  console.log(`rig: linked rig-wiki skill -> ${target}`);
} catch (err) {
  console.log(`rig: postinstall couldn't link skill (${err && err.message || err}). Run \`rig wiki install-skill\` manually.`);
}
ok();

function safeReadlink(p) {
  try { return readlinkSync(p); } catch { return null; }
}

function isBrokenSymlink(p) {
  try {
    statSync(p); // follows symlinks
    return false;
  } catch {
    // statSync throws if target is missing. lstat tells us if `p` itself exists as a link.
    try { return Boolean(readlinkSync(p)); } catch { return false; }
  }
}
