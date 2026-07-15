import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts/publish.mjs');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  key !== 'NPM_TOKEN' && key !== 'NODE_AUTH_TOKEN'
));

test('refuses credentials passed through argv without echoing them', () => {
  const fake = ['npm', 'fake', 'argv', 'credential'].join('_');
  const result = spawnSync(process.execPath, [script, `--token=${fake}`], {
    cwd: repo,
    env: cleanEnv,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--token is refused/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(fake));
});

test('fails before npm when no credential environment is present', () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: repo,
    env: cleanEnv,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NPM_TOKEN not found/);
});
