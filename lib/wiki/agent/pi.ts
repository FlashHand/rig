import { spawnSync } from 'child_process';
import { AgentAdapter, AgentDetect, AgentRunOpts, AgentRunResult, NotImplementedError } from './types';

/**
 * Stub. Target P3. Upstream CLI not yet fixed (Bo to specify which `pi`).
 */
export class PiAdapter implements AgentAdapter {
  name = 'pi' as const;

  async detect(): Promise<AgentDetect> {
    const which = spawnSync('command', ['-v', 'pi'], { encoding: 'utf8', shell: '/bin/sh' });
    const binPath = (which.stdout || '').trim();
    if (which.status !== 0 || !binPath) return { installed: false };
    const v = spawnSync('pi', ['--version'], { encoding: 'utf8' });
    return { installed: true, path: binPath, version: (v.stdout || '').trim() || undefined };
  }

  async run(_opts: AgentRunOpts): Promise<AgentRunResult> {
    throw new NotImplementedError('pi');
  }
}
