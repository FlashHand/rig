import fs from 'fs';
import path from 'path';
import print from '../print';

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
- wiki/, index.md, overview.md, log.md, reviews.md: LLM is sole author

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
- kebab-case; no spaces; no dates in wiki/ filenames
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

// What lives inside the wiki dir but must not enter git / Obsidian Sync:
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

export default function wikiInit(givenPath?: string): void {
  const root = path.resolve(givenPath || process.cwd());
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

  for (const sub of SUBDIRS) {
    const d = path.join(root, 'wiki', sub);
    fs.mkdirSync(d, { recursive: true });
    writeIfMissing(path.join(d, '.gitkeep'), '');
  }

  print.succeed(`wiki initialized at ${root}`);
  print.info(`next: edit purpose.md + schema.md, then \`rig wiki register ${shortPath(root)}\``);
  print.info('on a new device, after cloning, run `rig wiki rebuild` to refresh local caches.');
}

function writeIfMissing(file: string, content: string) {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, content, 'utf8');
}

function shortPath(p: string) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p;
}
