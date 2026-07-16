import fs from 'fs';
import { spawnSync } from 'child_process';

export function requireMacOS(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'darwin') {
    const error = new Error(`rig handoff supports macOS only (detected: ${platform}).`);
    (error as Error & { exitCode?: number }).exitCode = 32;
    throw error;
  }
}

export function copyToClipboard(text: string, env: NodeJS.ProcessEnv = process.env): void {
  const testFile = env.RIG_HANDOFF_CLIPBOARD_FILE;
  if (testFile) {
    fs.writeFileSync(testFile, text, { mode: 0o600 });
    return;
  }

  const result = spawnSync('/usr/bin/pbcopy', [], {
    input: text,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      LANG: env.LANG || process.env.LANG || 'en_US.UTF-8',
      LC_CTYPE: env.LC_CTYPE || process.env.LC_CTYPE || 'UTF-8',
    },
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pbcopy exited with code ${result.status}: ${(result.stderr || '').trim()}`);
  }
}

export function notifyHandoff(message: string): void {
  const escapeAppleScript = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  spawnSync('/usr/bin/osascript', [
    '-e',
    `display notification "${escapeAppleScript(message)}" with title "Rig Handoff"`,
  ], { stdio: 'ignore' });
}
