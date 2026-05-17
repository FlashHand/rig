import print from '../../print';
import { adapters } from './registry';
import { loadRigConfig } from '../config';

export default async function agentList(): Promise<void> {
  const defaultAgent = loadRigConfig().wiki?.defaultAgent || 'claude';
  print.info('rig wiki — agent adapters');
  for (const a of adapters) {
    let row: string;
    try {
      const d = await a.detect();
      row = d.installed
        ? `  ${star(a.name, defaultAgent)} ${a.name.padEnd(7)} installed  ${d.version || '(no --version output)'}  ${d.path || ''}`
        : `  ${star(a.name, defaultAgent)} ${a.name.padEnd(7)} not installed`;
    } catch (e: any) {
      row = `  ${star(a.name, defaultAgent)} ${a.name.padEnd(7)} ERROR  ${e.message}`;
    }
    // eslint-disable-next-line no-console
    console.log(row);
  }
  // eslint-disable-next-line no-console
  console.log(`\ndefault: ${defaultAgent}   (change with: rig wiki agent use <name>)`);
}

function star(name: string, def: string) {
  return name === def ? '*' : ' ';
}
