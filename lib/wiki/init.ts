import fs from 'fs';
import path from 'path';
import os from 'os';
import print from '../print';
import { guardPath, refusalMessage } from './pathGuard';
import { saveVaultConfig, loadVaultConfig, VaultConfig } from './config';
import { vaultConfigPath } from './paths';

/**
 * `rig wiki init <scope>`
 *
 * The user runs this from a project root. The CWD is treated as the project
 * (the conceptual "vault"); `<scope>` names a data subdir under it that the
 * wiki should ingest from (e.g. `personal` for `<project>/personal/`).
 *
 * Vault metadata always lives at `<CWD>/rig-wiki/` (fixed name). The scope
 * is recorded in `<CWD>/rig-wiki/.rig/config.yml` as the scan root, so the
 * user's data dir stays untouched.
 *
 *   $ cd overmind
 *   $ rig wiki init personal
 *   ⇒ creates overmind/rig-wiki/ with templates + .rig/config.yml
 *   ⇒ config.yml.root = "../personal", config.yml.name = "personal"
 *
 * Idempotent for the same scope. Errors if rig-wiki/ already exists with a
 * different scope (manual `.rig/config.yml` edit required to switch).
 */
const VAULT_DIRNAME = 'rig-wiki';

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
 * Defaults for a freshly-scoped vault. The user can edit
 * `<vault>/.rig/config.yml` afterwards.
 *
 * `include` defaults to `**` (everything) — rig wiki is multimodal: Claude
 * Read tool handles markdown / code / json natively, images and PDFs are
 * read as visual / document inputs. The user can tighten this per-vault.
 *
 * `exclude` defaults to common binary-archive extensions whose contents
 * can't be ingested without unpacking. Hidden directories (segments starting
 * with `.`) and `.gitignore`'d files are skipped automatically by the
 * scanner — no need to list them.
 */
function defaultVaultConfig(scope: string, rootRel: string): VaultConfig {
  return {
    name: scope,
    root: rootRel,
    include: ['**'],
    exclude: [
      '*.zip', '**/*.zip',
      '*.tar', '**/*.tar',
      '*.tar.gz', '**/*.tar.gz',
      '*.tgz', '**/*.tgz',
      '*.7z', '**/*.7z',
      '*.rar', '**/*.rar',
    ],
    schedule: { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null },
    ingestRules: [{ match: 'raw/**/*.*', mode: 'auto-on-new' }],
  };
}

export default function wikiInit(scope?: string): void {
  if (!scope || !scope.trim()) {
    print.error('rig wiki init requires a scope.');
    print.info('usage: rig wiki init <scope>     (e.g. `rig wiki init personal` to ingest from ./personal/)');
    print.info(`<scope> is an existing data subdir of the project. Vault metadata is auto-created at ./${VAULT_DIRNAME}/.`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const vaultDir = path.join(cwd, VAULT_DIRNAME);
  const scopeAbs = path.resolve(cwd, scope);

  // The scope must already exist — pointing the wiki at a missing dir would
  // hide what is almost certainly a typo.
  if (!fs.existsSync(scopeAbs) || !fs.statSync(scopeAbs).isDirectory()) {
    print.error(`scope dir not found: ${scope}`);
    print.info(`expected an existing data subdir at ${shortPath(scopeAbs)}`);
    process.exit(1);
  }
  // The scope can't be (or contain) the vault dir itself.
  if (scopeAbs === vaultDir || vaultDir.startsWith(scopeAbs + path.sep)) {
    print.error(`scope cannot be or contain the vault dir (${VAULT_DIRNAME}/).`);
    process.exit(1);
  }

  const guard = guardPath(vaultDir, cwd);
  if (!guard.ok) {
    print.error(`refusing to initialize the vault at a hidden or gitignored path.`);
    // eslint-disable-next-line no-console
    console.error(refusalMessage(vaultDir, guard));
    process.exit(1);
  }

  // If the vault already has a config, it must already be scoped to the
  // same data dir — otherwise the user is trying to re-target an existing
  // vault, which we won't do silently. Manual config edit only.
  const cfgFile = vaultConfigPath(vaultDir);
  if (fs.existsSync(cfgFile)) {
    const existing = loadVaultConfig(vaultDir);
    const existingRootAbs = existing?.root
      ? path.resolve(vaultDir, existing.root)
      : path.dirname(vaultDir);
    if (existingRootAbs !== scopeAbs) {
      print.error(`vault already initialized at ${shortPath(vaultDir)} for scope "${existing?.name ?? '?'}" (root: ${existing?.root ?? '..'}).`);
      print.info(`to switch scopes, edit ${shortPath(cfgFile)} (name + root) by hand.`);
      process.exit(1);
    }
  }

  fs.mkdirSync(vaultDir, { recursive: true });
  writeIfMissing(path.join(vaultDir, 'purpose.md'), PURPOSE_TMPL);
  writeIfMissing(path.join(vaultDir, 'schema.md'), SCHEMA_TMPL);
  writeIfMissing(path.join(vaultDir, 'index.md'), '# Index\n');
  writeIfMissing(path.join(vaultDir, 'overview.md'), '# Overview\n');
  writeIfMissing(path.join(vaultDir, 'log.md'), '# Log\n');
  writeIfMissing(path.join(vaultDir, 'reviews.md'), '# Reviews\n');
  writeIfMissing(path.join(vaultDir, '.gitignore'), GITIGNORE_TMPL);

  fs.mkdirSync(path.join(vaultDir, 'raw'), { recursive: true });
  writeIfMissing(path.join(vaultDir, 'raw', '.gitkeep'), '');

  for (const sub of SUBDIRS) {
    const d = path.join(vaultDir, sub);
    fs.mkdirSync(d, { recursive: true });
    writeIfMissing(path.join(d, '.gitkeep'), '');
  }

  if (!fs.existsSync(cfgFile)) {
    const rootRel = path.relative(vaultDir, scopeAbs);
    saveVaultConfig(vaultDir, defaultVaultConfig(scope, rootRel));
  }

  print.succeed(`vault initialized at ${shortPath(vaultDir)} (scope: ${scope})`);
  print.info(`next: edit ${shortPath(path.join(vaultDir, 'purpose.md'))} to describe what this wiki is for.`);
  print.info(`then run \`rig wiki scan\` from anywhere inside ${shortPath(cwd)} to see what will be ingested.`);
}

function writeIfMissing(file: string, content: string) {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, content, 'utf8');
}

function shortPath(p: string): string {
  const home = os.homedir();
  if (p.startsWith(home + path.sep)) return '~' + p.slice(home.length);
  return p;
}
