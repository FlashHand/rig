#!/usr/bin/env node
// Keep `.claude/skills/rig-wiki/SKILL.md` in sync with the canonical root
// `RIG_WIKI_SKILL.md`. Runs from `prepublishOnly` so the tarball always
// ships matching copies.
//
// We keep two real files (instead of a symlink) because npm pack does not
// preserve symlinks in the tarball, and the official Claude Code plugin
// loader expects a real file at <plugin>/.claude/skills/<name>/SKILL.md.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'RIG_WIKI_SKILL.md');
const dest = path.join(repoRoot, '.claude/skills/rig-wiki/SKILL.md');

const srcContent = readFileSync(src, 'utf8');
mkdirSync(path.dirname(dest), { recursive: true });
let destContent = '';
try { destContent = readFileSync(dest, 'utf8'); } catch { /* missing is fine */ }

if (srcContent === destContent) {
  console.log('sync-skill: .claude/skills/rig-wiki/SKILL.md already in sync');
} else {
  writeFileSync(dest, srcContent, 'utf8');
  console.log('sync-skill: wrote .claude/skills/rig-wiki/SKILL.md  (<-  RIG_WIKI_SKILL.md)');
}
