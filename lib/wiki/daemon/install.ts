import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import print from '../../print';
import { paths, daemonLabel } from '../paths';
import { requireMacOS } from '../platform';

function findRigEntry(): string {
  // Walk up from this file to find the package root, then return built/index.js
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (p.name === 'rigjs') return path.join(dir, 'built', 'index.js');
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not locate rigjs install root');
}

function findNode(): string {
  // Prefer /usr/local/bin/node (Homebrew Intel) then /opt/homebrew/bin/node (arm64).
  for (const p of ['/usr/local/bin/node', '/opt/homebrew/bin/node']) {
    if (fs.existsSync(p)) return p;
  }
  // Fall back to whichever node is invoking us right now.
  return process.execPath;
}

export default function daemonInstall(): void {
  requireMacOS();
  fs.mkdirSync(path.dirname(paths.launchAgent), { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });

  const nodeBin = findNode();
  const rigEntry = findRigEntry();
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${daemonLabel}</string>
  <key>ProgramArguments</key><array>
    <string>${nodeBin}</string>
    <string>${rigEntry}</string>
    <string>wiki</string><string>daemon</string><string>runner</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${paths.daemonLog}</string>
  <key>StandardErrorPath</key><string>${paths.daemonLog}</string>
</dict></plist>
`;
  fs.writeFileSync(paths.launchAgent, plist, 'utf8');

  // bootstrap (idempotent: bootout first to allow re-install)
  const uid = process.getuid?.() ?? 0;
  spawnSync('launchctl', ['bootout', `gui/${uid}`, paths.launchAgent], { stdio: 'ignore' });
  const boot = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, paths.launchAgent], { stdio: 'inherit' });
  if (boot.status !== 0) {
    print.error('launchctl bootstrap failed');
    process.exit(1);
  }
  print.succeed(`installed launchd agent ${daemonLabel}`);
  print.info(`logs: ${paths.daemonLog}`);
}
