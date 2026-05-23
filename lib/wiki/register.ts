import fs from 'fs';
import path from 'path';
import JSON5 from 'json5';
import print from '../print';
import { loadWikiConfig, saveWikiConfig, WikiEntry } from './config';

interface RegisterOpts {
  as?: string;
  force?: boolean;
}

export default function wikiRegister(givenPath: string | undefined, opts: RegisterOpts): void {
  const wikiPath = path.resolve(givenPath || detectWikiPath(process.cwd()) || process.cwd());
  if (!fs.existsSync(wikiPath)) {
    print.error(`path does not exist: ${wikiPath}`);
    process.exit(1);
  }
  const project = detectProjectRoot(wikiPath);
  const name = (opts.as || detectName(project, wikiPath)).trim();
  if (!name) {
    print.error('failed to derive a wiki name; pass --name <n>');
    process.exit(1);
  }

  const cfg = loadWikiConfig();
  const existing = cfg.wikis.findIndex(w => w.name === name);
  if (existing >= 0 && !opts.force) {
    print.error(`wiki "${name}" already registered at ${cfg.wikis[existing].path}; pass --force to overwrite`);
    process.exit(1);
  }

  // Read project-local overrides (include / exclude / ingestRules / schedule)
  // from package.rig.json5 if present. The user is the authoritative voice for
  // what gets scanned. Falls back to safe defaults only when fields are absent.
  const projectWiki = project ? readProjectWikiBlock(project) : null;
  const wikiBasename = path.basename(wikiPath);
  const entry: WikiEntry = {
    name,
    path: wikiPath,
    project: project || undefined,
    include: projectWiki?.include ?? ['**/*.md'],
    exclude: projectWiki?.exclude ?? [`${wikiBasename}/**`, 'node_modules/**', '.git/**'],
    schedule: projectWiki?.schedule ?? { scan: '0 */6 * * *', lint: '0 3 * * *' },
    ingestRules: projectWiki?.ingestRules ?? [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
  };

  if (existing >= 0) cfg.wikis[existing] = entry;
  else cfg.wikis.push(entry);
  saveWikiConfig(cfg);

  // bidirectional: write back to project's package.rig.json5 — preserve any
  // existing include/exclude/ingestRules/schedule fields the user authored.
  if (project) writeProjectWikiBlock(project, name, wikiPath, projectWiki);

  print.succeed(`registered wiki "${name}" -> ${wikiPath}`);
}

interface ProjectWikiBlock {
  name?: string;
  path?: string;
  include?: string[];
  exclude?: string[];
  schedule?: { scan?: string; lint?: string; ingest?: string | null };
  ingestRules?: { match: string; mode: 'auto-on-new' | 'propose-only' }[];
}

function readProjectWikiBlock(project: string): ProjectWikiBlock | null {
  const file = path.join(project, 'package.rig.json5');
  if (!fs.existsSync(file)) return null;
  try {
    const cfg = JSON5.parse(fs.readFileSync(file, 'utf8'));
    const wiki = cfg && typeof cfg === 'object' && cfg.wiki;
    return wiki && typeof wiki === 'object' ? wiki as ProjectWikiBlock : null;
  } catch { return null; }
}

function detectWikiPath(start: string): string | undefined {
  const candidates = ['harness/llm-wiki', 'wiki'];
  let dir = start;
  while (true) {
    for (const c of candidates) {
      const cand = path.join(dir, c);
      if (fs.existsSync(path.join(cand, 'purpose.md'))) return cand;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function detectProjectRoot(wikiPath: string): string | undefined {
  let dir = wikiPath;
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function detectName(project: string | undefined, wikiPath: string): string {
  if (project) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
      if (pkg && typeof pkg.name === 'string') return pkg.name.replace(/^@.*\//, '');
    } catch { /* fall through */ }
  }
  return path.basename(path.dirname(wikiPath));
}

function writeProjectWikiBlock(
  project: string,
  name: string,
  wikiPath: string,
  existingWiki: ProjectWikiBlock | null,
): void {
  const file = path.join(project, 'package.rig.json5');
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try { cfg = JSON5.parse(fs.readFileSync(file, 'utf8')); } catch { cfg = {}; }
  }
  // Always update name + path (those are derived from invocation). Preserve
  // every other field the user authored (include / exclude / schedule /
  // ingestRules / anything else they put in there).
  cfg.wiki = {
    ...(existingWiki || {}),
    name,
    path: path.relative(project, wikiPath),
  };
  fs.writeFileSync(file, JSON5.stringify(cfg, null, 2) + '\n', 'utf8');
}
