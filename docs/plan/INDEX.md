# rig — delivery plan (docs-sprint)

Agent-facing delivery plan, read by `rig orchestrate` (see the overmind workspace CLAUDE.md → "rig orchestrate").

- `tasks/<id>.md` — one task per file. YAML frontmatter: `status` (draft → ready → in-progress → done | blocked), `role`, `engine`, `depends-on`, `verify` (**required to auto-merge** — exit 0 is the Tester gate).
- `rig orchestrate task rig <id>` scaffolds a task; `rig orchestrate run rig` dispatches `ready` tasks (develop → verify → auto-merge); `rig orchestrate journal` rolls up `done`.
- Verify command for this project: `yarn build`. Honor this project's `RIG.md` / `CLAUDE.md` conventions + guardrails. Promote a task to `status: ready` deliberately.

## Tasks

- `tasks/handoff-jsonl-intake.md` — **done** — newest-first semantic JSONL intake, bundled `.mjs` runner, and standalone `rig-from-claude` naming.
- `tasks/sec-oss-cred-log-redaction.md` — **done** — redact OSS AccessKey ID/Secret from `rig build`/`deploy`/`publish` stdout (the `paramsStr` log leaked raw `ak`/`as`).
