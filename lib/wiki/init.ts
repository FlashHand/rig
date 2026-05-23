import fs from 'fs';
import path from 'path';
import print from '../print';
import { guardPath, refusalMessage } from './pathGuard';
import { saveVaultConfig, VaultConfig } from './config';

const PURPOSE_TMPL = `# Purpose

This wiki is <author>'s <scope> (single, do not mix).
Key questions it aims to answer:
- ...
- ...
What's in scope: ...
What's out of scope: ...
Audience: <author> + agents.
`;

const SCHEMA_TMPL = `# Schema

## Layers
- raw/, purpose.md, schema.md: read-only for LLM
- index.md, overview.md, log.md, reviews.md, sources/, entities/, concepts/,
  synthesis/, queries/: LLM is sole author

## Page types
- sources/<slug>.md     : 1-source summary
- entities/<slug>.md    : 1 thing with properties
- concepts/<slug>.md    : 1 abstract idea
- synthesis/<slug>.md   : cross-source integration
- queries/<slug>.md     : archived Q&A worth keeping

## Frontmatter (every wiki page MUST have)
- type: source | entity | concept | synthesis | query
- sources: [<source-slug>, ...]
- source-sha: <sha>                # source pages only
- source-path: raw/... | <relpath> # source pages only
- ingested-at: <ISO>
- last-updated: <ISO>

## Naming
- kebab-case; no spaces; no dates in page filenames
- raw/ filenames keep YYYY-MM-DD prefix

## Linking
- use [[wikilink]] to other wiki pages by slug
- every wiki page must link to >=1 other page or be flagged orphan

## Contradictions
- flag inline: > Contradiction: A vs B (see [[source-A]], [[source-B]])
- never silently merge; lint surfaces them for human resolution

## Hard rules
- never edit raw/, purpose.md, schema.md
- raw/ file sha drift = error, not a re-ingest trigger
- living-doc paths (in include[]) sha drift = MODIFIED, propose re-ingest
`;

const SUBDIRS = ['sources', 'entities', 'concepts', 'synthesis', 'queries'];

// What lives inside the vault but must not enter git / Obsidian Sync:
// - qmd's project-local vector cache (sqlite-vec, non-deterministic, rebuilds
//   locally with `rig wiki index` / `rig wiki rebuild`)
// - lint reports (auto-regenerated)
// - daemon proposal diffs (transient, per-machine)
// - editor scratch
const GITIGNORE_TMPL = `# rig wiki — local-only artifacts (do not commit)
# qmd vector cache (sqlite-vec, machine-specific, rebuildable)
.qmd/index.sqlite*
.qmd/*.sqlite-wal
.qmd/*.sqlite-shm
# auto-generated reports
lint-report-*.md
# daemon proposal queue (per-machine)
proposals/
# editor scratch
.DS_Store
*.swp
`;

/**
 * Sensible defaults for a fresh vault. The user can edit
 * `<vault>/.rig/config.yml` afterwards.
 *
 * Note: hidden directories (any path segment starting with `.`) and files
 * matched by the project's `.gitignore` are skipped automatically by the
 * scanner — there is no need to add `.git/**` or `node_modules/**` here.
 */
const DEFAULT_VAULT_CONFIG = (vaultBasename: string): VaultConfig => ({
  name: vaultBasename,
  root: '..',
  include: ['**/*.md'],
  exclude: [`${vaultBasename}/**`],
  schedule: { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null },
  ingestRules: [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
});

export default function wikiInit(givenPath?: string): void {
  if (!givenPath || !givenPath.trim()) {
    print.error('rig wiki init requires a target subdirectory.');
    print.info('usage: rig wiki init <subdir>     (recommended: `rig wiki init rig-wiki` at the project root)');
    print.info('refusing to default to CWD — that would litter the project root with vault templates.');
    process.exit(1);
  }
  const root = path.resolve(givenPath);
  const guard = guardPath(root, process.cwd());
  if (!guard.ok) {
    print.error('refusing to initialize a vault at a hidden or gitignored path.');
    // eslint-disable-next-line no-console
    console.error(refusalMessage(root, guard));
    process.exit(1);
  }
  fs.mkdirSync(root, { recursive: true });

  writeIfMissing(path.join(root, 'purpose.md'), PURPOSE_TMPL);
  writeIfMissing(path.join(root, 'schema.md'), SCHEMA_TMPL);
  writeIfMissing(path.join(root, 'index.md'), '# Index\n');
  writeIfMissing(path.join(root, 'overview.md'), '# Overview\n');
  writeIfMissing(path.join(root, 'log.md'), '# Log\n');
  writeIfMissing(path.join(root, 'reviews.md'), '# Reviews\n');
  writeIfMissing(path.join(root, '.gitignore'), GITIGNORE_TMPL);

  fs.mkdirSync(path.join(root, 'raw'), { recursive: true });
  writeIfMissing(path.join(root, 'raw', '.gitkeep'), '');

  // Page tree lives at the vault root — no extra `wiki/` nesting.
  for (const sub of SUBDIRS) {
    const d = path.join(root, sub);
    fs.mkdirSync(d, { recursive: true });
    writeIfMissing(path.join(d, '.gitkeep'), '');
  }

  // Seed `<vault>/.rig/config.yml` with sensible defaults. Idempotent: if the
  // user has already authored one, leave it alone.
  const vaultCfgFile = path.join(root, '.rig', 'config.yml');
  if (!fs.existsSync(vaultCfgFile)) {
    saveVaultConfig(root, DEFAULT_VAULT_CONFIG(path.basename(root)));
  }

  print.succeed(`vault initialized at ${root}`);
  print.info('next: edit purpose.md + schema.md (and .rig/config.yml if scope differs from defaults).');
  print.info('discovery is automatic — cd into this dir (or any subdir) and run `rig wiki *` commands.');
  print.info('on a new device, after cloning, run `rig wiki rebuild` to refresh local caches.');
}

function writeIfMissing(file: string, content: string) {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, content, 'utf8');
}
