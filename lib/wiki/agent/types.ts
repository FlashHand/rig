export type AgentName = 'claude' | 'codex' | 'pi';

export interface AgentDetect {
  installed: boolean;
  version?: string;
  path?: string;
}

export interface AgentRunOpts {
  prompt: string;
  systemPrompt?: string;
  files?: string[];
  cwd: string;
  allowWrite: boolean;
  tools?: ('webfetch' | 'qmd' | 'bash')[];
  timeoutMs?: number;
}

export interface AgentRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number;
}

export interface AgentAdapter {
  name: AgentName;
  detect(): Promise<AgentDetect>;
  run(opts: AgentRunOpts): Promise<AgentRunResult>;
}

export class NotImplementedError extends Error {
  constructor(adapter: string) {
    super(`adapter "${adapter}" is not implemented yet (P3 roadmap)`);
  }
}
