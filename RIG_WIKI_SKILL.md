---
name: rig-wiki
description: >-
  Karpathy-style LLM wiki ops. Trigger whenever the user wants to capture, ingest, search, or maintain personal knowledge in a project's `rig wiki` directory. Intent phrases include "把这个加进 wiki / record this / take notes on", "what does my wiki say about X / wiki 里有没有 X", "fetch <url> into my wiki", "重建/同步 wiki索引", "lint wiki". Vector-only retrieval via Qwen3-Embedding + Qwen3-Reranker, cross-lingual CN/EN out of the box. Do NOT use for arbitrary file reads, code documentation, or repo-wide search.
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, node]
    os: [darwin]
---

# rig-wiki — agent operator's playbook

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

- For **interactive** users: print the rig output verbatim, then explain what changed in one short sentence.
- For **machine** consumption (chained tools): use `--json` on any command. Shape is `{ ok, code, data?, error? }`.
- **Long ingest** (Claude two-step CoT): expect 1–3 minutes. Tell the user once at the start; don't ping them mid-run.

## When NOT to use this skill

- User wants to read a single existing wiki page → use `Read`, not `rig wiki query`.
- User wants to write/edit `purpose.md` / `schema.md` / a file in `raw/` → human-authored, refuse with reason.
- User is talking about a different knowledge system (Obsidian-only, Notion, etc.).
- Task is unrelated to personal knowledge capture (e.g. code search → use `grep`).

## Setup — if no wiki is registered

`rig wiki list` shows zero entries → ask the user **once**:

> "No wiki registered in this project. Init one? If yes, what subdir name? (suggestions: `knowledge`, `wiki`, `harness/llm-wiki`)"

Then run:

```bash
rig wiki init <user-chosen-subdir>          # REQUIRED — fails if no path
# tell user to edit purpose.md (one-time scoping)
rig wiki register <user-chosen-subdir>
```

After they edit `purpose.md`, you're ready to use the intent map above.

## Architecture (read once, then forget)

- Vector-only retrieval: Qwen3-Embedding-0.6B (~610MB) + Qwen3-Reranker-0.6B (~610MB), both CDN-mirrored at `assets.terncloud.com/rig/models/`.
- Models auto-downloaded on first use into `~/.cache/qmd/models/`; subsequent runs are instant.
- Per-wiki SQLite at `~/.rig/cache/qmd/<wiki>.sqlite` (sqlite-vec extension). `.gitignore`'d by default.
- `ingest` triggers incremental embed at the end — no need to manually call `index` in routine use.
- macOS-only in v1.

## Agent CLI

`rig wiki ingest` and `rig wiki query --synth` invoke Claude Code (`claude -p`) under the hood. If the user picks a different agent in `~/.rig/config.json5` (`wiki.defaultAgent`), it's used instead. Only `claude` is implemented in v1.
