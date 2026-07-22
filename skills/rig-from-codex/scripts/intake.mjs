#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const usage = 'Usage: intake.mjs <transcript.jsonl> [--before <line>] [--limit <n>] [--max-chars <n>] [--full]';
const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(usage + '\n');
  process.exit(argv.length === 0 ? 1 : 0);
}

const transcript = argv.shift();
if (!transcript || transcript.startsWith('-')) fail('the transcript path must be the first argument');
await waitForTranscript(transcript, 2000);

const passthrough = [];
let hasLimit = false;
let hasMaxChars = false;
while (argv.length > 0) {
  const option = argv.shift();
  if (option === '--full') {
    passthrough.push(option);
    continue;
  }
  if (option !== '--before' && option !== '--limit' && option !== '--max-chars') fail(`unsupported option: ${option}`);
  const value = argv.shift();
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) fail(`${option} requires a positive integer`);
  if (option === '--limit') hasLimit = true;
  if (option === '--max-chars') hasMaxChars = true;
  passthrough.push(option, value);
}

if (!hasLimit) passthrough.push('--limit', '12');
if (!hasMaxChars) passthrough.push('--max-chars', '2000');

const invocation = resolveRig();
const result = spawnSync(invocation.command, [
  ...invocation.prefix,
  'handoff',
  'from-codex',
  'intake',
  transcript,
  ...passthrough,
], { env: process.env, stdio: 'inherit' });

if (result.error) fail(result.error.message);
process.exitCode = result.status == null ? 1 : result.status;

function resolveRig() {
  const explicit = process.env.RIG_HANDOFF_BIN;
  if (explicit) {
    assertExecutable(explicit, 'RIG_HANDOFF_BIN');
    return { command: explicit, prefix: [] };
  }
  const stable = path.join(process.env.HOME || os.homedir(), '.rig', 'bin', 'rig-handoff');
  if (isExecutable(stable)) return { command: stable, prefix: [] };
  const rig = findOnPath('rig');
  if (rig) return { command: rig, prefix: [] };
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceBin = path.resolve(scriptDir, '..', '..', '..', 'bin', 'rig.js');
  if (fs.existsSync(sourceBin)) return { command: process.execPath, prefix: [sourceBin] };
  fail('Rig handoff launcher not found; run `rig handoff install` first');
}

function findOnPath(name) {
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function isExecutable(value) {
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return fs.statSync(value).isFile();
  } catch { return false; }
}

function assertExecutable(value, label) {
  if (!isExecutable(value)) fail(`${label} is not executable: ${value}`);
}

async function waitForTranscript(value, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      if (fs.statSync(value).isFile()) return;
    } catch { /* the hook can run just before the first JSONL flush */ }
    if (Date.now() >= deadline) fail(`transcript did not appear within ${timeoutMs}ms: ${value}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function fail(message) {
  process.stderr.write(`rig-from-codex intake: ${message}\n${usage}\n`);
  process.exit(1);
}
