#!/usr/bin/env node
// Thin wrapper around `npm publish`:
//   - reads NPM_TOKEN or NODE_AUTH_TOKEN from the environment
//   - never accepts credentials on argv
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

const argv = process.argv.slice(2);
const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (argv.some((arg) => arg === '--token' || arg.startsWith('--token='))) {
  process.stderr.write('npm publish: --token is refused because command arguments may be logged. Use NPM_TOKEN or NODE_AUTH_TOKEN.\n');
  process.exit(2);
}
const passthrough = argv;

// --- check token ---
if (!token) {
  process.stderr.write([
    '',
    'npm publish: NPM_TOKEN not found.',
    '',
    'Provide NPM_TOKEN or NODE_AUTH_TOKEN through a private credential manager.',
    'Maintainers of this repository should use the rig-deliver skill, which',
    'resolves the token from the private OPS registry at runtime.',
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
  '',
].join('\n'), { mode: 0o600 });

// Scrub registry-affecting `npm_config_*` vars before spawning npm. yarn
// injects npm_config_registry=https://registry.yarnpkg.com, which otherwise
// wins over the registry= line in our temp .npmrc. Keep an explicit cache
// override, and never pass the publish token to npm after writing the temp rc.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => {
    if (k === 'NPM_TOKEN' || k === 'NODE_AUTH_TOKEN') return false;
    return !/^npm_config_/i.test(k) || k.toLowerCase() === 'npm_config_cache';
  })
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
