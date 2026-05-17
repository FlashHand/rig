import { spawnSync } from 'child_process';
import { AgentAdapter, AgentDetect, AgentRunOpts, AgentRunResult, NotImplementedError } from './types';

/**
 * Stub. Detection works; `run` will throw until the permission/whitelist API
 * of the codex CLI is settled. Target P3.
 */
export class CodexAdapter implements AgentAdapter {
  name = 'codex' as const;

  async detect(): Promise<AgentDetect> {
    const which = spawnSync('command', ['-v', 'codex'], { encoding: 'utf8', shell: '/bin/sh' });
    const binPath = (which.stdout || '').trim();
    if (which.status !== 0 || !binPath) return { installed: false };
    const v = spawnSync('codex', ['--version'], { encoding: 'utf8' });
    return { installed: true, path: binPath, version: (v.stdout || '').trim() || undefined };
  }

  async run(_opts: AgentRunOpts): Promise<AgentRunResult> {
    throw new NotImplementedError('codex');
  }
}
