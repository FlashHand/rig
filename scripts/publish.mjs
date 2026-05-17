#!/usr/bin/env node
// Thin wrapper around `npm publish`:
//   - reads NPM_TOKEN from env, or `--token <val>` from argv
//   - fails fast with a clear hint when neither is present
//   - writes a short-lived temp .npmrc with the token + registry, points
//     npm at it via --userconfig (token never lives in argv → no `ps` leak,
//     never lives in the repo, deleted on exit)
//   - passes everything else through to npm publish

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.npmjs.org/';

// --- parse argv ---
const argv = process.argv.slice(2);
let token = process.env.NPM_TOKEN;
const passthrough = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--token' && argv[i + 1]) {
    token = argv[++i];
  } else if (argv[i].startsWith('--token=')) {
    token = argv[i].slice('--token='.length);
  } else {
    passthrough.push(argv[i]);
  }
}

// --- check token ---
if (!token) {
  process.stderr.write([
    '',
    'npm publish: NPM_TOKEN not found.',
    '',
    'Fix one of:',
    '  1) Set persistent env var (recommended)',
    '       echo \'export NPM_TOKEN=npm_xxx\' >> ~/.zshrc && source ~/.zshrc',
    '  2) Pass it inline this run only',
    '       yarn deliver --token npm_xxx',
    '  3) Export in current shell',
    '       export NPM_TOKEN=npm_xxx && yarn deliver',
    '',
    'Generate one at:  https://www.npmjs.com/settings/<your-user>/tokens',
    'Choose "Automation" if you have 2FA enabled.',
    '',
  ].join('\n'));
  process.exit(1);
}

// --- show what's about to ship ---
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
process.stdout.write(`\npublishing ${pkg.name}@${pkg.version} to ${REGISTRY}\n\n`);

// --- write throwaway userconfig with the real token ---
const tmpDir = mkdtempSync(path.join(tmpdir(), 'rigjs-publish-'));
const tmpRc = path.join(tmpDir, '.npmrc');
writeFileSync(tmpRc, [
  `registry=${REGISTRY}`,
  `//registry.npmjs.org/:_authToken=${token}`,
  'always-auth=true',
  '',
].join('\n'), { mode: 0o600 });

let status = 1;
try {
  const res = spawnSync('npm', ['publish', `--userconfig=${tmpRc}`, ...passthrough], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  status = res.status ?? 1;
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
process.exit(status);
