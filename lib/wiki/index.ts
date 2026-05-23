import wikiInit from './init';
import wikiRegister from './register';
import wikiUnregister from './unregister';
import wikiList from './list';
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

  wiki.command('init [path]')
    .description('bootstrap a wiki dir at <path> (default CWD)')
    .action(wikiInit);

  wiki.command('register [path]')
    .description('register a wiki into ~/.rig/wiki.config.json5')
    .option('-n, --as <slug>', 'override the wiki name (`--name` would clash with commander)')
    .option('-f, --force', 'overwrite an existing entry with the same name')
    .action(wikiRegister);

  wiki.command('unregister <nameOrPath>')
    .description('remove a wiki from ~/.rig/wiki.config.json5 (disk untouched)')
    .action(wikiUnregister);

  wiki.command('list')
    .description('list registered wikis + daemon/agent/qmd status')
    .action(wikiList);

  wiki.command('scan [path]')
    .description('compute NEW/MODIFIED/DELETED/RAW DRIFT report')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('-a, --all', 'scan every registered wiki')
    .option('--json', 'machine-readable output')
    .action(wikiScan);

  wiki.command('fetch <url>')
    .description('verbatim download URL into raw/YYYY-MM-DD-<slug>.md')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('--slug <slug>', 'override the auto-derived slug')
    .option('--via-agent', 'use Claude WebFetch for HTML→md conversion')
    .option('--json', 'machine-readable output')
    .action(wikiFetch);

  wiki.command('ingest <source>')
    .description('two-step CoT ingest of one source (preview diff, then apply)')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('--dry-run', 'print diff but do not apply')
    .option('--json', 'machine-readable output')
    .action(wikiIngest);

  wiki.command('query <q>')
    .description('semantic search — Qwen3 vector + Qwen3 reranker, cross-lingual CN/EN')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('-l, --limit <n>', 'top-k hits (1-50, default 10)', (v) => parseInt(v, 10))
    .option('--no-rerank', 'skip the reranker pass (faster, no reranker model load)')
    .option('-s, --synth', 'use Claude to synthesize a paragraph answer with citations')
    .option('--json', 'machine-readable output')
    .action(wikiQuery);

  wiki.command('lint')
    .description('contradictions / orphans / stale claims / broken refs')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('-a, --all', 'lint every registered wiki')
    .option('--json', 'machine-readable output')
    .action(wikiLint);

  wiki.command('index')
    .description('build/refresh qmd vector index (incremental by default)')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('-a, --all', 'index every registered wiki')
    .option('-f, --force', 'force full re-embed (use after switching embed models)')
    .action(wikiIndex);

  wiki.command('rebuild')
    .description('refresh local caches (sha index + qmd vectors) — for new devices or after switching embed models')
    .option('-w, --wiki <name>', 'target wiki name')
    .option('-a, --all', 'rebuild every registered wiki')
    .option('--skip-embed', 'only clear ~/.rig/state.db rows, do not touch qmd at all')
    .action(wikiRebuild);

  wiki.command('install-skill')
    .description('symlink bundled rig-wiki skill into ~/.claude/skills/')
    .option('-f, --force', 'replace an existing symlink')
    .action(wikiInstallSkill);

  wiki.command('uninstall-skill')
    .description('remove the symlink from ~/.claude/skills/rig-wiki')
    .action(wikiUninstallSkill);

  registerAgentCommands(wiki);
  registerDaemonCommands(wiki);
}
