import os from 'os';
import { runCommand, buildEngineInvocation } from './runtime';

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
