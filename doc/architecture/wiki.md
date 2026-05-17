# rig wiki — Design

> Status: Draft v0 — 2026-05-17.
> Source spec: see `harness/llm-wiki/llm-wiki solution.md` §1–§13 in the Maestro repo (it remains the requirements doc; this file is the rig-side implementation contract).

---

## 1. Goal

Bring Karpathy-style LLM Wiki ops to *any* project on this machine, with a single CLI entry point and an optional launchd daemon for periodic ingest/lint. `rig` is the host; per-project wikis live in each project's own tree (default: `harness/llm-wiki/`).

---

## 2. Per-wiki directory layout (the projects rig acts on)

```
<project>/<wiki>/                 # default: harness/llm-wiki
├── purpose.md       # scope (human-only, LLM read-only)
├── schema.md        # structure rules (human-only, LLM read-only)
├── index.md         # catalog (LLM-maintained)
├── overview.md      # narrative summary (LLM-maintained)
├── log.md           # append-only op log (LLM appends)
├── reviews.md       # uncertain items LLM flagged (LLM appends, human resolves)
├── raw/             # external immutable source material (LLM read-only)
└── wiki/            # LLM-authored
    ├── sources/     # one page per raw/<source>
    ├── entities/    # people, orgs, products, places
    ├── concepts/    # abstract ideas
    ├── synthesis/   # cross-source integration
    └── queries/     # archived Q&A worth keeping
```

Filenames are kebab-case; `wiki/**` no dates in names; `raw/**` keeps `YYYY-MM-DD-` prefix.

Frontmatter for every `wiki/**` page:
```yaml
---
type: source | entity | concept | synthesis | query
sources: [<source-slug>, ...]
source-sha: <sha>            # source pages only
source-path: raw/... | <relpath-in-project>
ingested-at: <ISO>
last-updated: <ISO>
---
```

Hard rules enforced by rig:
- Never edit `raw/`, `purpose.md`, `schema.md`.
- `raw/` file sha drift = `RAW DRIFT` error, not a re-ingest trigger.
- Living-doc paths (`include` glob) sha drift = `MODIFIED`, proposes re-ingest.

---

## 3. Commands

> All commands accept `--json` (machine output) and `--wiki <name>` (target a registered wiki). With neither, the command resolves the wiki by walking up from CWD; failing that, errors out.

### `rig wiki init [<path>]`
Bootstrap a fresh wiki dir under `<path>` (default CWD):
- creates `purpose.md`, `schema.md` from templates
- creates empty `index.md`, `overview.md`, `log.md`, `reviews.md`
- creates `raw/` and the five `wiki/<subdir>/` dirs (each with `.gitkeep`)
- does **not** register; for that, run `rig wiki register`

### `rig wiki register [<path>] [--name <n>] [--force]`
Append/replace an entry in `~/.rig/wiki.config.json5`:
```json5
{ name, path, project, include, exclude, schedule, ingestRules }
```
- `--name` default: project `package.json` name, fallback to path basename
- if project has a `package.rig.json5`, also writes a `wiki:` block back to it (bidirectional)
- duplicates rejected unless `--force`

### `rig wiki unregister <name|path>`
Remove from `~/.rig/wiki.config.json5`. Disk wiki content untouched.

### `rig wiki list`
Table of registered wikis with page counts + last scan/ingest/lint times. Banner row: detected agent CLI, qmd status, daemon state.

### `rig wiki scan [--wiki <n> | --all | <path>]`
Walk `include` globs + `raw/`. Diff file sha vs `state.db.source_sha`. Output four-state report (NEW / MODIFIED / DELETED / RAW DRIFT / UNCHANGED). No agent calls.

### `rig wiki fetch <url> [--wiki <n>]`
Agent-as-fetcher: verbatim download → `raw/YYYY-MM-DD-<slug>.md` + frontmatter (`source-url`, `fetched-at`, `fetcher`, `content-sha`). Never summarizes — that's `ingest`'s job.

### `rig wiki ingest <path> [--wiki <n>] [--dry-run]`
Two-step CoT (`analysis` → `generation`) inside an agent sandbox (copy-on-write `~/.rig/cache/sandbox/<wiki>/<run-id>/`):
1. inject `purpose.md` + `schema.md` + `overview.md` + `index.md` + source → analysis output (entities/concepts/contradictions/reviews)
2. feed analysis back → agent writes `wiki/sources/<slug>.md` + updates related entity/concept pages + `index.md` + `overview.md` + `log.md` + (if any) `reviews.md`
3. host diffs sandbox vs original → `--dry-run` prints diff; otherwise prompts to apply
4. on apply: trigger incremental `qmd embed` (if qmd installed)

### `rig wiki query "..." [--wiki <n>]`
With qmd: `qmd query --json` → top-k → agent synthesizes answer with `[[wikilink]]` citations.
Without qmd: inject `purpose.md` + `index.md` + `overview.md` + heuristically-picked pages.

### `rig wiki lint [--wiki <n> | --all]`
Health check — contradictions, orphans, stale claims, broken `sources[]` refs, reviews.md backlog. Output: `<wiki>/lint-report-YYYY-MM-DD.md` (gitignored by default). Severe findings → non-zero exit.

### `rig wiki index [--wiki <n> | --all]`
Equivalent to `qmd collection add ... && qmd embed`. If qmd not installed: warn and no-op (exit 0; qmd is optional).

### `rig wiki install-skill / uninstall-skill`
Symlink rig's bundled Claude skill (`.claude/skills/rig-wiki/`) into `~/.claude/skills/rig-wiki/`. Lets every machine that has `rig` installed get the slash command without manual copy.

### `rig wiki agent list | use <name>`
- `list`: prints which agent CLIs are on PATH (claude/codex/pi), their versions, and which is default.
- `use <name>`: writes `wiki.defaultAgent` in `~/.rig/config.json5`. v1 only accepts `claude`.

### `rig wiki daemon start | stop | status | logs [-f] | install | uninstall`
See §5.

---

## 4. Config files

### `~/.rig/config.json5`
```json5
{
  wiki: {
    defaultAgent: 'claude',
    qmd: { enabled: 'auto' },      // 'auto' | 'on' | 'off'
    logRotateMB: 50
  }
}
```

### `~/.rig/wiki.config.json5`
```json5
{
  defaults: {
    schedule: { scan: '0 */6 * * *', lint: '0 3 * * *', ingest: null }
  },
  wikis: [
    {
      name: 'maestro',
      path: '/abs/path/.../harness/llm-wiki',
      project: '/abs/path/.../maestro',
      include: ['harness/dev/**', 'harness/projects/**'],
      exclude: ['harness/llm-wiki/**'],
      schedule: { scan: '0 */6 * * *', lint: '0 3 * * *' },
      ingestRules: [
        { match: 'raw/**/*.md', mode: 'auto-on-new' },
        { match: 'harness/dev/**/*.md', mode: 'propose-only' }
      ]
    }
  ]
}
```

### Project `package.rig.json5` (`wiki` block)
```json5
{
  wiki: {
    name: 'maestro',
    path: 'harness/llm-wiki',
    include: ['harness/dev/**'],
    exclude: ['harness/llm-wiki/**']
  }
}
```

Merge order: built-in defaults < `~/.rig/config.json5` < `~/.rig/wiki.config.json5` < project `package.rig.json5` < CLI flag.

---

## 5. Daemon (macOS launchd)

`rig wiki daemon install` writes `~/Library/LaunchAgents/ai.flashhand.rig.wiki.plist` and bootstraps via `launchctl bootstrap gui/<uid> <plist>`.

Plist (template):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ai.flashhand.rig.wiki</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>{{RIG_BUILT_INDEX}}</string>
    <string>wiki</string><string>daemon</string><string>runner</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>{{HOME}}/.rig/logs/wiki-daemon.log</string>
  <key>StandardErrorPath</key><string>{{HOME}}/.rig/logs/wiki-daemon.log</string>
</dict></plist>
```

Runner loop:
- read `~/.rig/wiki.config.json5`, register `cron` jobs per wiki for `schedule.scan` / `schedule.lint`
- on tick: run subcommand internally (no fork), write JSONL to `~/.rig/logs/wikis/<wiki>/<op>-YYYY-MM-DD.log`
- `ingestRules.mode === 'auto-on-new'` matches on the latest scan → `ingest --apply` (only when sandbox-diff is sub-policy)
- `propose-only` matches → write `<wiki>/proposals/<source>.diff` for human review
- never retry; never backfill missed runs

Control commands:
- `daemon start/stop`: `launchctl bootstrap` / `bootout`
- `daemon status`: parse `launchctl print gui/<uid>/ai.flashhand.rig.wiki`
- `daemon logs [-f]`: tail `~/.rig/logs/wiki-daemon.log`
- `daemon install/uninstall`: write/remove plist

---

## 6. Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 10 | scan found RAW DRIFT |
| 11 | lint found severe items |
| 20 | agent CLI missing or version too low |
| 21 | qmd required (only with `--require-qmd`) but absent |
| 30 | config file corrupt |
| 31 | wiki lock contention (another rig process holds the lock) |
| 32 | not on macOS |
| 1 | other error |

`--json` output shape: `{ ok: boolean, code: number, data?: any, error?: { message, hint } }`.

---

## 7. SQLite schema (`~/.rig/state.db`)

Single file via `better-sqlite3@12.10.0`. WAL mode. Migrations are idempotent on every open.

```sql
CREATE TABLE IF NOT EXISTS source_sha (
  wiki TEXT NOT NULL, path TEXT NOT NULL,
  sha TEXT NOT NULL, mtime INTEGER NOT NULL,
  PRIMARY KEY (wiki, path)
);
CREATE TABLE IF NOT EXISTS last_run (
  wiki TEXT NOT NULL, op TEXT NOT NULL,
  ts INTEGER NOT NULL, exit_code INTEGER NOT NULL,
  PRIMARY KEY (wiki, op)
);
CREATE TABLE IF NOT EXISTS ingest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wiki TEXT NOT NULL, source_path TEXT NOT NULL,
  ts INTEGER NOT NULL, diff_hash TEXT NOT NULL,
  applied INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts5 USING fts5(
  wiki, slug, body, tokenize='unicode61 remove_diacritics 2'
);
```

Cross-process locks are **not** SQLite locks — they're `fcntl` flocks on `~/.rig/locks/<wiki>.lock`. Failure to acquire = exit `31`.

---

## 8. qmd integration

Auto-detect via `which qmd` at startup.

With qmd:
- `query`: `qmd query --json "..."` (auto-runs `qmd mcp` daemon)
- `ingest` end-step: `qmd embed --collection <wiki>` (incremental)
- `lint`: walk via `qmd ls --collection <wiki>`

Without qmd:
- `query` falls back to feeding `index.md + overview.md + heuristic` to the agent
- `index` is a no-op + warn
- `pages_fts5` (in `state.db`) is populated on every ingest as a degraded local search backend; used by qmd-less `query`

---

## 9. Agent integration

See `agents.md`. Single `AgentAdapter` interface; v1 implements Claude Code only. All adapters run inside a sandbox-copy of the wiki dir, then the host diffs the sandbox against the original to detect/apply writes.

---

## 10. Built-in Claude skill (`.claude/skills/rig-wiki/`)

Ships inside the rig npm tarball (`package.json` `files` includes `.claude/skills/**`). User runs `rig wiki install-skill` once per machine — symlinks `<rigjs-install>/.claude/skills/rig-wiki` to `~/.claude/skills/rig-wiki`. Claude Code picks it up next session.

The skill itself is a thin wrapper: its instructions tell Claude when to invoke which `rig wiki *` command. It does not duplicate the wiki logic.
