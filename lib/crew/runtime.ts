import { spawn } from 'child_process';
import path from 'path';
import { Engine } from './engine';

// Agent runtime — engine-agnostic process primitives (design §2.2 "agent runtime").
// This module is the foundational layer the dispatcher builds on: spawn a CLI
// engine in a task worktree, capture its output, enforce a timeout. Engine-specific
// behaviour (claude/codex flags) is isolated in `buildEngineInvocation` and verified
// against the real CLIs in the dual-engine smoke; the mechanics here are verified
// with harmless commands (echo / node -e / sleep) — see runtime.test.ts.

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** True when stdout or stderr hit maxOutputBytes and was truncated. */
  truncated: boolean;
  durationMs: number;
}

export interface RunOptions {
  cwd?: string;
  /** Hard timeout in ms; <=0 or undefined disables it. On timeout: SIGTERM, then SIGKILL after a grace period. */
  timeoutMs?: number;
  /** Sent to stdin then closed. */
  input?: string;
  env?: NodeJS.ProcessEnv;
  /** Per-stream capture cap in bytes (default 10MB). Guards against an agentic engine emitting unbounded output. */
  maxOutputBytes?: number;
}

const KILL_GRACE_MS = 2000;
const MAX_OUTPUT_BYTES_DEFAULT = 10_000_000;

/**
 * Spawn a command, capture stdout/stderr, enforce an optional timeout.
 * Resolves with a RunResult (even on non-zero exit / timeout); rejects only when
 * the process cannot be spawned at all (e.g. binary not found).
 */
export function runCommand(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let truncated = false;
    let killTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;
    const maxBytes = opts.maxOutputBytes && opts.maxOutputBytes > 0 ? opts.maxOutputBytes : MAX_OUTPUT_BYTES_DEFAULT;

    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env || process.env });

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        graceTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      }, opts.timeoutMs);
    }

    child.stdout?.on('data', d => {
      if (stdout.length >= maxBytes) { truncated = true; return; }
      stdout += d.toString();
      if (stdout.length > maxBytes) { stdout = stdout.slice(0, maxBytes); truncated = true; }
    });
    child.stderr?.on('data', d => {
      if (stderr.length >= maxBytes) { truncated = true; return; }
      stderr += d.toString();
      if (stderr.length > maxBytes) { stderr = stderr.slice(0, maxBytes); truncated = true; }
    });

    child.on('error', err => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (graceTimer) clearTimeout(graceTimer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (graceTimer) clearTimeout(graceTimer);
      resolve({ stdout, stderr, code, signal, timedOut, truncated, durationMs: Date.now() - start });
    });

    // Always close stdin (with input if given, empty otherwise). Engines like
    // `codex exec` block forever waiting for stdin EOF if it's left open; closing
    // it makes them proceed with the prompt arg. (Found in the dual-engine smoke.)
    if (opts.input != null) child.stdin?.write(opts.input);
    child.stdin?.end();
  });
}

export interface Invocation { cmd: string; args: string[]; }

/**
 * Autonomy level for a dispatched engine (om-approval, Ral's decision):
 * - 'read-only'  : engine reads/answers, no file writes (default; safe for smoke/dispatch).
 * - 'develop'    : engine may write/run **inside its worktree** (claude acceptEdits,
 *                  codex workspace-write). Scoped to the isolated task worktree; safety
 *                  rests on worktree isolation + no-secrets-in-submodule + the verify→merge gate.
 */
export type Autonomy = 'read-only' | 'develop';

/**
 * Map an engine + prompt to a one-shot, non-interactive CLI invocation (design §2.2).
 * Exact flags verified against the real CLIs in the dual-engine smoke.
 */
export function buildEngineInvocation(engine: Engine, prompt: string, opts: { autonomy?: Autonomy } = {}): Invocation {
  const dev = opts.autonomy === 'develop';
  switch (engine) {
    case 'claude':
      return { cmd: 'claude', args: dev ? ['-p', '--permission-mode', 'acceptEdits', prompt] : ['-p', prompt] };
    case 'codex':
      return { cmd: 'codex', args: dev ? ['exec', '--sandbox', 'workspace-write', prompt] : ['exec', prompt] };
    case 'pi': throw new Error('pi engine invocation is not implemented yet');
    default: throw new Error(`unknown engine: ${engine as string}`);
  }
}

// --- Worktree lifecycle (design §2.2 "worktree 隔离") ---
// Each dispatched task runs in its own git worktree on a `task/<id>` branch, so
// parallel engines never collide in one working tree. Created before dispatch,
// removed after merge/abandon.

export interface Worktree { path: string; branch: string; }

/** `git worktree add <dir> -b task/<taskId> <base>` in `repoDir`. */
export async function createTaskWorktree(
  repoDir: string,
  taskId: string,
  opts: { base?: string; worktreeDir?: string } = {},
): Promise<Worktree> {
  const branch = `task/${taskId}`;
  const wtDir = opts.worktreeDir || path.join(repoDir, '.worktrees', `task-${taskId}`);
  const base = opts.base || 'HEAD';
  const r = await runCommand('git', ['worktree', 'add', wtDir, '-b', branch, base], { cwd: repoDir });
  if (r.code !== 0) throw new Error(`git worktree add failed (${r.code}): ${(r.stderr || r.stdout).trim()}`);
  return { path: wtDir, branch };
}

/** `git worktree remove <path> [--force]` in `repoDir`. */
export async function removeTaskWorktree(
  repoDir: string,
  worktreePath: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const args = ['worktree', 'remove', worktreePath];
  if (opts.force) args.push('--force');
  const r = await runCommand('git', args, { cwd: repoDir });
  if (r.code !== 0) throw new Error(`git worktree remove failed (${r.code}): ${(r.stderr || r.stdout).trim()}`);
}

// --- Dispatch + parallel scheduling (design §2.2 "并行调度") ---

/** Run `worker` over `items` with at most `limit` concurrent; results keep input order. */
export async function runParallel<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = 4,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lim = Math.max(1, limit);
  async function runner(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(lim, items.length) }, () => runner()));
  return results;
}

export interface DispatchResult { worktree: Worktree; result: RunResult; }

/**
 * Create a task worktree, run `invocation` inside it, return its worktree + RunResult.
 * On success the worktree is KEPT (the work lives there until merge/abandon); on spawn
 * failure it is removed so no orphan worktree is left. The engine→invocation mapping is
 * the caller's job (`buildEngineInvocation`), keeping dispatch engine-agnostic.
 */
export async function dispatchTask(
  repoDir: string,
  taskId: string,
  invocation: Invocation,
  opts: { base?: string; timeoutMs?: number } = {},
): Promise<DispatchResult> {
  const worktree = await createTaskWorktree(repoDir, taskId, { base: opts.base });
  try {
    const result = await runCommand(invocation.cmd, invocation.args, { cwd: worktree.path, timeoutMs: opts.timeoutMs });
    return { worktree, result };
  } catch (err) {
    try { await removeTaskWorktree(repoDir, worktree.path, { force: true }); } catch { /* best-effort */ }
    throw err;
  }
}

// --- Commit / verify / merge (develop→verify→merge, om-loop) ---

/** Stage + commit everything in a worktree. Returns false if there was nothing to commit. */
export async function commitWorktree(worktreePath: string, message: string): Promise<boolean> {
  await runCommand('git', ['add', '-A'], { cwd: worktreePath });
  const st = await runCommand('git', ['status', '--porcelain'], { cwd: worktreePath });
  if (!st.stdout.trim()) return false;
  const r = await runCommand('git', ['-c', 'user.email=rig@local', '-c', 'user.name=rig', 'commit', '-m', message], { cwd: worktreePath });
  if (r.code !== 0) throw new Error(`commit failed: ${(r.stderr || r.stdout).trim()}`);
  return true;
}

/**
 * True if the repo working tree is clean enough to merge into — i.e. no USER changes.
 * Orchestrator-owned artifacts are ignored: `.worktrees/` (task worktrees live here) and
 * `docs/plan/` (task status writebacks dirty the tracked task files). Neither is user work,
 * and `git merge` never touches them. Real source/other changes still block the merge.
 */
export async function isRepoClean(repoDir: string): Promise<boolean> {
  const r = await runCommand('git', ['status', '--porcelain'], { cwd: repoDir });
  const dirty = r.stdout.split('\n').filter(Boolean).filter(line => {
    const p = line.slice(3); // porcelain "XY <path>"
    if (p === '.worktrees/' || p.startsWith('.worktrees/')) return false;
    if (p.startsWith('docs/plan/')) return false;
    return true;
  });
  return dirty.length === 0;
}

export interface MergeResult { merged: boolean; conflict: boolean; detail: string; }

/** Merge `branch` into the repo's checked-out branch (--no-ff). Aborts cleanly on conflict. */
export async function mergeTaskBranch(repoDir: string, branch: string): Promise<MergeResult> {
  const r = await runCommand('git', ['-c', 'user.email=rig@local', '-c', 'user.name=rig', 'merge', '--no-ff', '-m', `merge ${branch}`, branch], { cwd: repoDir });
  if (r.code === 0) return { merged: true, conflict: false, detail: '' };
  await runCommand('git', ['merge', '--abort'], { cwd: repoDir });
  return { merged: false, conflict: true, detail: (r.stderr || r.stdout).trim().slice(0, 200) };
}

/** Delete a (merged) branch; best-effort. */
export async function deleteBranch(repoDir: string, branch: string): Promise<void> {
  await runCommand('git', ['branch', '-D', branch], { cwd: repoDir });
}
