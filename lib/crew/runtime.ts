import { spawn } from 'child_process';
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
  durationMs: number;
}

export interface RunOptions {
  cwd?: string;
  /** Hard timeout in ms; <=0 or undefined disables it. On timeout: SIGTERM, then SIGKILL after a grace period. */
  timeoutMs?: number;
  /** Sent to stdin then closed. */
  input?: string;
  env?: NodeJS.ProcessEnv;
}

const KILL_GRACE_MS = 2000;

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
    let killTimer: NodeJS.Timeout | undefined;
    let graceTimer: NodeJS.Timeout | undefined;

    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env || process.env });

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        graceTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      }, opts.timeoutMs);
    }

    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });

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
      resolve({ stdout, stderr, code, signal, timedOut, durationMs: Date.now() - start });
    });

    if (opts.input != null) {
      child.stdin?.write(opts.input);
      child.stdin?.end();
    }
  });
}

export interface Invocation { cmd: string; args: string[]; }

/**
 * Map an engine + prompt to a one-shot, non-interactive CLI invocation (design §2.2).
 * Exact flags are verified against the real CLIs in the dual-engine smoke; keep the
 * mapping here so the dispatcher stays engine-agnostic.
 */
export function buildEngineInvocation(engine: Engine, prompt: string): Invocation {
  switch (engine) {
    case 'claude': return { cmd: 'claude', args: ['-p', prompt] };
    case 'codex': return { cmd: 'codex', args: ['exec', prompt] };
    case 'pi': throw new Error('pi engine invocation is not implemented yet');
    default: throw new Error(`unknown engine: ${engine as string}`);
  }
}
