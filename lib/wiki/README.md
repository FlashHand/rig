# lib/wiki — `rig wiki *` source map

> Companion to `doc/architecture/wiki.md`. This file documents *what each source file does*; the architecture doc covers *why* and *how it fits together*.

Convention: **one file per subcommand**, plus a small set of shared infra files at the top of the directory. Subcommand groups (`agent`, `daemon`) live in their own subfolder, and each sub-subcommand also gets its own file there.

---

## Shared infrastructure

| File | Purpose |
|---|---|
| `index.ts` | Commander wiring. Builds the `rig wiki` subtree and attaches every action. Imported once from `lib/rig/index.ts`. |
| `paths.ts` | Centralized filesystem paths (`~/.rig/`, launchd plist, Claude skills dir). Override with `RIG_HOME`. Also exports the launchd label. |
| `platform.ts` | `requireMacOS()` — hard-exits with code 32 on non-Darwin platforms. v1 is macOS-only by decision; see roadmap P5. |
| `config.ts` | YAML read/write for `~/.rig/config.yml` (`RigConfig`, rig-global prefs) and `~/.rig/wikis.yml` (`Registry`, discovery-only path list). Per-vault settings live at `<vault>/.rig/config.yml` (`VaultConfig`). `loadWikiConfig()` composes the registry + each vault's config into the consumer-facing `WikiEntry[]`. `resolveWiki()` picks the target wiki for a command (flag → CWD walk → undefined). |
| `db.ts` | Lazy-loaded `better-sqlite3` singleton. WAL mode. Idempotent migrations on every open. Exposes `getDb()`, `recordLastRun()`, `getLastRun()`. |
| `qmd.ts` | Detects `qmd` on PATH, wraps `qmd query --json` and `qmd embed`. All callers must handle `installed=false` gracefully — qmd is optional. |

---

## Subcommands (one file each)

| File | Subcommand | What it does |
|---|---|---|
| `init.ts` | `rig wiki init [path]` | Bootstraps a fresh wiki dir: `purpose.md` + `schema.md` from templates, empty `index.md` / `overview.md` / `log.md` / `reviews.md`, `raw/` + five `wiki/<sub>/` dirs, and seeds `<vault>/.rig/config.yml` with default include / exclude / schedule. Idempotent — never overwrites existing files. Does **not** register. |
| `register.ts` | `rig wiki register [path]` | Ensures `<vault>/.rig/config.yml` exists (seeding defaults if absent), applies `--as <slug>` to its `name`, then appends the vault's absolute path to `~/.rig/wikis.yml`. Auto-detects the vault by walking up from CWD looking for `purpose.md`. |
| `unregister.ts` | `rig wiki unregister <nameOrPath>` | Drops the vault path from `~/.rig/wikis.yml`. `<vault>/.rig/config.yml` and disk content are untouched. |
| `list.ts` | `rig wiki list` | Prints a table: name, path, page count, last scan / ingest / lint. Banner row shows detected agent CLI, qmd status. |
| `scan.ts` | `rig wiki scan [path]` | Walks `include` globs + `raw/`, sha256-compares against the `source_sha` table in `state.db`. Emits NEW / MODIFIED / DELETED / RAW DRIFT report. Returns exit code 10 if any RAW DRIFT (raw/ files are immutable). No agent calls. |
| `fetch.ts` | `rig wiki fetch <url>` | (stub — P1) Agent-as-fetcher. Will WebFetch the URL via Claude adapter and write `raw/YYYY-MM-DD-<slug>.md` verbatim with frontmatter. **Never** summarizes. |
| `ingest.ts` | `rig wiki ingest <source>` | (stub — P1) Two-step CoT (analysis → generation). Sandbox-copies the wiki dir, runs Claude adapter, then host-diffs sandbox vs original to extract writes. Filters out edits to `raw/` / `purpose.md` / `schema.md`. `--dry-run` prints diff without applying. |
| `query.ts` | `rig wiki query "..."` | (stub — P1) Answer a question with `[[wikilink]]` citations. Prefers `qmd query --json` for retrieval; falls back to injecting `index.md` + `overview.md` + heuristic page picks. |
| `lint.ts` | `rig wiki lint` | (stub — P1) Walks the wiki for contradictions, orphans, stale claims, broken `sources[]` refs, reviews.md backlog. Writes `lint-report-YYYY-MM-DD.md`. Non-zero exit on severe findings (code 11). |
| `indexCmd.ts` | `rig wiki index` | qmd-only. Ensures the wiki's qmd collection exists, then runs `qmd embed`. When qmd is absent: warns and exits 0 (qmd is optional). Named `indexCmd` to avoid clashing with `index.ts`. |
| `installSkill.ts` | `rig wiki install-skill` | Locates rig's bundled `.claude/skills/rig-wiki/` inside the rigjs install, then symlinks it into `~/.claude/skills/rig-wiki`. Lets every machine with rig installed get the slash command without manual copy. |
| `uninstallSkill.ts` | `rig wiki uninstall-skill` | Removes the symlink. |

---

## `agent/` — Agent CLI adapter

One adapter per agent CLI. Only Claude Code is implemented in v1; others are stubs whose `detect()` works but `run()` throws `NotImplementedError`.

| File | Purpose |
|---|---|
| `index.ts` | Registers the `agent` Commander subtree. Re-exports `adapters` + `getAdapter` from `registry.ts` for callers that don't want to know about the registry split. |
| `registry.ts` | Constructs the singleton `adapters` array (one of each adapter class) and exports `getAdapter(name)`. Kept separate from `index.ts` to avoid a circular import with `list.ts`. |
| `types.ts` | The `AgentAdapter` interface and run-options/result types. All adapters obey it so the host can swap them. |
| `claude.ts` | **Full implementation.** Spawns `claude -p` (non-interactive) with `--allowedTools` derived from `allowWrite` + requested tools. Prepends a hard-coded system-prompt header that forbids editing `raw/` / `purpose.md` / `schema.md`. |
| `codex.ts` | Stub. Detection works; `run()` throws. Open questions on codex's permission flags live in `doc/architecture/agents.md §4`. |
| `pi.ts` | Stub. Same shape as codex. Upstream CLI name not yet fixed. |
| `list.ts` | `rig wiki agent list` — iterates `adapters`, calls `detect()`, prints a table. Marks the default agent with `*`. |
| `use.ts` | `rig wiki agent use <name>` — writes `~/.rig/config.yml` `wiki.defaultAgent`. Rejects un-implemented adapters with exit code 20. |

---

## `daemon/` — launchd-managed background runner

| File | Purpose |
|---|---|
| `index.ts` | Registers the `daemon` Commander subtree. |
| `install.ts` | Writes `~/Library/LaunchAgents/ai.flashhand.rig.wiki.plist` (with discovered node + rig entry paths), then `launchctl bootout` (idempotent) + `bootstrap`. |
| `uninstall.ts` | `launchctl bootout` + remove the plist. |
| `start.ts` | `launchctl bootstrap` only (use after `install` if you've stopped manually). |
| `stop.ts` | `launchctl bootout` only. |
| `status.ts` | `launchctl print gui/<uid>/<label>`, parses `state=` and `pid=`. |
| `logs.ts` | Tails `~/.rig/logs/wiki-daemon.log` (with optional `-f`). |
| `runner.ts` | **The launchd entry.** `launchctl` invokes `node <rigjs>/built/index.js wiki daemon runner`. v1: heartbeat-only loop that logs every 10 min and reloads `~/.rig/wikis.yml` + each vault's `.rig/config.yml`. P2 will add cron-based scan/lint scheduling and `auto-on-new` ingest rules. |

---

## Conventions

- Every action default-exports a function the Commander wiring imports as `fooAction`. Subcommand groups (`agent`, `daemon`) instead expose `registerXyzCommands(parent)`.
- Human output goes through `lib/print` (ora + chalk). Machine output is `--json` and goes to plain `console.log` (so JSON doesn't get ANSI-painted).
- Anything that writes to disk under `~/.rig/` first calls a helper in `config.ts` that `mkdir -p`s the home dir. Subcommands don't open-code path creation.
- The DB and qmd helpers are lazy-loaded so subcommands that don't need them (e.g. `init`, `agent list`) start instantly and don't drag in the native binary.
- No subcommand calls another subcommand directly — they share state via `config.ts` + `db.ts`. This keeps each file a leaf.
