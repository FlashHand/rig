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

// Scrub `npm_config_*` env vars before spawning npm. yarn injects
// `npm_config_registry=https://registry.yarnpkg.com` when running scripts,
// and that env wins over the registry= line in our temp .npmrc.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^npm_config_/i.test(k))
);

let status = 1;
try {
  // `--registry` on the CLI is the strongest override (CLI flag > env > rc).
  // Belt-and-braces with the scrubbed env above.
  const res = spawnSync('npm', [
    'publish',
    '--registry', REGISTRY,
    `--userconfig=${tmpRc}`,
    ...passthrough,
  ], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: cleanEnv,
  });
  status = res.status ?? 1;
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (status === 0) {
  await syncNpmmirror(pkg.name);
}
process.exit(status);

/**
 * Tell registry.npmmirror.com to pull the newly published version from
 * upstream npmjs. Fire the POST kickoff, then poll the sync log a few
 * times — we don't block release on completion, just surface progress.
 *
 * Failures (network, 5xx, timeout) are warnings, not hard errors: the
 * publish itself succeeded; the mirror will catch up on its own.
 */
async function syncNpmmirror(pkgName) {
  const slug = encodeURIComponent(pkgName);
  const kickoffUrl = `https://registry.npmmirror.com/-/package/${slug}/syncs?sync_upstream=true`;
  process.stdout.write(`\nsyncing ${pkgName} to npmmirror.com...\n`);

  let logId;
  try {
    const r = await fetch(kickoffUrl, { method: 'PUT' });
    if (!r.ok) {
      process.stderr.write(`  kickoff failed (HTTP ${r.status}) — mirror will sync on its own schedule\n`);
      return;
    }
    const body = await r.json();
    logId = body.logId || body.id;
    if (!logId) {
      process.stdout.write(`  kicked off (no logId returned, treating as fire-and-forget)\n`);
      return;
    }
    process.stdout.write(`  kicked off (logId=${logId})\n`);
  } catch (e) {
    process.stderr.write(`  kickoff error: ${e.message} — mirror will sync on its own schedule\n`);
    return;
  }

  // Poll the sync log: 3s interval, give up after 60s.
  const statusUrl = `https://registry.npmmirror.com/-/package/${slug}/syncs/${logId}`;
  const start = Date.now();
  const TIMEOUT_MS = 60_000;
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await fetch(statusUrl);
      if (!r.ok) continue;
      const s = await r.json();
      if (s.syncDone || s.state === 'success') {
        process.stdout.write(`  npmmirror sync complete\n`);
        return;
      }
      if (s.state === 'fail') {
        process.stderr.write(`  npmmirror sync failed: ${s.error || '(no error message)'}\n`);
        return;
      }
    } catch { /* transient — keep polling */ }
  }
  process.stdout.write(`  still in progress after ${TIMEOUT_MS / 1000}s — npmmirror will finish in the background\n`);
}
