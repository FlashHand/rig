// `rig install-local` — build the current source tree and install it as the
// global `rig` binary so edits become reachable as the on-PATH `rig`.
//
// Strategy (in order):
//   1. Build (yarn build).
//   2. If <npm prefix>/lib/node_modules/rigjs exists and is user-writable,
//      do an in-place sync of the package.json `files[]` payload. This avoids
//      EACCES on a root-owned npm prefix that already has a user-owned rigjs
//      subdir (the common Homebrew-then-sudo-first-install pattern).
//   3. Otherwise fall back to `npm install -g <repoRoot>`.
//   4. Re-link the agent skill via `rig wiki install-skill --force`.
//
// A subsequent `npm i -g rigjs` (registry install) cleanly overwrites step 2.

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import print from './print';

interface InstallLocalOpts {
	skipBuild?: boolean;
	manager?: 'npm' | 'yarn';
}

export default function installLocal(opts: InstallLocalOpts = {}): void {
	// `__dirname/..` would point at the *installed* rigjs dir when invoked via
	// the global binary — that's the destination, not the source. Walk up from
	// CWD instead, so the user gets "install whatever I'm hacking on right now".
	const repoRoot = findSourceRoot();
	if (!repoRoot) {
		print.error('run `rig install-local` from inside the rigjs source tree (a dir with package.json {"name":"rigjs"}).');
		process.exit(1);
	}

	if (!opts.skipBuild) {
		print.start('yarn build');
		const build = spawnSync('yarn', ['build'], { cwd: repoRoot, stdio: 'inherit' });
		if (build.status !== 0) {
			print.error(`yarn build exited with code ${build.status}`);
			process.exit(build.status ?? 1);
		}
		print.succeed('build done');
	}

	const dest = findInstallDir();
	if (dest && canWriteInside(dest)) {
		syncInPlace(repoRoot, dest);
	} else {
		runPackageManager(repoRoot, opts.manager || 'npm');
	}

	// Always refresh the agent skill symlink so edits to RIG_WIKI_SKILL.md
	// take effect on next Claude Code restart.
	const link = spawnSync('rig', ['wiki', 'install-skill', '--force'], { stdio: 'inherit' });
	if (link.status !== 0) {
		print.warn('skill relink exited non-zero (often safe to ignore; re-run `rig wiki install-skill --force` manually if needed).');
	}

	const which = whichRig();
	print.succeed(`installed: ${which || 'rig'} — verify with \`rig -v\` (expect ${readVersion(repoRoot)}) and \`rig -c\` (expect ${readVersionCode(repoRoot) ?? '<empty>'}).`);
}

function findSourceRoot(start: string = process.cwd()): string | null {
	let dir = path.resolve(start);
	while (true) {
		const pkg = path.join(dir, 'package.json');
		if (fs.existsSync(pkg)) {
			try {
				const p = JSON.parse(fs.readFileSync(pkg, 'utf8'));
				if (p && p.name === 'rigjs') return dir;
			} catch { /* keep walking */ }
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

// Locate the existing global rigjs install dir without invoking npm (faster,
// and tolerates broken npm configs).
function findInstallDir(): string | null {
	try {
		const prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
		const candidate = path.join(prefix, 'lib', 'node_modules', 'rigjs');
		return fs.existsSync(candidate) ? candidate : null;
	} catch {
		return null;
	}
}

function canWriteInside(dir: string): boolean {
	try {
		const probe = path.join(dir, '.rig-write-probe');
		fs.writeFileSync(probe, '');
		fs.unlinkSync(probe);
		return true;
	} catch { return false; }
}

// Copy the subset that `package.json files[]` would ship into the existing
// rigjs install dir. Uses rsync for speed + deletion of stale files inside
// per-entry dirs. Does not touch the rigjs/node_modules tree.
function syncInPlace(repoRoot: string, dest: string): void {
	print.start(`sync in place -> ${dest}`);
	const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
	const files: string[] = Array.isArray(pkg.files) ? pkg.files : [];

	// Always-shipped top-level files alongside package.json
	const alwaysFiles = ['package.json'];

	// 1. top-level files
	for (const f of [...alwaysFiles, ...files.filter(isFile(repoRoot))]) {
		const src = path.join(repoRoot, f);
		const dst = path.join(dest, f);
		if (!fs.existsSync(src)) continue;
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		fs.copyFileSync(src, dst);
	}

	// 2. directory entries -> rsync --delete (mirrors the source for that dir)
	const dirs = files.filter(isDir(repoRoot));
	for (const d of dirs) {
		const src = path.join(repoRoot, d) + '/';
		const dst = path.join(dest, d) + '/';
		fs.mkdirSync(path.dirname(dst.replace(/\/$/, '')), { recursive: true });
		const r = spawnSync('rsync', ['-a', '--delete', src, dst], { stdio: 'inherit' });
		if (r.status !== 0) {
			print.error(`rsync ${d} failed (code ${r.status})`);
			process.exit(r.status ?? 1);
		}
	}

	// node_modules is not in package.json `files[]` (npm install handles it
	// for registry installs), so the in-place sync must mirror it explicitly.
	// rsync's delta transfer keeps this cheap on incremental dep changes.
	const srcNm = path.join(repoRoot, 'node_modules');
	if (fs.existsSync(srcNm)) {
		const dstNm = path.join(dest, 'node_modules');
		const r = spawnSync('rsync', ['-a', '--delete', srcNm + '/', dstNm + '/'], { stdio: 'inherit' });
		if (r.status !== 0) {
			print.error(`rsync node_modules failed (code ${r.status})`);
			process.exit(r.status ?? 1);
		}
	}

	// Always force exec bit on the launcher — rsync preserves source mode, and
	// repos that lost the exec bit (common after fresh clones on some setups)
	// would leave the global `rig` un-runnable. Cheap to always re-set.
	const launcher = path.join(dest, 'bin', 'rig.js');
	try { fs.chmodSync(launcher, 0o755); } catch { /* not fatal */ }

	print.succeed(`sync done`);
}

function isFile(repoRoot: string) {
	return (f: string) => {
		try { return fs.statSync(path.join(repoRoot, f)).isFile(); } catch { return false; }
	};
}

function isDir(repoRoot: string) {
	return (f: string) => {
		try { return fs.statSync(path.join(repoRoot, f)).isDirectory(); } catch { return false; }
	};
}

function runPackageManager(repoRoot: string, manager: 'npm' | 'yarn') {
	const cmd = manager === 'yarn'
		? ['yarn', ['global', 'add', `file:${repoRoot}`]]
		: ['npm', ['install', '-g', repoRoot]];
	print.start(`${cmd[0]} ${(cmd[1] as string[]).join(' ')}`);
	const r = spawnSync(cmd[0] as string, cmd[1] as string[], { cwd: repoRoot, stdio: 'inherit' });
	if (r.status !== 0) {
		print.error(`${cmd[0]} exited with code ${r.status}. If this is EACCES on /usr/local, either rerun with sudo, switch the npm prefix to a user dir, or chown the rigjs subtree.`);
		process.exit(r.status ?? 1);
	}
}

function readVersion(repoRoot: string): string {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
}
function readVersionCode(repoRoot: string): number | null {
	const v = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).versionCode;
	return v != null ? v : null;
}
function whichRig(): string | null {
	try { return execSync('command -v rig', { encoding: 'utf8' }).trim() || null; }
	catch { return null; }
}
