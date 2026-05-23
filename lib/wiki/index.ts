import wikiInit from './init';
import wikiScan from './scan';
import wikiFetch from './fetch';
import wikiIngest from './ingest';
import wikiQuery from './query';
import wikiLint from './lint';
import wikiIndex from './indexCmd';
import wikiRebuild from './rebuild';
import wikiInstallSkill from './installSkill';
import wikiUninstallSkill from './uninstallSkill';
import { registerAgentCommands } from './agent';
import { registerDaemonCommands } from './daemon';

// `program` is commander's Command instance. commander@6.1.0 typings are
// inconsistent between `CommanderStatic.Command` (the global `program`) and
// the per-call `Command` returned by `.command()`, so we type loose here to
// match the rest of the codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWikiCommands(program: any): void {
  const wiki = program.command('wiki').description('Karpathy-style LLM Wiki ops (macOS only in v1)');

  wiki.command('init <scope>')
    .description('bootstrap a vault scoped to <scope>/ — an existing data subdir of the project. Metadata is auto-created at ./rig-wiki/.')
    .action(wikiInit);

  wiki.command('scan')
    .description('compute NEW/MODIFIED/DELETED/RAW DRIFT report for the vault resolved from CWD')
    .option('--json', 'machine-readable output')
    .action(wikiScan);

  wiki.command('fetch <url>')
    .description('verbatim download URL into raw/YYYY-MM-DD-<slug>.md')
    .option('--slug <slug>', 'override the auto-derived slug')
    .option('--via-agent', 'use Claude WebFetch for HTML→md conversion')
    .option('--json', 'machine-readable output')
    .action(wikiFetch);

  wiki.command('ingest <source>')
    .description('two-step CoT ingest of one source (preview diff, then apply)')
    .option('--dry-run', 'print diff but do not apply')
    .option('--json', 'machine-readable output')
    .action(wikiIngest);

  wiki.command('query <q>')
    .description('semantic search — Qwen3 vector + Qwen3 reranker, cross-lingual CN/EN')
    .option('-l, --limit <n>', 'top-k hits (1-50, default 10)', (v) => parseInt(v, 10))
    .option('--no-rerank', 'skip the reranker pass (faster, no reranker model load)')
    .option('-s, --synth', 'use Claude to synthesize a paragraph answer with citations')
    .option('--json', 'machine-readable output')
    .action(wikiQuery);

  wiki.command('lint')
    .description('contradictions / orphans / stale claims / broken refs')
    .option('--json', 'machine-readable output')
    .action(wikiLint);

  wiki.command('index')
    .description('build/refresh qmd vector index (incremental by default)')
    .option('-f, --force', 'force full re-embed (use after switching embed models)')
    .action(wikiIndex);

  wiki.command('rebuild')
    .description('refresh local caches (sha index + qmd vectors) — for new devices or after switching embed models')
    .option('--skip-embed', 'only clear ~/.rig/state.db rows, do not touch qmd at all')
    .action(wikiRebuild);

  wiki.command('install-skill')
    .description('symlink bundled rig-wiki + rig-crew skills into ~/.claude/skills/ (or --project for the local project)')
    .option('-f, --force', 'replace an existing symlink')
    .option('-p, --project', 'install into <cwd>/.claude/skills/ and <cwd>/.agents/skills/ (project-level override for Claude Code + Codex)')
    .action(wikiInstallSkill);

  wiki.command('uninstall-skill')
    .description('remove the bundled skill symlinks (default: global; pass --project for the local project)')
    .option('-p, --project', 'uninstall from <cwd>/.claude/skills/ and <cwd>/.agents/skills/')
    .action(wikiUninstallSkill);

  registerAgentCommands(wiki);
  registerDaemonCommands(wiki);
}
