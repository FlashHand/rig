import path from 'path';
import print from '../print';
import installHandoffCli from './install';
import uninstallHandoffCli from './uninstall';
import doctorHandoffCli from './doctor';
import { buildHandoffPrompt } from './prompt';
import { copyToClipboard, notifyHandoff, requireMacOS } from './platform';
import { findLatestTranscript, inspectTranscript, readTranscriptPage } from './transcript';
import { readHookStdin, runHookCli } from './hook';
import { resolveHandoffPaths, shortPath } from './paths';

interface CopyOptions { cwd?: string; notify?: boolean; }
interface LatestOptions { cwd?: string; json?: boolean; }
interface InspectOptions { recent?: number; maxChars?: number; }
interface ReadOptions { from?: number; limit?: number; maxChars?: number; full?: boolean; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHandoffCommands(program: any): void {
  const handoff = program.command('handoff').description('local Claude Code → Codex session handoff (macOS only)');

  handoff.command('install')
    .description('install Claude /handoff, zero-token hooks, and the Codex from-claude skill')
    .option('-f, --force', 'back up and replace conflicting skill directories')
    .option('--no-stop-failure', 'do not auto-copy a handoff after Claude API quota/auth failures')
    .action(installHandoffCli);

  handoff.command('uninstall')
    .description('remove only the skills and Claude hooks owned by Rig handoff')
    .action(uninstallHandoffCli);

  handoff.command('doctor')
    .description('verify the local Claude/Codex handoff installation')
    .option('--json', 'machine-readable output')
    .action(doctorHandoffCli);

  handoff.command('copy [transcript]')
    .description('copy a Codex-ready handoff prompt; defaults to the latest Claude transcript')
    .option('--cwd <path>', 'when selecting the latest transcript, require this working directory')
    .option('--notify', 'also show a macOS notification')
    .action(copyHandoffCli);

  handoff.command('latest')
    .description('print the newest Claude transcript path')
    .option('--cwd <path>', 'require a transcript that mentions this working directory')
    .option('--json', 'machine-readable output')
    .action(latestHandoffCli);

  handoff.command('inspect <transcript>')
    .description('print a compact JSON manifest for a Claude JSONL transcript')
    .option('--recent <n>', 'recent normalized entries to include (default 20)', parseInteger)
    .option('--max-chars <n>', 'per-string preview cap (default 4000)', parseInteger)
    .action(inspectHandoffCli);

  handoff.command('read <transcript>')
    .description('page through a Claude JSONL transcript as normalized JSON')
    .option('--from <line>', 'first JSONL line, 1-based (default 1)', parseInteger)
    .option('--limit <n>', 'lines per page (default 80, max 1000)', parseInteger)
    .option('--max-chars <n>', 'per-string cap (default 12000)', parseInteger)
    .option('--full', 'do not truncate text/tool output on this page')
    .action(readHandoffCli);

  handoff.command('hook')
    .description('internal Claude hook entrypoint; reads hook JSON from stdin')
    .action(() => {
      let code = 1;
      try { code = runHookCli(readHookStdin()); }
      catch (error) {
        // UserPromptExpansion must fail closed. Returning a non-zero hook exit
        // would be non-blocking in some Claude Code versions and could send
        // the expanded skill to the model.
        process.stdout.write(JSON.stringify({
          decision: 'block',
          reason: `Rig handoff failed before calling Claude: ${error instanceof Error ? error.message : String(error)}`,
        }) + '\n');
        code = 0;
      }
      if (code !== 0) process.exitCode = code;
    });
}

export function copyHandoffCli(transcript: string | undefined, options: CopyOptions = {}): void {
  try {
    requireMacOS();
    const paths = resolveHandoffPaths();
    const selected = transcript
      ? path.resolve(transcript)
      : findLatestTranscript(paths.claudeProjects, options.cwd ? path.resolve(options.cwd) : undefined);
    if (!selected) throw new Error('no matching Claude JSONL transcript found.');
    const manifest = inspectTranscript(selected, { recent: 1, maxChars: 1000 });
    const session = manifest.session || {};
    const prompt = buildHandoffPrompt({
      transcriptPath: selected,
      cwd: session.cwd || (options.cwd ? path.resolve(options.cwd) : process.cwd()),
      sessionId: session.sessionId || path.basename(selected, '.jsonl'),
    });
    copyToClipboard(prompt);
    if (options.notify) notifyHandoff('Codex handoff copied to clipboard.');
    print.succeed(`copied handoff for ${shortPath(selected)}`);
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

export function latestHandoffCli(options: LatestOptions = {}): void {
  const paths = resolveHandoffPaths();
  const selected = findLatestTranscript(paths.claudeProjects, options.cwd ? path.resolve(options.cwd) : undefined);
  if (!selected) {
    if (options.json) process.stdout.write(JSON.stringify({ transcriptPath: null }) + '\n');
    else print.error('no matching Claude JSONL transcript found.');
    process.exitCode = 1;
    return;
  }
  if (options.json) process.stdout.write(JSON.stringify({ transcriptPath: selected }) + '\n');
  else process.stdout.write(selected + '\n');
}

export function inspectHandoffCli(transcript: string, options: InspectOptions = {}): void {
  try {
    process.stdout.write(JSON.stringify(inspectTranscript(transcript, options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`rig handoff inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export function readHandoffCli(transcript: string, options: ReadOptions = {}): void {
  try {
    process.stdout.write(JSON.stringify(readTranscriptPage(transcript, options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`rig handoff read: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseInteger(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`expected a positive integer, got ${value}`);
  return parseInt(value, 10);
}
