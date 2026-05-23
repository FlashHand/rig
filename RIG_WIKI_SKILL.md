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

You orchestrate `rig wiki *` on behalf of the user. The user speaks in intent; you map to commands. Below is the intent → action table. Resolve the **target wiki** by reading `rig wiki list` once at session start; if none registered, see "Setup" at the bottom.

## Intent → command map

| User intent (any language) | Action |
|---|---|
| "把 / record / take notes on / 添加 / 收一下 / 收藏 …" + a URL | `rig wiki fetch <url>` then `rig wiki ingest raw/<resulting-file>` |
| "…" + a local file path or content paste | Write the content to `<wiki>/raw/YYYY-MM-DD-<kebab-slug>.md` with frontmatter (`source-url`, `fetched-at`, `fetcher: agent-paste`, `content-sha`). Then `rig wiki ingest <that-path>`. |
| "ingest / re-process / 重新整理 / 重新 ingest <something>" | `rig wiki ingest <path>` — handles new sources AND re-ingest of modified ones. |
| "what's new / 有什么变化 / scan / diff" | `rig wiki scan` — surface the NEW / MODIFIED / DELETED / RAW DRIFT report verbatim. |
| "ingest everything new / 把新东西都收一下" | `rig wiki scan` → for each NEW path → `rig wiki ingest <path>` (one call per file). |
| "wiki 里有没有 X / what does my wiki say about X / search the wiki for X" | `rig wiki query "<X>"` (Qwen3 vector + Qwen3 reranker; cross-lingual). Default limit 10. |
| "summarize what we know about X / 总结一下 X" | `rig wiki query "<X>" --synth` — adds a Claude-synthesized paragraph with `[[wikilink]]` citations after the hit list. |
| "lint / 检查一遍 / what's broken in my wiki" | `rig wiki lint`. Surface the report. Exit code 11 = severe (broken refs / missing source). |
| "rebuild / 全部重 embed / 换了模型 / 新机器" | `rig wiki rebuild` — full nuclear refresh. Only suggest this when the user mentions a new device or explicitly switching the embed model. |
| "wiki list / what wikis are registered" | `rig wiki list` |

Always run from inside the registered project (or pass `--wiki <name>`). If the user is in some other CWD, `cd` to the wiki's project first.

## Argument inference rules

- **slug** = kebab-case, no dates inside `wiki/`, dates only on `raw/YYYY-MM-DD-*` prefix.
- **raw filename** = `YYYY-MM-DD-<slug>.md`. Pick today's local date; if filename collides, append `-2`, `-3`.
- **URL → slug**: last path segment, drop extension, lowercase, replace non-`[a-z0-9-]` with `-`, max 64 chars.
- **wiki dir name** when initializing: prefer user-stated name; if absent, ask once. Never default to `wiki` or CWD silently.

## Hard rules — refuse and explain if violated

- **Never** edit `raw/`, `purpose.md`, or `schema.md` directly. Those are human-authored. If the user asks you to, tell them to do it manually.
- **Never** ingest or init at a **hidden path** (any segment starting with `.`) or a **.gitignored** path. rig wiki refuses at the CLI level — it sees these as "the project deliberately doesn't want this in the wiki." Workaround if the user insists: `cp -R <hidden-or-ignored> <wiki>/raw/<slug>/` first, then ingest the copy. Never bypass the guard.
- **Never** ingest a path outside the wiki's `include[]` scope (anything in `raw/` is always fine; outside that requires the path to be listed in the registered wiki's `include`).
- **`rig wiki scan` exit 10 (RAW DRIFT)** = a `raw/` file's bytes changed since last scan. Do NOT auto-fix or re-ingest. Surface to the user as a data-integrity warning.
- **`rig wiki lint` exit 11** = severe findings. Surface the report path and the top findings; do not auto-fix unless the user asks.
- **Never** suggest editing `~/.rig/cache/qmd/*.sqlite` or `~/.cache/qmd/`. Those are rebuildable caches.

## Common error → recovery

| Error | What it means | Action |
|---|---|---|
| `qmd query failed. Run \`rig wiki index\` first` | No vector index for this wiki | `rig wiki index --wiki <name>` then retry |
| `no wiki resolved` | CWD is not inside a registered wiki and no `--wiki` flag | Either `cd` into the project or pass `--wiki <name>` |
| `claude not installed on PATH` (during ingest/synth) | Claude Code CLI missing | Tell the user; suggest `yarn dlx @anthropics/claude-code` or use a non-agent flow |
| Reranker download stalls on first query | CDN cold node, can take ~1 min | Just wait; subsequent queries are instant |

## Output handling

- After running a `rig wiki *` command, **summarise in natural language** what changed. Don't dump raw `rig` output unless the user asks ("show me the raw output"). Examples:
  - After `rig wiki ingest`: "Wrote 11 pages (1 source, 2 entities, 5 concepts, …). Lint clean."
  - After `rig wiki query`: cite the top hit by slug `[[wikilink]]` and quote a 1-line snippet; offer to run `--synth` if user wants a paragraph.
  - After `rig wiki scan`: "3 new, 1 modified. Want me to ingest them?"
- For **machine** consumption (chaining): use `--json` on any command. Shape is `{ ok, code, data?, error? }`.
- **Long ingest** (Claude two-step CoT): expect 1–3 minutes. Tell the user once at the start; don't ping them mid-run.
- **First-run model download** (embed model on first `ingest` / `index`, reranker on first `query`): each is ~610MB from the rig CDN — usually under a minute. Mention it the first time, then forget.

## When NOT to use this skill

- User wants to read a single existing wiki page → use `Read`, not `rig wiki query`.
- User wants to write/edit `purpose.md` / `schema.md` / a file in `raw/` → human-authored, refuse with reason.
- User is talking about a different knowledge system (Obsidian-only, Notion, etc.).
- Task is unrelated to personal knowledge capture (e.g. code search → use `grep`).

## Setup — if no wiki is registered

`rig wiki list` shows zero entries → ask the user **once** (don't list multiple defaults; pick one suggestion and confirm):

> "No wiki registered here. Want me to init one under `knowledge/`? (or pick another subdir name)"

Then orchestrate without further prompting:

```bash
rig wiki init <subdir>          # REQUIRED — fails if path missing or hidden/gitignored
rig wiki register <subdir>
```

After init, **pause and ask the user to edit `<subdir>/purpose.md`** (one-time human scoping — define what this wiki is for, in/out of scope). Don't write purpose.md yourself; it's the only human-authored anchor for everything downstream.

If the user describes a scan scope that differs from the defaults (e.g. "include every md file in the parent dir but ignore zip files"), translate that into edits to `<subdir>/.rig/config.yml` — that's the per-vault settings file (`name`, `root`, `include`, `exclude`, `schedule`, `ingestRules`). The vault is self-contained: nothing about its identity or scope lives outside its own directory.

## Configuration model (read once, then forget)

Two layers, both YAML:

- `~/.rig/config.yml` — rig-global prefs only (default agent, qmd toggle, log rotation). Touched by `rig wiki agent use`.
- `~/.rig/wikis.yml` — registry. **Just a flat list of vault paths** for discovery. No per-wiki settings here.
- `<vault>/.rig/config.yml` — **the only place per-vault settings live.** `name`, optional `root` (relative scan base, default `..`), `include[]`, `exclude[]`, `schedule`, `ingestRules`. Created automatically by `init`. Safe to edit by hand.

Never edit `~/.rig/wikis.yml` to change a wiki's name, scope, or schedule — those belong in the vault. Never invent a `package.rig.json5` wiki block; that file is unrelated to rig wiki (legacy rig CICD only).

## Architecture (read once, then forget)

- Vector-only retrieval: Qwen3-Embedding-0.6B (~610MB) + Qwen3-Reranker-0.6B (~610MB), both CDN-mirrored at `assets.terncloud.com/rig/models/`.
- Models auto-downloaded on first use into `~/.cache/qmd/models/`; subsequent runs are instant.
- Per-wiki SQLite at `~/.rig/cache/qmd/<wiki>.sqlite` (sqlite-vec extension). `.gitignore`'d by default.
- `ingest` triggers incremental embed at the end — no need to manually call `index` in routine use.
- macOS-only in v1.

## Agent CLI

`rig wiki ingest` and `rig wiki query --synth` invoke Claude Code (`claude -p`) under the hood. If the user picks a different agent in `~/.rig/config.yml` (`wiki.defaultAgent`), it's used instead. Only `claude` is implemented in v1.
