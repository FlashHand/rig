# rig — delivery plan (docs-sprint)

Agent-facing delivery plan, read by `rig orchestrate` (see the overmind workspace CLAUDE.md → "rig orchestrate").

- `tasks/<id>.md` — one task per file. YAML frontmatter: `status` (draft → ready → in-progress → done | blocked), `role`, `engine`, `depends-on`, `verify` (**required to auto-merge** — exit 0 is the Tester gate).
- `rig orchestrate task rig <id>` scaffolds a task; `rig orchestrate run rig` dispatches `ready` tasks (develop → verify → auto-merge); `rig orchestrate journal` rolls up `done`.
- Verify command for this project: `yarn build`. Honor this project's `RIG.md` / `CLAUDE.md` conventions + guardrails. Promote a task to `status: ready` deliberately.

_No active tasks yet. Add one with `rig orchestrate task rig <id>`._
