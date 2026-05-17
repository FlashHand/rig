---
name: rig-wiki
description: Karpathy-style LLM Wiki ops over any project registered with `rig wiki`. Use to scan a project for new sources, fetch a URL into raw/, ingest a source (two-step CoT), query the wiki, or lint for contradictions/orphans. Requires the `rig` CLI on PATH; optional but recommended: `qmd` for retrieval.
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, node]
    os: [darwin]
---

# rig-wiki

This skill is a thin wrapper over the `rig wiki *` CLI. Use it when the user wants to:

- **Scan** a project for new sources to ingest into its wiki.
- **Fetch** a URL verbatim into the wiki's `raw/`.
- **Ingest** a source (two-step CoT: analysis → generation), with a diff preview.
- **Query** the wiki (uses qmd MCP if installed; otherwise injects `index.md` + heuristically-picked pages).
- **Lint** the wiki (contradictions, orphans, stale claims, broken `sources[]` refs).

## Install

`npm i -g rigjs` (or `yarn global add rigjs`) ships this file at the rig package root and **auto-symlinks** it into `~/.claude/skills/rig-wiki/SKILL.md` via the package postinstall script. Restart Claude Code to pick it up.

If the auto-link didn't run (you disabled `ignore-scripts`, or `~/.claude/skills/` didn't exist at install time):

```bash
rig wiki install-skill          # idempotent; safe to run any time
rig wiki install-skill --force  # re-link if the target points elsewhere
```

To remove: `rig wiki uninstall-skill`.

## Quickstart

If the user is inside a project that's already registered (`rig wiki list` shows it):

- `rig wiki scan`              → print NEW/MODIFIED/DELETED report
- `rig wiki fetch <url>`       → verbatim download into `raw/YYYY-MM-DD-<slug>.md`
- `rig wiki ingest <path>`     → two-step CoT, then prompt to apply diff
- `rig wiki query "..."`       → answer with `[[wikilink]]` citations
- `rig wiki lint`              → produce `lint-report-YYYY-MM-DD.md`

If not registered yet:

- `rig wiki register` from project root → adds entry to `~/.rig/wiki.config.json5`
- Or `rig wiki init <path>` to bootstrap a fresh wiki dir.

## Output

All commands accept `--json` for machine-readable output (`{ ok, code, data?, error? }`).

## Hard rules

- **Never** edit `raw/`, `purpose.md`, or `schema.md` directly. Tell the user those are human-authored.
- **Never** run `ingest` against a path that isn't a registered wiki source. If the project isn't registered, run `rig wiki register` first.
- **`scan` exit code 10** means a `raw/` file changed — that's an error condition, not a re-ingest trigger. Surface it to the user.

## When NOT to use this skill

- User just wants to read a wiki page → use Read, not this skill.
- User wants to write `purpose.md` / `schema.md` / `raw/` → those are human-only; refuse and explain.
- User is not in a `rig`-aware project → tell them to run `rig wiki register` first.
- Project is on Linux/Windows → `rig wiki` is macOS-only in v1; tell the user.

## qmd integration

Detect with `which qmd`. If installed:

- `rig wiki query` automatically uses `qmd query --json`.
- After `rig wiki ingest`, the wiki's qmd collection is incrementally re-embedded.

If qmd is missing:

- `rig wiki index` is a no-op (warns, exits 0).
- `query` falls back to feeding `index.md` + `overview.md` + heuristic page picks to Claude.

Install qmd: `npm i -g @tobilu/qmd`.

## Agent

`rig wiki` defaults to Claude Code (`claude` on PATH). To check or change:

- `rig wiki agent list` — table of detected adapters.
- `rig wiki agent use claude` — only `claude` is implemented in v1.

Codex / pi-agent adapters exist as stubs (P3 roadmap).
