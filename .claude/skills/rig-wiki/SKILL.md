---
name: rig-wiki
description: Karpathy-style LLM Wiki ops over any project registered with `rig wiki`. Use to scan a project for new sources, fetch a URL into raw/, ingest a source (two-step CoT), query the wiki, lint for contradictions/orphans, or rebuild local caches on a new device. Requires the `rig` CLI on PATH; optional but recommended: `qmd` for retrieval. Plays well inside an Obsidian vault.
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, node]
    os: [darwin]
---

# rig-wiki

Thin wrapper over `rig wiki *`. Use when the user wants to:

- **Scan** a project for new sources to ingest.
- **Fetch** a URL verbatim into the wiki's `raw/`.
- **Ingest** a source (two-step CoT: analysis → generation), with a diff preview.
- **Query** the wiki (uses qmd if installed; otherwise injects `index.md` + heuristically-picked pages).
- **Lint** the wiki (contradictions, orphans, stale claims, broken `sources[]` refs).
- **Rebuild** local caches on a new device or after switching embed models.

## Install

`npm i -g rigjs` (or `yarn global add rigjs`) auto-symlinks the skill into `~/.claude/skills/rig-wiki/SKILL.md`. Restart Claude Code to pick it up.

If the auto-link didn't run:

```bash
rig wiki install-skill          # idempotent
rig wiki install-skill --force  # re-link if the target points elsewhere
```

For local dev/iteration (edit rig source, install over the registry version):

```bash
rig install-local               # yarn build + npm i -g . from rig repo
rig -v                          # confirm new version
rig -c                          # confirm versionCode
```

A later `npm i -g rigjs` cleanly overrides the local install.

To remove the skill link: `rig wiki uninstall-skill`.

## Quickstart

Project already registered (`rig wiki list` shows it):

- `rig wiki scan`              → NEW/MODIFIED/DELETED report
- `rig wiki fetch <url>`       → verbatim download into `raw/YYYY-MM-DD-<slug>.md`
- `rig wiki ingest <path>`     → two-step CoT, then prompt to apply diff
- `rig wiki query "..."`       → answer with `[[wikilink]]` citations
- `rig wiki lint`              → produce `lint-report-YYYY-MM-DD.md`
- `rig wiki rebuild`           → refresh local sha index + qmd vectors

Not registered yet:

- `rig wiki register` from project root → adds entry to `~/.rig/wiki.config.json5`
- Or `rig wiki init <subdir>` to bootstrap a fresh wiki dir.

> Don't run `rig wiki init` in a project root — pass a subdir (`wiki`, `knowledge`, `harness/llm-wiki`, …), otherwise the templates litter the root.

## Output

All commands accept `--json` for machine-readable output (`{ ok, code, data?, error? }`).

## Hard rules

- **Never** edit `raw/`, `purpose.md`, or `schema.md` directly — human-authored.
- **Never** run `ingest` against a path that isn't a registered wiki source.
- **`scan` exit code 10** means a `raw/` file changed — error, not a re-ingest trigger.
- **Never** commit `.qmd/index.sqlite*` or `~/.cache/qmd/`. `init` writes a `.gitignore` that blocks the project-local case; the global cache is in `~/.cache/qmd/` and stays out by location.

## When NOT to use this skill

- User just wants to read a wiki page → use Read.
- User wants to write `purpose.md` / `schema.md` / `raw/` → human-only; refuse and explain.
- User is not in a `rig`-aware project → `rig wiki register` first.
- Project is on Linux/Windows → `rig wiki` is macOS-only in v1.

## qmd integration (vector retrieval)

`rig wiki` auto-detects qmd via `which qmd`.

**With qmd:**

- `rig wiki query` runs `qmd query --json` and the agent synthesizes with `[[wikilink]]` citations.
- After `rig wiki ingest`, the wiki's qmd collection is incrementally re-embedded.
- `rig wiki index` triggers a full re-embed.

**Without qmd:**

- `rig wiki index` warns + exits 0 (qmd is optional).
- `query` falls back to feeding `index.md + overview.md + heuristic page picks` to the agent.
- BM25 search is still available via the FTS5 virtual table in `~/.rig/state.db`.

Install qmd: `npm i -g @tobilu/qmd`.

### qmd on-disk model — what to sync and what NOT to sync

qmd stores the index in a **single SQLite file** with the `sqlite-vec` extension. Two layouts:

- **Global (default):** `~/.cache/qmd/index.sqlite` (honors `XDG_CACHE_HOME`).
- **Project-local:** if a `.qmd/index.yaml` exists in cwd or an ancestor, the DB lives at `.qmd/index.sqlite` next to it.

Either way, qmd **never modifies your markdown** — no frontmatter writes, no sidecars.

**Do NOT sync the SQLite index via git or Obsidian Sync.** Reasons:

1. **Non-deterministic.** Embeddings come from a local llama.cpp GGUF model (default `embeddinggemma-300M`); floats vary by CPU/GPU backend (Metal vs Vulkan vs CPU). SQLite page layout adds more drift.
2. **Binary blob.** Every embed produces a new blob — git history explodes; Obsidian Sync only does full-file conflict-resolution.
3. **Cache by design.** `~/.cache/qmd/` is the conventional "safe to delete" location. qmd upstream gives no sync guidance.
4. **Model swap = full rebuild.** Switch from `embeddinggemma-300M` to anything else and old vectors are useless — `QMD_EMBED_MODEL` must match across devices.

**Sync only the markdown source files** (`raw/`, `wiki/**`, `purpose.md`, `schema.md`, `index.md`, `overview.md`, `log.md`, `reviews.md`). Rebuild caches on each device.

### New-device flow

On a fresh machine after `git clone` (or after `obsidian sync` materializes the vault):

```bash
# 1. Install rig + qmd
npm i -g rigjs @tobilu/qmd

# 2. Register the wiki (or rely on the auto-registered entry in package.rig.json5)
rig wiki register <path>      # if not already registered globally

# 3. Rebuild local caches
rig wiki rebuild              # clears ~/.rig/state.db rows + runs `qmd embed`

# 4. Baseline the sha index
rig wiki scan                 # first scan will report everything as NEW; that's expected

# 5. Sanity check
rig wiki query "what is this wiki about?"
```

First `qmd embed` will download the default model into `~/.cache/qmd/models/` (a few hundred MB). Pin `QMD_EMBED_MODEL` in `~/.zshrc` (or per-project `.envrc`) to guarantee cross-machine consistency.

## Obsidian compatibility

`rig wiki` produces a plain-markdown vault. Drop the wiki directory inside an Obsidian vault (or treat the whole project as one) and Obsidian handles it natively:

- ✅ Nested folders (`wiki/sources/...`, `wiki/concepts/...`) — Obsidian browses them as-is.
- ✅ YAML frontmatter — rig wiki's schema requires it; Obsidian renders it.
- ✅ `[[wikilink]]` — rig wiki enforces them; Obsidian builds the backlink graph automatically.
- ⚠️ qmd ignores wikilinks (treats them as plain text in FTS5) — that's a retrieval-level detail; doesn't affect Obsidian browsing.
- ⚠️ `.obsidian/workspace.json` should be in `.gitignore` (rig's `init` already covers the qmd cache; add the Obsidian workspace file separately if you want one vault per machine).

## Agent

`rig wiki` defaults to Claude Code (`claude` on PATH).

- `rig wiki agent list` — detected adapters.
- `rig wiki agent use claude` — only `claude` is implemented in v1.

Codex / pi-agent adapters exist as stubs (P3 roadmap).
