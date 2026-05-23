# lib/wiki — `rig wiki *` source map

> Companion to `doc/architecture/wiki.md`. This file documents *what each source file does*; the architecture doc covers *why* and *how it fits together*.

Convention: **one file per subcommand**, plus a small set of shared infra files at the top of the directory. Subcommand groups (`agent`, `daemon`) live in their own subfolder, and each sub-subcommand also gets its own file there.

---

## Shared infrastructure

| File | Purpose |
|---|---|
| `index.ts` | Commander wiring. Builds the `rig wiki` subtree and attaches every action. Imported once from `lib/rig/index.ts`. |
| `paths.ts` | Centralized filesystem paths (`~/.rig/`, launchd plist, Claude skills dir). Override with `RIG_HOME`. Also exports the launchd label and `vaultConfigPath(vaultDir)` for `<vault>/.rig/config.yml`. |
| `platform.ts` | `requireMacOS()` — hard-exits with code 32 on non-Darwin platforms. v1 is macOS-only by decision; see roadmap P5. |
| `config.ts` | YAML read/write for `~/.rig/config.yml` (`RigConfig`, rig-global prefs) and `<vault>/.rig/config.yml` (`VaultConfig`). `resolveVault()` walks up from CWD looking for a `.rig/config.yml`; `requireVault()` is the CLI-friendly variant that exits with a clear error on miss. **No global registry** — vault discovery is purely CWD-based. |
| `db.ts` | Lazy-loaded `better-sqlite3` singleton. WAL mode. Idempotent migrations on every open. Exposes `getDb()`, `recordLastRun()`, `getLastRun()`. |
| `qmd.ts` | Detects `qmd` on PATH, wraps `qmd query --json` and `qmd embed`. All callers must handle `installed=false` gracefully — qmd is optional. |

---

## Subcommands (one file each)

| File | Subcommand | What it does |
|---|---|---|
| `init.ts` | `rig wiki init <path>` | Bootstraps a fresh vault: `purpose.md` + `schema.md` from templates, empty `index.md` / `overview.md` / `log.md` / `reviews.md`, `raw/` + five page-tree dirs (`sources/ entities/ concepts/ synthesis/ queries/`) directly at the vault root (no inner `wiki/` subdir), and seeds `<vault>/.rig/config.yml`. Idempotent — never overwrites existing files. |
| `scan.ts` | `rig wiki scan` | Walks `include` globs from the vault's `root` (default: vault's parent dir), sha256-compares against the `source_sha` table in `state.db`. Auto-skips hidden segments (dot-prefixed) and gitignored paths. Emits NEW / MODIFIED / DELETED / RAW DRIFT report. Returns exit code 10 if any RAW DRIFT. No agent calls. |
| `fetch.ts` | `rig wiki fetch <url>` | Verbatim download URL into `raw/YYYY-MM-DD-<slug>.md`. Default path uses Node fetch + HTML-strip; `--via-agent` uses Claude WebFetch. Never summarizes — that's `ingest`'s job. |
| `ingest.ts` | `rig wiki ingest <source>` | Two-step CoT (analysis → generation). Spawns Claude in the vault dir, then host-diffs the writable surface (`sources/ entities/ concepts/ synthesis/ queries/` + `index.md` / `overview.md` / `log.md` / `reviews.md`) to extract writes. Filters out edits to `raw/` / `purpose.md` / `schema.md`. `--dry-run` prints diff without applying. |
| `query.ts` | `rig wiki query "..."` | Vector retrieval via qmd. `--synth` adds a Claude-synthesized paragraph with `[[wikilink]]` citations. |
| `lint.ts` | `rig wiki lint` | Walks the vault for frontmatter completeness, contradictions, orphans, broken `[[wikilinks]]`, missing `raw/` sources, reviews.md backlog. Writes `lint-report-YYYY-MM-DD.md`. Exit 11 on severe findings. |
| `indexCmd.ts` | `rig wiki index` | qmd-only. Ensures the vault's qmd collection exists, then runs `qmd embed`. Named `indexCmd` to avoid clashing with `index.ts`. |
| `rebuild.ts` | `rig wiki rebuild` | Clear `source_sha` rows + drop the per-vault qmd store + full re-embed. Use after switching embed model or onto a new device. |
| `installSkill.ts` | `rig wiki install-skill [--project]` | Default: symlink bundled `rig-wiki` / `rig-crew` skills into `~/.claude/skills/`. With `--project`: install into `<cwd>/.claude/skills/` AND `<cwd>/.agents/skills/` (per-project override, covers both Claude Code and Codex). |
| `uninstallSkill.ts` | `rig wiki uninstall-skill [--project]` | Mirror of install-skill. |

### Commands intentionally NOT in this set

`register`, `unregister`, `list` — there is no global registry. Vault discovery is by walking up from CWD looking for `<dir>/.rig/config.yml`. If you find yourself wanting to "list all wikis on this machine," that's a deliberate non-feature: each project's vault stands alone.

`--wiki <name>` and `--all` flags — gone everywhere. A command operates on whatever vault `resolveVault()` finds from CWD, or errors with a clear message.

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
| `runner.ts` | **The launchd entry.** `launchctl` invokes `node <rigjs>/built/index.js wiki daemon runner`. v1: heartbeat-only loop that tries to `resolveVault()` from its CWD at startup, logs the result, then ticks every 10 min. P2 will accept a `wiki.watchedVaults` list in `~/.rig/config.yml` and run cron-based scan/lint/ingest per entry. |

---

## Conventions

- Every action default-exports a function the Commander wiring imports as `fooAction`. Subcommand groups (`agent`, `daemon`) instead expose `registerXyzCommands(parent)`.
- Human output goes through `lib/print` (ora + chalk). Machine output is `--json` and goes to plain `console.log` (so JSON doesn't get ANSI-painted).
- Anything that writes to disk under `~/.rig/` first calls a helper in `config.ts` that `mkdir -p`s the home dir. Subcommands don't open-code path creation.
- The DB and qmd helpers are lazy-loaded so subcommands that don't need them (e.g. `init`, `agent list`) start instantly and don't drag in the native binary.
- No subcommand calls another subcommand directly — they share state via `config.ts` + `db.ts`. This keeps each file a leaf.
