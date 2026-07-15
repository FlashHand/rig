import fs from 'fs';
import path from 'path';
import print from '../print';
import { copyToClipboard } from '../handoff/platform';
import { findRigRoot } from '../handoff/paths';

export interface GuideOptions {
  copy?: boolean;
  path?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerGuideCommands(program: any): void {
  program.command('help [command]')
    .description('show Rig command help; optionally for one command family')
    .action((command: string | undefined) => showHelp(program, command));

  program.command('guide')
    .alias('man')
    .description('print the complete agent-oriented Rig guide (alias: man)')
    .option('--copy', 'copy the guide to the macOS clipboard')
    .option('--path', 'print the installed guide path instead of its contents')
    .action(guideCli);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function showHelp(program: any, command?: string): void {
  if (!command) {
    program.outputHelp();
    return;
  }

  const target = program.commands.find((candidate: any) => {
    if (candidate.name() === command) return true;
    return typeof candidate.aliases === 'function' && candidate.aliases().includes(command);
  });
  if (!target) {
    print.error(`unknown Rig command: ${command}`);
    process.exitCode = 1;
    program.outputHelp();
    return;
  }
  target.outputHelp();
}

export function resolveGuidePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.RIG_GUIDE_PATH) return path.resolve(env.RIG_GUIDE_PATH);
  const root = findRigRoot();
  if (!root) throw new Error('could not locate the installed rigjs package.');
  return path.join(root, 'RIG_GUIDE.md');
}

export function readGuide(env: NodeJS.ProcessEnv = process.env): string {
  const guidePath = resolveGuidePath(env);
  if (!fs.existsSync(guidePath)) throw new Error(`Rig guide is missing: ${guidePath}`);
  return fs.readFileSync(guidePath, 'utf8');
}

export function guideCli(options: GuideOptions = {}): void {
  try {
    if (options.copy && options.path) throw new Error('--copy and --path cannot be used together.');
    const guidePath = resolveGuidePath();
    if (options.path) {
      process.stdout.write(guidePath + '\n');
      return;
    }
    const guide = readGuide();
    if (options.copy) {
      copyToClipboard(guide);
      print.succeed('copied the Rig agent guide to the clipboard');
      return;
    }
    process.stdout.write(guide.endsWith('\n') ? guide : guide + '\n');
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
