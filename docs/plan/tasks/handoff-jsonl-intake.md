---
id: handoff-jsonl-intake
title: Add newest-first Claude JSONL intake and rename the Codex skill
status: done
role: developer
engine: codex
depends-on: []
verify: yarn test lib/handoff/transcript.test.ts lib/handoff/install.test.ts lib/handoff/hook.test.ts --runInBand && yarn build
---

## Objective

Make long Claude Code transcripts fast to recover by moving filtering, reverse
paging, checkpoint selection, and noise removal into Rig instead of asking an
agent to repeatedly normalize JSONL by hand.

## Context

The existing `from-claude` skill starts at line 1 and pages chronologically.
That makes the least recent evidence consume context first and returns metadata
and thinking placeholders that do not help continuation. The displayed name
also inherits an unsuitable `rig-wiki:from-claude` association.

## Paths

- `lib/handoff/transcript.ts` — intake schema and newest-first cursor.
- `lib/handoff/index.ts` — `rig handoff intake` CLI.
- `lib/handoff/{paths,install,uninstall,doctor,prompt}.ts` — standalone skill
  rename and safe legacy-link migration.
- `skills/rig-from-claude/` — renamed skill, OpenAI metadata, and `.mjs` runner.
- `lib/handoff/*.test.ts` — paging, filtering, naming, and migration coverage.
- `skills.md`, `RIG_GUIDE.md` — operator documentation.

## Verification

- Unit tests prove exclusive newest-to-oldest paging has no overlap, omits
  thinking-only rows, retains dialogue/tool evidence, selects the active
  checkpoint, and preserves branch metadata.
- Installer tests prove the new name is linked and only a Rig-owned legacy link
  is migrated.
- Skill validation and strict `agents/openai.yaml` parsing pass.
- `yarn build` and the bundled `.mjs` runner succeed against the supplied real
  transcript.

Completed 2026-07-16:

- 17 focused handoff tests passed.
- `yarn build` passed; bundled-output gitleaks scan reported no leaks.
- Skill frontmatter and `agents/openai.yaml` passed strict `js-yaml` parsing and
  skill-name/description/default-prompt checks.
- The installed skill processed the supplied 4,014,150-byte / 849-line JSONL in
  about 0.4 seconds. Its bounded first page was 47,044 bytes; the next older
  page had no overlapping line numbers; 118 thinking blocks were omitted.
- `rig handoff doctor --json` passed with the new standalone skill link, and
  the installer-owned legacy link was absent after migration.
- The full repository run passed 12 suites / 85 tests but remains red on two
  unrelated pre-existing cases: `RigConfig.test.ts` has a stale dependency
  fixture expectation, and `lib/sync/index.test.ts` contains no tests. No
  handoff test failed.
