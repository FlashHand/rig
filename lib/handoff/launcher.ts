import fs from 'fs';
import path from 'path';
import { uniqueBackupPath } from './settings';

export const LAUNCHER_MARKER = '# rigjs-handoff-launcher:v1';

export function buildLauncher(nodeBin: string, rigBin: string): string {
  return [
    '#!/bin/sh',
    LAUNCHER_MARKER,
    `exec ${shellQuote(path.resolve(nodeBin))} ${shellQuote(path.resolve(rigBin))} "$@"`,
    '',
  ].join('\n');
}

export function isOwnedLauncher(target: string): boolean {
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    return fs.readFileSync(target, 'utf8').split('\n', 3).includes(LAUNCHER_MARKER);
  } catch { return false; }
}

export function isLegacyLauncherLink(target: string, rigBin: string): boolean {
  try {
    if (!fs.lstatSync(target).isSymbolicLink()) return false;
    return path.resolve(path.dirname(target), fs.readlinkSync(target)) === path.resolve(rigBin);
  } catch { return false; }
}

export function preflightLauncher(target: string, rigBin: string, force = false): void {
  if (!lstat(target) || isOwnedLauncher(target) || isLegacyLauncherLink(target, rigBin) || force) return;
  throw new Error(`${target} already exists; pass --force to back it up and replace it.`);
}

export function installLauncher(
  rigBin: string,
  target: string,
  backupDir: string,
  nodeBin: string,
  force = false,
): boolean {
  if (!fs.existsSync(rigBin)) throw new Error(`bundled Rig launcher is missing: ${rigBin}`);
  const content = buildLauncher(nodeBin, rigBin);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = lstat(target);

  if (existing && isOwnedLauncher(target)) {
    const same = fs.readFileSync(target, 'utf8') === content;
    const executable = (existing.mode & 0o111) !== 0;
    if (same && executable) return false;
  } else if (existing && isLegacyLauncherLink(target, rigBin)) {
    fs.rmSync(target, { force: true });
  } else if (existing) {
    if (!force) throw new Error(`${target} already exists; pass --force to back it up and replace it.`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.renameSync(target, uniqueBackupPath(backupDir, 'rig-handoff-launcher'));
  }

  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, content, { mode: 0o700 });
    fs.chmodSync(temp, 0o700);
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
  return true;
}

export function removeOwnedLauncher(target: string, rigBin: string): boolean {
  if (!isOwnedLauncher(target) && !isLegacyLauncherLink(target, rigBin)) return false;
  fs.rmSync(target, { force: true });
  return true;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function lstat(value: string): fs.Stats | null {
  try { return fs.lstatSync(value); } catch { return null; }
}
