import print from '../../print';
import { loadRigConfig, saveRigConfig } from '../config';
import { AgentName } from './types';

const VALID: AgentName[] = ['claude', 'codex', 'pi'];
const IMPLEMENTED: AgentName[] = ['claude'];

export default function agentUse(name: string): void {
  if (!VALID.includes(name as AgentName)) {
    print.error(`unknown agent: ${name} (valid: ${VALID.join(', ')})`);
    process.exit(1);
  }
  if (!IMPLEMENTED.includes(name as AgentName)) {
    print.error(`adapter "${name}" is not implemented yet (P3 roadmap). Stick with "claude" for now.`);
    process.exit(20);
  }
  const cfg = loadRigConfig();
  cfg.wiki = { ...(cfg.wiki || {}), defaultAgent: name as AgentName };
  saveRigConfig(cfg);
  print.succeed(`default agent set to ${name}`);
}
