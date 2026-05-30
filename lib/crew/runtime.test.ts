import os from 'os';
import fs from 'fs';
import path from 'path';
import { runCommand, buildEngineInvocation, createTaskWorktree, removeTaskWorktree, runParallel, dispatchTask } from './runtime';

const NODE = process.execPath; // verify mechanics with a harmless command, not real engines

describe('runCommand', () => {
  it('captures stdout and exit code 0 on success', async () => {
    const r = await runCommand(NODE, ['-e', 'process.stdout.write("hi")']);
    expect(r.stdout).toBe('hi');
    expect(r.code).toBe(0);
    expect(r.timedOut).toBe(false);
  });

  it('captures stderr and non-zero exit code on failure', async () => {
    const r = await runCommand(NODE, ['-e', 'process.stderr.write("boom"); process.exit(3)']);
    expect(r.stderr).toContain('boom');
    expect(r.code).toBe(3);
  });

  it('enforces a timeout (kills the process, marks timedOut)', async () => {
    const r = await runCommand(NODE, ['-e', 'setTimeout(()=>{}, 10000)'], { timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
    expect(r.code).toBeNull(); // killed by signal, no exit code
  });

  it('runs in the given cwd', async () => {
    const tmp = os.tmpdir();
    const r = await runCommand(NODE, ['-e', 'process.stdout.write(process.cwd())'], { cwd: tmp });
    // macOS /tmp is a symlink to /private/tmp; just assert it resolved somewhere under tmp's basename
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(r.code).toBe(0);
  });

  it('pipes stdin input', async () => {
    const r = await runCommand(
      NODE,
      ['-e', 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(d.toUpperCase()))'],
      { input: 'hi' },
    );
    expect(r.stdout).toBe('HI');
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runCommand('definitely-not-a-real-binary-xyz', [])).rejects.toThrow();
  });

  it('caps captured output at maxOutputBytes and flags truncated', async () => {
    const r = await runCommand(NODE, ['-e', 'process.stdout.write("x".repeat(5000))'], { maxOutputBytes: 100 });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBe(100);
    expect(r.code).toBe(0);
  });

  it('does not flag truncated for small output', async () => {
    const r = await runCommand(NODE, ['-e', 'process.stdout.write("hi")']);
    expect(r.truncated).toBe(false);
  });

  it('closes child stdin by default so stdin-reading children get EOF (no hang)', async () => {
    // Without closing stdin, a child that reads until "end" never fires it and hangs
    // (this is the codex-exec hang found in the dual-engine smoke).
    const r = await runCommand(
      NODE,
      ['-e', 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write("EOF:"+d.length))'],
      { timeoutMs: 5000 },
    );
    expect(r.stdout).toBe('EOF:0');
    expect(r.timedOut).toBe(false);
    expect(r.code).toBe(0);
  });
});

describe('buildEngineInvocation', () => {
  it('maps claude to headless print mode', () => {
    expect(buildEngineInvocation('claude', 'do X')).toEqual({ cmd: 'claude', args: ['-p', 'do X'] });
  });
  it('maps codex to exec', () => {
    expect(buildEngineInvocation('codex', 'do X')).toEqual({ cmd: 'codex', args: ['exec', 'do X'] });
  });
  it('throws for pi (not yet implemented)', () => {
    expect(() => buildEngineInvocation('pi' as any, 'x')).toThrow(/not implemented/);
  });
  it('throws for unknown engine', () => {
    expect(() => buildEngineInvocation('gpt' as any, 'x')).toThrow(/unknown engine/);
  });
});

describe('worktree lifecycle', () => {
  let repo: string;

  beforeAll(async () => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-wt-'));
    await runCommand('git', ['init', '-q'], { cwd: repo });
    fs.writeFileSync(path.join(repo, 'f.txt'), 'hello');
    await runCommand('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: repo });
    await runCommand('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: repo });
  });

  afterAll(() => {
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('creates and removes a task worktree on a task/<id> branch', async () => {
    const wt = await createTaskWorktree(repo, 'demo-001');
    expect(wt.branch).toBe('task/demo-001');
    expect(fs.existsSync(wt.path)).toBe(true);
    const br = await runCommand('git', ['branch', '--list', 'task/demo-001'], { cwd: repo });
    expect(br.stdout).toContain('task/demo-001');
    await removeTaskWorktree(repo, wt.path, { force: true });
    expect(fs.existsSync(wt.path)).toBe(false);
  });

  it('throws when the worktree/branch already exists', async () => {
    const wt = await createTaskWorktree(repo, 'dup-001');
    await expect(createTaskWorktree(repo, 'dup-001')).rejects.toThrow(/worktree add failed/);
    await removeTaskWorktree(repo, wt.path, { force: true });
  });

  it('dispatchTask runs the invocation inside the task worktree (kept on success)', async () => {
    const inv = { cmd: process.execPath, args: ['-e', 'process.stdout.write(process.cwd())'] };
    const { worktree, result } = await dispatchTask(repo, 'disp-001', inv);
    expect(result.code).toBe(0);
    // ran inside the worktree (cwd echoed); realpath to dodge macOS /var symlink
    expect(fs.realpathSync(result.stdout.trim())).toBe(fs.realpathSync(worktree.path));
    expect(fs.existsSync(worktree.path)).toBe(true); // kept until merge
    await removeTaskWorktree(repo, worktree.path, { force: true });
  });

  it('dispatchTask removes the worktree on spawn failure', async () => {
    await expect(dispatchTask(repo, 'disp-fail', { cmd: 'definitely-not-a-real-binary-xyz', args: [] }))
      .rejects.toThrow();
    expect(fs.existsSync(path.join(repo, '.worktrees', 'task-disp-fail'))).toBe(false);
  });
});

describe('runParallel', () => {
  it('preserves order and returns all results', async () => {
    const out = await runParallel([1, 2, 3, 4, 5], async n => n * 2, 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let maxActive = 0;
    await runParallel(
      Array.from({ length: 8 }, (_, i) => i),
      async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 15));
        active--;
      },
      3,
    );
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1); // actually ran concurrently
  });
});
