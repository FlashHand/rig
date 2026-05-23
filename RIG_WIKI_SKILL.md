---
name: rig-wiki
description: >-
  Agent-only orchestration skill for Karpathy-style LLM wikis. rig wiki is designed to be DRIVEN BY a coding agent (Claude Code, Codex, …), not invoked by humans on the command line. Users state intent in natural language — "把这个加进 wiki / record this / take notes on / fetch <url> into my wiki / wiki 里有没有 X / what does my wiki say about Y / 重建索引 / lint wiki" — and the agent translates that into `rig wiki *` commands. Vector-only retrieval via Qwen3-Embedding + Qwen3-Reranker, cross-lingual CN/EN out of the box. Do NOT use for arbitrary file reads, code documentation, or repo-wide search.
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, node]
    os: [darwin]
---

# rig-wiki — agent operator's playbook

**Positioning.** rig wiki is an **agent-facing tool**. Humans don't memorise the CLI; they tell their agent (you) what they want, and you orchestrate `rig wiki *`. Treat any direct user-typed `rig wiki ...` invocation as a fallback — your job is to make raw CLI use unnecessary. Never just hand the user a command and walk away; run it, observe, report.

## Vault model — one fixed dir per project

A vault is **a single `rig-wiki/` dir at the project root** holding metadata (purpose.md, schema.md, page tree, `.rig/config.yml`). The project root itself is the conceptual "vault" — `rig-wiki/` is just the metadata subdir living inside it, named `rig-wiki/` by convention. User-authored data (`personal/`, `research/`, etc.) lives in sibling dirs and is NEVER touched.

- **The scope** — which sibling data dir(s) the wiki actually ingests — is recorded in `<rig-wiki>/.rig/config.yml` (`name`, `root`, `include`).
- **Discovery is automatic.** Any `rig wiki *` command walks up from CWD; at each level it checks both `<dir>/.rig/config.yml` (you're inside the vault) and `<dir>/rig-wiki/.rig/config.yml` (you're at the project root). So `cd` anywhere inside the project works.

This means:
- **No `--wiki <name>` flag exists.** Don't try to pass one.
- **No `rig wiki list`, `register`, or `unregister` commands.** They've been removed.
- If the user is in a project that has no vault, the next step is `rig wiki init <scope>` (see "Setup" below).

## Intent → command map

| User intent (any language) | Action |
|---|---|
| "把 / record / take notes on / 添加 / 收一下 / 收藏 …" + a URL | `rig wiki fetch <url>` then `rig wiki ingest raw/<resulting-file>` |
| "…" + a local file path or content paste | Write the content to `<vault>/raw/YYYY-MM-DD-<kebab-slug>.md` with frontmatter (`source-url`, `fetched-at`, `fetcher: agent-paste`, `content-sha`). Then `rig wiki ingest <that-path>`. |
| "ingest / re-process / 重新整理 / 重新 ingest <something>" | `rig wiki ingest <path>` — handles new sources AND re-ingest of modified ones. |
| "what's new / 有什么变化 / scan / diff" | `rig wiki scan` — surface the NEW / MODIFIED / DELETED / RAW DRIFT report verbatim. |
| "ingest everything new / 把新东西都收一下" | `rig wiki scan` → for each NEW path → `rig wiki ingest <path>` (one call per file). |
| "wiki 里有没有 X / what does my wiki say about X / search the wiki for X" | `rig wiki query "<X>"` (Qwen3 vector + Qwen3 reranker; cross-lingual). Default limit 10. |
| "summarize what we know about X / 总结一下 X" | `rig wiki query "<X>" --synth` — adds a Claude-synthesized paragraph with `[[wikilink]]` citations after the hit list. |
| "lint / 检查一遍 / what's broken in my wiki" | `rig wiki lint`. Surface the report. Exit code 11 = severe (broken refs / missing source). |
| "rebuild / 全部重 embed / 换了模型 / 新机器" | `rig wiki rebuild` — full nuclear refresh. Only suggest this when the user mentions a new device or explicitly switching the embed model. |

## Vault layout (flat — no inner `wiki/` subdir)

```
<project>/                       ← the conceptual vault (e.g. overmind/)
  rig-wiki/                      ← fixed metadata-dir name; created by `rig wiki init`
    purpose.md                   ← human-authored, never write
    schema.md                    ← human-authored, never write
    index.md                     ← LLM-writable
    overview.md                  ← LLM-writable
    log.md                       ← append-only LLM log
    reviews.md                   ← LLM-writable backlog of human-review items
    raw/                         ← immutable source files (never edit existing)
    sources/                     ← one .md per ingested source — page tree at vault root
    entities/
    concepts/
    synthesis/
    queries/
    .rig/config.yml              ← per-vault settings (name, root, include, exclude, …)
    .gitignore
  personal/                      ← user-authored data — scope target (NEVER touched)
  research/                      ← (other sibling data dirs)
  ...
```

Note: page directories (`sources/`, `entities/`, `concepts/`, `synthesis/`, `queries/`) live directly under `rig-wiki/` — no nested `wiki/` subdir.

## Argument inference rules

- **slug** = kebab-case, no dates in page filenames; dates only on `raw/YYYY-MM-DD-*` prefix.
- **raw filename** = `YYYY-MM-DD-<slug>.md`. Pick today's local date; if filename collides, append `-2`, `-3`.
- **URL → slug**: last path segment, drop extension, lowercase, replace non-`[a-z0-9-]` with `-`, max 64 chars.
- **`rig wiki init <scope>` arg** is a data subdir NAME, not a path to create. Examples: `rig wiki init personal` (scopes to `./personal/`), `rig wiki init research`. The vault metadata dir is always `./rig-wiki/`. Never pass a path like `rig-wiki` — that's the metadata dir, not the scope.

## Hard rules — refuse and explain if violated

- **Never** edit `raw/`, `purpose.md`, or `schema.md` directly. Those are human-authored. If the user asks you to, tell them to do it manually.
- **Never** init a vault INSIDE a user-authored data directory (e.g. `personal/wiki/`). The vault dir contaminates the user's source tree. Put the vault at the project root (e.g. `<project>/rig-wiki/`) and point `include[]` at the data dirs via `<vault>/.rig/config.yml`.
- **Never** init a vault at a **hidden path** (any segment starting with `.`) or a **.gitignored** path. rig wiki refuses at the CLI level.
- **`rig wiki scan` exit 10 (RAW DRIFT)** = a `raw/` file's bytes changed since last scan. Do NOT auto-fix or re-ingest. Surface to the user as a data-integrity warning.
- **`rig wiki lint` exit 11** = severe findings. Surface the report path and the top findings; do not auto-fix unless the user asks.
- **Never** suggest editing `~/.rig/cache/qmd/*.sqlite` or `~/.cache/qmd/`. Those are rebuildable caches.

## Auto-exclusions (no config needed)

The scanner skips these automatically — do not waste user time adding them to `exclude`:
- Any path segment starting with `.` (`.git/`, `.obsidian/`, `.vscode/`, `.DS_Store`, …).
- Any path matched by the project's `.gitignore`.

What you DO need to put in `exclude` are content-type filters the user cares about — e.g. `**/*.zip`, `**/*.pdf` if they don't want those in their text wiki.

## Common error → recovery

| Error | What it means | Action |
|---|---|---|
| `No rig wiki vault found.` | CWD has no `.rig/config.yml` and no parent does either | `cd` into the vault (or the project that contains one), or run `rig wiki init <subdir>` |
| `qmd query failed. Run \`rig wiki index\` first` | No vector index for this vault | `rig wiki index`, then retry |
| `claude not installed on PATH` (during ingest/synth) | Claude Code CLI missing | Tell the user; suggest `yarn dlx @anthropics/claude-code` |
| Reranker download stalls on first query | CDN cold node, can take ~1 min | Just wait; subsequent queries are instant |

## Output handling

- After running a `rig wiki *` command, **summarise in natural language** what changed. Don't dump raw `rig` output unless the user asks. Examples:
  - After `rig wiki ingest`: "Wrote 11 pages (1 source, 2 entities, 5 concepts, …). Lint clean."
  - After `rig wiki query`: cite the top hit by slug `[[wikilink]]` and quote a 1-line snippet; offer `--synth` for a paragraph.
  - After `rig wiki scan`: "3 new, 1 modified. Want me to ingest them?"
- For **machine** consumption (chaining): use `--json` on any command. Shape is `{ ok, code, data?, error? }`.
- **Long ingest** (Claude two-step CoT): expect 1–3 minutes per source. Tell the user once at the start; don't ping them mid-run.
- **First-run model download** (embed model on first `ingest` / `index`, reranker on first `query`): each is ~610MB from the rig CDN — usually under a minute. Mention it the first time, then forget.

## When NOT to use this skill

- User wants to read a single existing wiki page → use `Read`, not `rig wiki query`.
- User wants to write/edit `purpose.md` / `schema.md` / a file in `raw/` → human-authored, refuse with reason.
- User is talking about a different knowledge system (Obsidian-only, Notion, etc.).
- Task is unrelated to personal knowledge capture (e.g. code search → use `grep`).

## Setup — if no vault is found

`rig wiki scan` (or any command) reports `No rig wiki vault found.` → ask the user **once** which sibling data dir to scope this wiki to (don't guess silently):

> "No vault here. Which subdir should this wiki ingest from — `personal/`, `research/`, …?"

Then orchestrate without further prompting:

```bash
cd <project>                  # the root that contains the scope dir
rig wiki init <scope>         # e.g. `rig wiki init personal` → creates ./rig-wiki/, scope = ./personal/
```

After init, **pause and ask the user to edit `<project>/rig-wiki/purpose.md`** (one-time human scoping — define what this wiki is for, in/out of scope). Don't write purpose.md yourself; it's the only human-authored anchor for everything downstream.

If the user wants finer scoping than a single subdir (e.g. "ingest `personal/` but ignore zip files"), translate that into edits to `<project>/rig-wiki/.rig/config.yml`. Fields: `name`, `root` (relative scan base, default `../<scope>`), `include[]`, `exclude[]`, `schedule`, `ingestRules`. Everything about the vault lives in that dir — nothing leaks outside.

## Configuration files

Two YAML files, both optional except where noted:

- `~/.rig/config.yml` — rig-global prefs (default agent, qmd toggle, log rotation). Touched by `rig wiki agent use`.
- `<vault>/.rig/config.yml` — **the only place per-vault settings live.** Auto-created by `rig wiki init`. Safe to edit by hand.

No global registry. No `package.rig.json5` wiki block (that file is for legacy rig CICD, unrelated).

## Architecture (read once, then forget)

- Vector-only retrieval: Qwen3-Embedding-0.6B (~610MB) + Qwen3-Reranker-0.6B (~610MB), both CDN-mirrored at `assets.terncloud.com/rig/models/`.
- Models auto-downloaded on first use into `~/.cache/qmd/models/`; subsequent runs are instant.
- Per-vault SQLite at `~/.rig/cache/qmd/<vault-name>.sqlite` (sqlite-vec extension). `.gitignore`'d by default.
- `ingest` triggers incremental embed at the end — no need to manually call `index` in routine use.
- macOS-only in v1.

## Agent CLI

`rig wiki ingest` and `rig wiki query --synth` invoke Claude Code (`claude -p`) under the hood. If the user picks a different agent in `~/.rig/config.yml` (`wiki.defaultAgent`), it's used instead. Only `claude` is implemented in v1.
