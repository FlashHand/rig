# rig — Architecture (planning notes)

> Status: Draft v0 — 2026-05-17. Author: Bo Wang.
> Audience: future contributors + Claude Code when working in this repo.
> Scope: not exhaustive — captures the *shape* of rig as it grows beyond the original "yarn-workspaces + git" multi-repo tool.

---

## 0. What rig is, and is becoming

Originally: a thin CLI on top of `yarn workspaces + git` that lets you share code between projects without publishing to a registry (`rig init / add / dev / install / build / deploy / publish / sync / tag`). See `README.md` for that side of the story.

Now: rig is becoming the user's personal "outer brain" CLI — a single entry point for *non-application* automation that lives across all the user's projects. The first two extensions:

1. **`rig wiki *`** — Karpathy-style LLM Wiki ops over registered project directories, with a launchd daemon for periodic ingest/lint. See `wiki.md`.
2. **`rig fc *`** — Aliyun Function Compute deploy commands (planned, not yet specced). See `fc.md` (placeholder; written when work starts).

Both groups follow the same shape — local config in `~/.rig/`, per-project opt-in via `package.rig.json5`, optional background daemon, **macOS only** for v1.

---

## 1. Top-level command tree

```
rig
├── (existing: pkg/workspace ops)
│   ├── init / add / dev / install / preinstall / postinstall
│   ├── build / deploy / publish / sync / tag
│   ├── check / info / env
│   └── -v / --version
│
├── wiki                         # see wiki.md
│   ├── init [<path>]
│   ├── register [<path>] [--name <n>]
│   ├── unregister <name|path>
│   ├── list
│   ├── scan     [--wiki <n> | --all | <path>]
│   ├── fetch    <url>  [--wiki <n>]
│   ├── ingest   <path> [--wiki <n>] [--dry-run]
│   ├── query    "..."  [--wiki <n>]
│   ├── lint              [--wiki <n> | --all]
│   ├── index            [--wiki <n> | --all]   # qmd-only; no-op + warn otherwise
│   ├── install-skill / uninstall-skill         # symlink built-in Claude skill
│   ├── agent  list | use <claude|codex|pi>
│   └── daemon start | stop | status | logs [-f] | install | uninstall
│
└── fc                           # planned — Aliyun Function Compute (TBD)
```

Naming convention for new groups: `rig <noun> <verb>`. Single-verb top-level commands are grandfathered for the original pkg ops only.

---

## 2. Directory layout

### 2.1 Code layout (this repo)
```
lib/
├── rig/             # entry point (commander wiring)
├── <pkg-cmd>/       # existing: init, add, dev, install, build, deploy, ...
├── wiki/            # NEW — see wiki.md
│   ├── index.ts     # `rig wiki` commander subtree
│   ├── paths.ts platform.ts config.ts db.ts qmd.ts
│   ├── init.ts register.ts unregister.ts list.ts
│   ├── scan.ts fetch.ts ingest.ts query.ts lint.ts indexCmd.ts
│   ├── installSkill.ts uninstallSkill.ts
│   ├── agent/
│   │   ├── index.ts list.ts use.ts
│   │   ├── types.ts claude.ts codex.ts pi.ts
│   └── daemon/
│       ├── index.ts start.ts stop.ts status.ts logs.ts
│       ├── install.ts uninstall.ts runner.ts
├── fc/              # placeholder
├── classes/ utils/  # existing
```

### 2.2 User-side layout (`~/.rig/`)
```
~/.rig/
├── config.json5             # default agent, paths, feature flags
├── wiki.config.json5        # registered wikis + per-wiki schedule overrides
├── state.db                 # SQLite (better-sqlite3) — sha cache, last_run, ingest_log, FTS5 fallback
├── locks/                   # flock-based per-wiki advisory locks
├── logs/
│   ├── wiki-daemon.log
│   └── wikis/<wiki-name>/<op>-YYYY-MM-DD.log
└── cache/                   # scratch + agent sandbox copies
```

rig never writes outside `~/.rig/`, `~/Library/LaunchAgents/` (only `daemon install`), and the user's CWD.

### 2.3 Per-project layout
A project opts into `rig wiki` by either:
- Running `rig wiki register` from its root (auto-detects `harness/llm-wiki/` or asks for a path), or
- Adding a `wiki` block to its `package.rig.json5`.

The per-project wiki dir follows the layout from `wiki.md §2` — `purpose.md / schema.md / index.md / overview.md / log.md / reviews.md / raw/ / wiki/{sources,entities,concepts,synthesis,queries}/`.

---

## 3. Cross-cutting concerns

| Topic | Decision |
|---|---|
| Config format | JSON5 (matches rig conventions) |
| Config merge order | built-in < `~/.rig/config.json5` < `~/.rig/wiki.config.json5` < project `package.rig.json5` < CLI flag |
| Human output | `lib/print` (ora + chalk) |
| Machine output | `--json` flag on all `wiki` subcommands; daemon writes JSONL |
| Platform | **macOS only** for v1 (arm64 + x64). Linux/Windows: explicit error and exit |
| Daemon | macOS `launchd` user agent; Linux deferred to P5 |
| Agent | Requires one of `claude` / `codex` / `pi` on PATH for `ingest/query/lint`; v1 ships Claude only |
| qmd | Optional; auto-detected; functional fallback when absent |
| Safety | All writes diffed first; `raw/ / purpose.md / schema.md` never edited by rig (enforced in code) |
| Local DB | `better-sqlite3@12.10.0` pinned — see `wiki.md §13` |
| Node | `engines.node = ">=22 <27"` (driven by better-sqlite3 prebuilds) |

---

## 4. Roadmap

| Phase | Scope | State |
|---|---|---|
| P1 | `rig wiki init/register/list/scan/fetch/ingest/query/lint`, manual only, Claude adapter, qmd-aware | scaffolding now |
| P2 | `rig wiki daemon *` (launchd), per-wiki schedule, JSONL logs | after P1 runs ~2 weeks |
| P3 | Codex + pi-agent adapters; `rig wiki agent use <…>` switch | when a second agent is actually needed |
| P4 | `rig fc *` (Aliyun Function Compute) | independent track |
| P5 | Linux daemon, better logs UI | after macOS daemon is stable |

Out of scope (intentionally): web/desktop UI for wiki browsing (Obsidian + VSCode are enough); cross-machine wiki sync (git's job); cross-machine daemon coordination (each box runs its own).

---

## 5. Related docs

- `wiki.md` — full `rig wiki` design (commands, config, daemon, SQLite schema).
- `agents.md` — agent-CLI adapter interface + Claude/Codex/pi notes.
- `fc.md` — placeholder for future Aliyun FC work.

User-facing docs stay in `README.md` / `README_CN.md`. Files here capture design intent, not how-to.
