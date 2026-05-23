---
name: rig-wiki
description: Karpathy-style LLM Wiki ops over any project registered with `rig wiki`. Vector-only semantic retrieval via Qwen3-Embedding-0.6B + Qwen3-Reranker-0.6B (both globally CDN-mirrored). Cross-lingual Chinese/English out of the box. Use to scan for new sources, fetch URLs, ingest two-step CoT, query, lint, or rebuild local caches.
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
- **Query** semantically (Qwen3 vector + Qwen3 reranker, cross-lingual CN/EN).
- **Lint** the wiki (contradictions, orphans, stale claims, broken `sources[]` refs).
- **Rebuild** local caches on a new device or after switching embed models.

## Install

`yarn global add rigjs` auto-symlinks the skill into `~/.claude/skills/rig-wiki/SKILL.md`. Restart Claude Code to pick it up.

If the auto-link didn't run:

```bash
rig wiki install-skill          # idempotent
rig wiki install-skill --force  # re-link if the target points elsewhere
```

For local dev/iteration (edit rig source, install over the registry version):

```bash
rig install-local               # yarn build + sync to global rigjs in place
rig -v                          # confirm new version
rig -c                          # confirm versionCode
```

A later `yarn global add rigjs` cleanly overrides the local install.

To remove the skill link: `rig wiki uninstall-skill`.

## Quickstart

Project already registered (`rig wiki list` shows it):

- `rig wiki scan`              → NEW/MODIFIED/DELETED report
- `rig wiki fetch <url>`       → verbatim download into `raw/YYYY-MM-DD-<slug>.md`
- `rig wiki ingest <path>`     → two-step CoT, then prompt to apply diff
- `rig wiki query "..."`       → vector + reranker, top-k with `[[wikilink]]` citations
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
- **Never** commit `~/.rig/cache/qmd/*.sqlite*` or `~/.cache/qmd/`. `init` writes a `.gitignore` covering the project-local case; the global caches are outside the repo by location.

## When NOT to use this skill

- User just wants to read a wiki page → use Read.
- User wants to write `purpose.md` / `schema.md` / `raw/` → human-only; refuse and explain.
- User is not in a `rig`-aware project → `rig wiki register` first.
- Project is on Linux/Windows → `rig wiki` is macOS-only in v1.

## Retrieval architecture (vector-only, Qwen3 × 2)

`rig wiki query` is **pure semantic** — no BM25, no query expansion, just:

1. **Vector retrieval** via Qwen3-Embedding-0.6B against the per-wiki sqlite-vec store.
2. **Reranker** Qwen3-Reranker-0.6B over the top-40 candidates.
3. Top-k results sorted by rerank score.

Both Qwen3 models are bundled-defaults inside rig:

- Embed: `https://assets.terncloud.com/rig/models/Qwen3-Embedding-0.6B-Q8_0.gguf` (CDN-accelerated)
- Rerank: `https://assets.terncloud.com/rig/models/qwen3-reranker-0.6b-q8_0.gguf` (CDN-accelerated)

Each model is ~610MB Q8_0 GGUF. node-llama-cpp downloads them to `~/.cache/qmd/models/` on first use; subsequent calls are instant from cache.

### Cross-lingual

Qwen3 models are multilingual (100+ languages). Verified working:

- Chinese query against English content (`如何精排候选` → `reranker.md`)
- English query against Chinese content
- Mixed CN/EN content + queries

No language tag, no tokenizer config — the embedding space aligns languages internally.

### `--no-rerank`

Skips the reranker pass. Faster (one model load instead of two), slightly lower precision.

```bash
rig wiki query "..." --no-rerank
```

### `--synth`

After printing the hits, invokes the Claude adapter to write a 1-paragraph synthesized answer with `[[wikilink]]` citations.

## qmd on-disk model — what to sync and what NOT to sync

qmd stores the per-wiki index in `~/.rig/cache/qmd/<wiki>.sqlite` (sqlite-vec extension). Model GGUFs in `~/.cache/qmd/models/`. **Never commit either**:

1. **Non-deterministic.** Float weights vary by CPU/GPU backend (Metal vs Vulkan vs CPU). SQLite page layout adds more drift.
2. **Binary blob.** Every embed produces a new blob — git history explodes; Obsidian Sync only does full-file conflict resolution.
3. **Cache by design.** Both locations are conventional "safe to delete" caches.

**Sync only the markdown sources** (`raw/`, `wiki/**`, `purpose.md`, `schema.md`, `index.md`, `overview.md`, `log.md`, `reviews.md`). Rebuild caches on each device.

## New-device flow

On a fresh machine after `git clone` (or after Obsidian Sync materializes the vault):

```bash
# 1. Install rig
yarn global add rigjs

# 2. Register the wiki (or rely on the auto-registered entry in package.rig.json5)
rig wiki register <path>

# 3. Rebuild local caches (downloads both Qwen3 models from CDN; ~10s each on a good link)
rig wiki rebuild

# 4. Baseline the sha index
rig wiki scan

# 5. Sanity check — first query loads the reranker (one extra ~10s for cold cache)
rig wiki query "what is this wiki about?"
```

## Obsidian compatibility

`rig wiki` produces a plain-markdown vault. Drop it inside an Obsidian vault (or treat the whole project as one) and Obsidian handles it natively:

- ✅ Nested folders, YAML frontmatter, `[[wikilink]]` — all standard.
- ⚠️ `.obsidian/workspace.json` should be in `.gitignore` (rig's `init` already covers the qmd cache; add Obsidian workspace separately if you want one vault per machine).

## Agent

`rig wiki` defaults to Claude Code (`claude` on PATH). Used by `ingest` (two-step CoT) and `query --synth` (paragraph synthesis).

- `rig wiki agent list` — detected adapters.
- `rig wiki agent use claude` — only `claude` is implemented in v1.

Codex / pi-agent adapters exist as stubs (P3 roadmap).
