import agentList from './list';
import agentUse from './use';

export { adapters, getAdapter } from './registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerAgentCommands(parent: any): void {
  const agent = parent.command('agent').description('inspect / configure agent CLIs');
  agent.command('list').description('list installed agent CLIs').action(agentList);
  agent.command('use <name>').description('set default agent (claude|codex|pi)').action(agentUse);
}
