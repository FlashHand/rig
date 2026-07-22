import path from 'path';
import print from '../print';
import installHandoffCli from './install';
import uninstallHandoffCli from './uninstall';
import doctorHandoffCli from './doctor';
import { buildClaudeHandoffPrompt, buildHandoffPrompt } from './prompt';
import { copyToClipboard, notifyHandoff, requireMacOS } from './platform';
import { findLatestTranscript, inspectTranscript, intakeTranscript, readTranscriptPage } from './transcript';
import { readHookStdin, runHookCli } from './hook';
import { resolveHandoffPaths, shortPath } from './paths';
import { assertCodexTranscriptPath, findLatestCodexTranscript, inspectCodexTranscript, intakeCodexTranscript, readCodexSessionMeta, readCodexTranscriptPage } from './codex-transcript';
import { readCodexHookStdin, runCodexHookCli } from './codex-hook';
import { readCodexLatestPointer } from './codex-pointer';

interface CopyOptions { cwd?: string; notify?: boolean; latest?: boolean; }
interface LatestOptions { cwd?: string; json?: boolean; }
interface InspectOptions { recent?: number; maxChars?: number; }
interface ReadOptions { from?: number; limit?: number; maxChars?: number; full?: boolean; }
interface IntakeOptions { before?: number; limit?: number; maxChars?: number; full?: boolean; }
type CodexCopyOptions = CopyOptions;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerHandoffCommands(program: any): void {
  const handoff = program.command('handoff').description('local bidirectional Claude Code ↔ Codex session handoff (macOS only)');

  handoff.command('install')
    .description('install one shared handoff sender, two format adapters, zero-token hooks, and the stable launcher')
    .option('-f, --force', 'back up and replace conflicting skill directories')
    .option('--no-stop-failure', 'do not auto-copy a handoff after Claude API quota/auth failures')
    .action(installHandoffCli);

  handoff.command('uninstall')
    .description('remove only the skills and Claude/Codex hooks owned by Rig handoff')
    .action(uninstallHandoffCli);

  handoff.command('doctor')
    .description('verify the local bidirectional Claude/Codex handoff installation')
    .option('--json', 'machine-readable output')
    .action(doctorHandoffCli);

  handoff.command('copy [transcript]')
    .description('copy a Codex-ready handoff prompt; defaults to the latest Claude transcript')
    .option('--latest', 'explicitly select the latest Claude transcript')
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

  handoff.command('intake <transcript>')
    .description('recover useful Claude transcript evidence from newest to oldest')
    .option('--before <line>', 'exclusive raw-line cursor returned by the previous page', parseInteger)
    .option('--limit <n>', 'meaningful entries per page (default 24, max 200)', parseInteger)
    .option('--max-chars <n>', 'per-string cap with head and tail retained (default 4000)', parseInteger)
    .option('--full', 'do not truncate text/tool output on this page')
    .action(intakeHandoffCli);

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

  const fromCodex = handoff.command('from-codex')
    .description('copy and recover a Codex rollout for Claude Code');

  fromCodex.command('copy [transcript]')
    .description('copy a Claude-ready handoff; defaults to the latest root Codex rollout')
    .option('--latest', 'select the latest explicit pointer or root Codex rollout')
    .option('--cwd <path>', 'when selecting the latest rollout, require this working directory')
    .option('--notify', 'also show a macOS notification')
    .action(copyFromCodexCli);

  fromCodex.command('latest')
    .description('print the newest saved root Codex rollout path')
    .option('--cwd <path>', 'require a rollout for this working directory')
    .option('--json', 'machine-readable output')
    .action(latestFromCodexCli);

  fromCodex.command('inspect <transcript>')
    .description('print a compact privacy-filtered manifest for a Codex rollout JSONL')
    .option('--recent <n>', 'recent normalized entries to include (default 20)', parseInteger)
    .option('--max-chars <n>', 'per-string preview cap (default 4000)', parseInteger)
    .action(inspectFromCodexCli);

  fromCodex.command('intake <transcript>')
    .description('recover useful Codex rollout evidence from newest to oldest')
    .option('--before <line>', 'exclusive raw-line cursor returned by the previous page', parseInteger)
    .option('--limit <n>', 'meaningful entries per page (default 24, max 200)', parseInteger)
    .option('--max-chars <n>', 'per-string cap with head and tail retained (default 4000)', parseInteger)
    .option('--full', 'do not truncate text/tool output on this page')
    .action(intakeFromCodexCli);

  fromCodex.command('read <transcript>')
    .description('page through a Codex rollout JSONL as privacy-filtered normalized JSON')
    .option('--from <line>', 'first JSONL line, 1-based (default 1)', parseInteger)
    .option('--limit <n>', 'lines per page (default 80, max 1000)', parseInteger)
    .option('--max-chars <n>', 'per-string cap (default 12000)', parseInteger)
    .option('--full', 'do not truncate text/tool output on this page')
    .action(readFromCodexCli);

  fromCodex.command('hook')
    .description('internal Codex UserPromptSubmit hook entrypoint; reads JSON from stdin')
    .action(() => {
      try {
        const paths = resolveHandoffPaths();
        const code = runCodexHookCli(readCodexHookStdin(), paths.codexLatestPointer);
        if (code !== 0) process.exitCode = code;
      } catch (error) {
        // The Codex hook runs for every user prompt. Unreadable input must not
        // make unrelated prompts unavailable; the exact trigger is tiny and
        // will be fail-closed by runCodexHookCli after parsing.
        process.stderr.write(`rig handoff from-codex hook: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    });
}

export function copyHandoffCli(transcript: string | undefined, options: CopyOptions = {}): void {
  try {
    requireMacOS();
    if (transcript && options.latest) throw new Error('pass either a transcript path or --latest, not both.');
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

export function intakeHandoffCli(transcript: string, options: IntakeOptions = {}): void {
  try {
    process.stdout.write(JSON.stringify(intakeTranscript(transcript, options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`rig handoff intake: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export function copyFromCodexCli(transcript: string | undefined, options: CodexCopyOptions = {}): void {
  try {
    requireMacOS();
    if (transcript && options.latest) throw new Error('pass either a transcript path or --latest, not both.');
    const paths = resolveHandoffPaths();
    const selected = transcript
      ? assertCodexTranscriptPath(transcript)
      : findLatestCodexTranscript(
        paths.codexSessions,
        options.cwd ? path.resolve(options.cwd) : undefined,
        paths.codexLatestPointer,
      );
    if (!selected) throw new Error('no matching root Codex rollout JSONL found. Submit one Codex prompt first or pass a transcript path.');
    const session = readCodexSessionMeta(selected);
    const pointer = transcript ? null : readCodexLatestPointer(paths.codexLatestPointer);
    const pointerMatches = !!pointer
      && path.resolve(pointer.transcriptPath) === selected
      && (!options.cwd || path.resolve(pointer.cwd) === path.resolve(options.cwd));
    const prompt = buildClaudeHandoffPrompt({
      transcriptPath: selected,
      cwd: pointerMatches ? pointer!.cwd : session.cwd || (options.cwd ? path.resolve(options.cwd) : process.cwd()),
      sessionId: pointerMatches ? pointer!.sessionId : session.threadId || session.sessionId || path.basename(selected, '.jsonl'),
      model: pointerMatches ? pointer!.model : undefined,
    });
    copyToClipboard(prompt);
    if (options.notify) notifyHandoff('Claude handoff copied to clipboard.');
    print.succeed(`copied Claude handoff for ${shortPath(selected)}`);
  } catch (error) {
    print.error(error instanceof Error ? error.message : String(error));
    process.exitCode = (error as Error & { exitCode?: number }).exitCode || 1;
  }
}

export function latestFromCodexCli(options: LatestOptions = {}): void {
  const paths = resolveHandoffPaths();
  const selected = findLatestCodexTranscript(
    paths.codexSessions,
    options.cwd ? path.resolve(options.cwd) : undefined,
    paths.codexLatestPointer,
  );
  if (!selected) {
    if (options.json) process.stdout.write(JSON.stringify({ transcriptPath: null }) + '\n');
    else print.error('no matching root Codex rollout JSONL found.');
    process.exitCode = 1;
    return;
  }
  if (options.json) process.stdout.write(JSON.stringify({ transcriptPath: selected }) + '\n');
  else process.stdout.write(selected + '\n');
}

export function inspectFromCodexCli(transcript: string, options: InspectOptions = {}): void {
  try { process.stdout.write(JSON.stringify(inspectCodexTranscript(transcript, options), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write(`rig handoff from-codex inspect: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export function intakeFromCodexCli(transcript: string, options: IntakeOptions = {}): void {
  try { process.stdout.write(JSON.stringify(intakeCodexTranscript(transcript, options), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write(`rig handoff from-codex intake: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export function readFromCodexCli(transcript: string, options: ReadOptions = {}): void {
  try { process.stdout.write(JSON.stringify(readCodexTranscriptPage(transcript, options), null, 2) + '\n'); }
  catch (error) {
    process.stderr.write(`rig handoff from-codex read: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function parseInteger(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`expected a positive integer, got ${value}`);
  return parseInt(value, 10);
}
