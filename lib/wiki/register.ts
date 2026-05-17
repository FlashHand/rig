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

  const entry: WikiEntry = {
    name,
    path: wikiPath,
    project: project || undefined,
    include: ['**/*.md'],
    exclude: [`${path.basename(wikiPath)}/**`, 'node_modules/**', '.git/**'],
    schedule: { scan: '0 */6 * * *', lint: '0 3 * * *' },
    ingestRules: [{ match: 'raw/**/*.md', mode: 'auto-on-new' }],
  };

  if (existing >= 0) cfg.wikis[existing] = entry;
  else cfg.wikis.push(entry);
  saveWikiConfig(cfg);

  // bidirectional: also write to project's package.rig.json5 if present
  if (project) writeProjectWikiBlock(project, name, wikiPath);

  print.succeed(`registered wiki "${name}" -> ${wikiPath}`);
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

function writeProjectWikiBlock(project: string, name: string, wikiPath: string): void {
  const file = path.join(project, 'package.rig.json5');
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try { cfg = JSON5.parse(fs.readFileSync(file, 'utf8')); } catch { cfg = {}; }
  }
  cfg.wiki = { name, path: path.relative(project, wikiPath) };
  fs.writeFileSync(file, JSON5.stringify(cfg, null, 2) + '\n', 'utf8');
}
