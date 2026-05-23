#!/usr/bin/env node
// versionCode bumper.
//
// Format: YYMMDDNN — 6-digit local date prefix + 2-digit sequence (01-99).
// Caps at 99 builds per day. Same algorithm as bitterless/scripts/publish.js
// `updateVersionCode`, kept here so rig (and any project that imports this
// module) can stamp builds without depending on bitterless.
//
// Usage:
//   node scripts/version-code.mjs            # bump + write package.json + print
//   node scripts/version-code.mjs --print    # print current code, no write
//   node scripts/version-code.mjs --peek     # show what the next bump would be
//   import { bumpVersionCode } from './scripts/version-code.mjs'
//
// All file I/O is relative to the package.json found by walking up from CWD,
// so the script works from any subdir of the project.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAD2 = (n) => n.toString().padStart(2, '0');

function todayPrefix(date = new Date()) {
  const y = date.getFullYear().toString().slice(-2);
  return `${y}${PAD2(date.getMonth() + 1)}${PAD2(date.getDate())}`;
}

function nextCode(currentCode, prefix = todayPrefix()) {
  const current = currentCode != null ? String(currentCode) : '';
  if (current.startsWith(prefix)) {
    const n = parseInt(current.slice(6), 10);
    if (isNaN(n)) return `${prefix}01`;
    if (n >= 99) {
      throw new Error(`versionCode cap reached (99 builds today for prefix ${prefix})`);
    }
    return `${prefix}${PAD2(n + 1)}`;
  }
  return `${prefix}01`;
}

function findPackageJson(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const p = path.join(dir, 'package.json');
    if (existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found walking up from ' + startDir);
    dir = parent;
  }
}

export function bumpVersionCode(packageJsonPath = findPackageJson()) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const before = pkg.versionCode != null ? String(pkg.versionCode) : '';
  const after = nextCode(before);
  pkg.versionCode = parseInt(after, 10);
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  return { before, after: pkg.versionCode, packageJsonPath };
}

export function readVersionCode(packageJsonPath = findPackageJson()) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return pkg.versionCode != null ? String(pkg.versionCode) : null;
}

// CLI entrypoint
const isMain = (() => {
  try { return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
})();

if (isMain) {
  const arg = process.argv[2];
  const pkgPath = findPackageJson();
  if (arg === '--print') {
    const code = readVersionCode(pkgPath);
    process.stdout.write((code ?? '') + '\n');
  } else if (arg === '--peek') {
    const code = readVersionCode(pkgPath);
    process.stdout.write(nextCode(code ?? '') + '\n');
  } else {
    const { before, after } = bumpVersionCode(pkgPath);
    process.stdout.write(`versionCode: ${before || '<empty>'} -> ${after}\n`);
  }
}
