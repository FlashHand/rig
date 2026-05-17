import { AgentAdapter, AgentName } from './types';
import { ClaudeAdapter } from './claude';
import { CodexAdapter } from './codex';
import { PiAdapter } from './pi';

export const adapters: AgentAdapter[] = [
  new ClaudeAdapter(),
  new CodexAdapter(),
  new PiAdapter(),
];

export function getAdapter(name: AgentName): AgentAdapter {
  const a = adapters.find(x => x.name === name);
  if (!a) throw new Error(`unknown agent: ${name}`);
  return a;
}
