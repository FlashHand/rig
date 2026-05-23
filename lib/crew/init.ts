import fs from 'fs';
import path from 'path';
import print from '../print';
import { CrewEntry, DEFAULT_CREW_ROOT, DEFAULT_ROLES, loadCrewConfig, saveCrewConfig, normalizeCrew, shortPath } from './config';
import { ensureCrewVault } from './vault';
import { crewPaths } from './paths';

interface InitOpts {
  vault: string;
  as?: string;
  root?: string;
  allowProjectVault?: boolean;
}

export default function crewInit(opts: InitOpts): void {
  if (!opts.vault) {
    print.error('missing --vault <path>');
    process.exit(1);
  }
  const vault = path.resolve(opts.vault);
  if (isUnderProjects(vault) && !opts.allowProjectVault) {
    print.error('refusing to initialize a crew vault under projects/<submodule>. Pass --allow-project-vault only if you understand the data exposure risk.');
    process.exit(1);
  }
  fs.mkdirSync(vault, { recursive: true });
  const name = opts.as || path.basename(vault) || 'personal';
  const cfg = loadCrewConfig();
  const idx = cfg.crews.findIndex(c => c.name === name);
  const existing = idx >= 0 ? normalizeCrew(cfg.crews[idx]) : undefined;
  const root = opts.root || existing?.root || DEFAULT_CREW_ROOT;
  const entry: CrewEntry = normalizeCrew({
    name,
    vault,
    root,
    defaultExecutor: existing?.defaultExecutor || 'claude',
    mode: 'leader-first',
    dashboard: path.join(root, 'Team-Dashboard.md'),
    state: existing?.state || { backend: 'json' },
    roles: existing?.roles || DEFAULT_ROLES,
    projects: existing?.projects || [],
  });

  if (idx >= 0) cfg.crews[idx] = entry;
  else cfg.crews.push(entry);
  if (!cfg.defaultCrew) cfg.defaultCrew = name;
  saveCrewConfig(cfg);
  writeUserRulesIfMissing();
  ensureCrewVault(entry);
  print.succeed(`crew "${name}" initialized at ${shortPath(vault)}`);
  print.info(`agent next: use \`rig crew "<user request>"\` or update ${path.join(root, 'Current-Goal.md')} when coordinating this Vault`);
}

function isUnderProjects(p: string): boolean {
  const workspaceRoot = findOvermindRoot(process.cwd()) || findOvermindRoot(p);
  if (!workspaceRoot) return false;
  const projectsDir = path.join(workspaceRoot, 'projects');
  return p === projectsDir || p.startsWith(projectsDir + path.sep);
}

function findOvermindRoot(start: string): string | undefined {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md')) && fs.existsSync(path.join(dir, 'projects'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function writeUserRulesIfMissing(): void {
  if (fs.existsSync(crewPaths.userRules)) return;
  fs.writeFileSync(crewPaths.userRules, `# RIG User Rules

## Credential Sources

- Default credential doc: <path-to-private-keychain-or-env-doc>
- Prefer env vars or system keychain for actual passwords.
- Never copy passwords, cookies, auth storage, production traces, or real user data into project repos.

## Account Aliases

| Alias | Source | Usage |
|---|---|---|
| \`<project>.staging.viewer\` | <env/keychain/doc section> | Read-only staging E2E |
| \`<project>.production.readonly\` | <env/keychain/doc section> | Production read-only reproduction, \`@prod-readonly\` only |

## Research Output Policy

- Default research report directory: <crew-root>/Researcher/Reports
- Resolve relative paths from the current crew Vault root.
- If the user requests an explicit output directory, use that directory unless it is inside a project submodule or contains secrets.
- If neither the user request nor this section gives a clear destination, ask Lead to create an Inbox question instead of guessing.

| Scope | Directory | Notes |
|---|---|---|
| default | <crew-root>/Researcher/Reports | General research reports |
| project:<name> | <crew-root>/Projects/<name>/Research | Project-specific research notes |

## Production Rules

- Production tests are opt-in only.
- Use read-only test accounts only.
- Do not create, update, delete, pay, publish, deploy, or message real users.

## Frontend Testing Rules

- Default to PRD-scoped Playwright E2E for frontend/UI behavior.
- Do not add frontend unit tests by default.
- Do not add frontend integration tests by default.
- Do not run full historical E2E unless risk requires it.
- Always report what was run and what was intentionally skipped.
`, 'utf8');
}
