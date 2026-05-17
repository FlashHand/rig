import { spawn, spawnSync } from 'child_process';
import { AgentAdapter, AgentDetect, AgentRunOpts, AgentRunResult } from './types';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

const SYSTEM_PROMPT_HEADER = `You are the executor for \`rig wiki <op>\`.
You MUST follow <wiki>/schema.md exactly.
You MUST NOT edit raw/, purpose.md, schema.md. The host will reject any such patch.
Output is consumed by a CLI; keep stdout to status updates only. Persist actual content by writing files.
`;

export class ClaudeAdapter implements AgentAdapter {
  name = 'claude' as const;

  async detect(): Promise<AgentDetect> {
    const which = spawnSync('command', ['-v', 'claude'], { encoding: 'utf8', shell: '/bin/sh' });
    const binPath = (which.stdout || '').trim();
    if (which.status !== 0 || !binPath) return { installed: false };
    const v = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    const version = (v.stdout || '').trim() || undefined;
    return { installed: true, path: binPath, version };
  }

  async run(opts: AgentRunOpts): Promise<AgentRunResult> {
    const args = ['-p'];
    args.push('--allowedTools', allowedToolsCsv(opts));
    if (opts.systemPrompt || SYSTEM_PROMPT_HEADER) {
      args.push('--append-system-prompt', SYSTEM_PROMPT_HEADER + (opts.systemPrompt || ''));
    }
    args.push(opts.prompt);
    const start = Date.now();
    return new Promise<AgentRunResult>((resolve) => {
      const child = spawn('claude', args, {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      const killer = setTimeout(() => child.kill('SIGTERM'),
                                opts.timeoutMs || DEFAULT_TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(killer);
        resolve({
          ok: code === 0,
          exitCode: code ?? -1,
          stdout, stderr,
          durationMs: Date.now() - start,
        });
      });
    });
  }
}

function allowedToolsCsv(opts: AgentRunOpts): string {
  const tools = new Set<string>(['Read']);
  if (opts.allowWrite) { tools.add('Write'); tools.add('Edit'); }
  for (const t of opts.tools || []) {
    if (t === 'webfetch') tools.add('WebFetch');
    if (t === 'qmd') tools.add('Bash(qmd:*)');
    if (t === 'bash') tools.add('Bash');
  }
  return Array.from(tools).join(',');
}
