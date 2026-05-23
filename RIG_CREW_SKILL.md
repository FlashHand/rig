---
name: rig-crew
description: >-
  Agent-facing Leader-first multi-agent workflow over an Obsidian vault using
  `rig crew`. Use when the current coding agent should initialize a crew vault,
  refresh a human-readable dashboard, inspect inbox/status, register project
  owners, or coordinate PRD-driven project work through Vault files.
  For frontend testing, default to PRD-scoped Playwright E2E only: do not add
  or run frontend unit/integration tests unless the user or project explicitly
  requires them.
user-invocable: true
disable-model-invocation: false
metadata:
  openclaw:
    requires:
      bins: [rig, node, yarn]
    os: [darwin]
---

# rig-crew

Use this skill when the current coding agent is inside or coordinating an Obsidian Vault that uses `rig crew`: a file-backed, Leader-first agent workflow using Obsidian Markdown as the source of truth.

`rig crew` is primarily for coding agents, not a human-operated daily CLI. The human talks to the active Claude/Codex session; that coding agent should use `rig crew` commands and Vault files to communicate with Crew Lead, coordinate other roles, and stay aware of all agent/todo status.

## Agent Quickstart

```bash
rig crew init --vault "/path/to/ObsidianVault" --as personal
rig crew "推进当前目标"
rig crew role add security-reviewer --from ./security-reviewer.md --agent security-reviewer --executor codex
rig crew research "比较 Playwright agents 的最佳实践"
rig crew inbox
rig crew board
rig crew status
```

Project Owner management:

```bash
rig crew project add rig --path /path/to/projects/rig --executor claude --test-command "yarn build"
rig crew project add dsh-service --path /path/to/projects/dsh-service --executor codex --test-command "yarn test"
rig crew project add demo-web --path /path/to/ObsidianVault/tmp/demo-web --executor codex
rig crew project list
rig crew project status rig
```

## State Model

`rig crew` is file-backed. Do not assume a long-running multi-agent runtime exists.

- Default crew root: `rig-agents/`
- Vault source of truth: `rig-agents/**` by default, or the configured `crew.root`.
- Vault-local scratch projects: `tmp/<project>/**`
- Human dashboard: `<crew-root>/Team-Dashboard.md`
- User decisions: `<crew-root>/Inbox.md`
- Shared context: `<crew-root>/Shared/**`
- Role registry for Lead: `<crew-root>/Shared/Roles.md`
- Project owner memory: `<crew-root>/Projects/<project>/**`
- Researcher memory and index: `<crew-root>/Researcher/**`
- Custom role workspaces: `<crew-root>/Roles/<role>/**`
- Vault agent instructions: `CLAUDE.md` and `AGENTS.md`
- Local cache: `~/.rig/crew-state.json`
- Config: `~/.rig/crew.config.json`
- Global custom roles: `~/.rig/crew/roles/<role>/role.json` and `prompt.md`

All multi-agent collaboration materials should live inside the Vault. Temporary demo or test projects should be created under `Vault/tmp/<project>` and registered with their own Project Owner.

`rig crew` coordinates multiple roles on one device through one Vault. Do not assume a separate multi-agent runtime inside each project repository; project directories are execution workspaces, while tasks, reports, inbox, dashboard, and research indexes return to the Vault.

`rig crew init` is additive and non-destructive. It may create missing folders/files and update managed blocks, but it must not overwrite existing agent work files such as `Tasks.md`, `Notes.md`, `Role.md`, `Index.md`, reports, specs, decisions, or user-authored notes.

## Lead Orchestration

Lead is the default orchestration protocol, not a mandatory Claude/Codex subagent.

As the coding agent, use `rig crew "<request>"` when the user asks for planning, multi-agent coordination, PRD, research, testing strategy, owner routing, role routing, reports, or broad project changes. Do not ask the human to run the command when you can run it yourself.

After handoff, read:

- `<crew-root>/Team-Dashboard.md`
- `<crew-root>/Inbox.md`
- `<crew-root>/Shared/Roles.md`
- role task files such as `<crew-root>/Tester/Tasks.md`
- relevant `<crew-root>/Projects/<project>/Tasks.md`

If the CLI is unavailable, use the file protocol:

1. Append the request to `<crew-root>/Current-Goal.md`.
2. Create or update a Lead task in `<crew-root>/Lead/Tasks.md`.
3. Route worker tasks with inline fields such as `[role:: tester]`, `[owner:: maintainer:rig]`, `[project:: rig]`, `[executor:: codex]`, `[status:: pending]`.
4. Put user-facing questions or approvals in `<crew-root>/Inbox.md`.

Lead communicates with workers through Markdown tasks, delegation packets, and result notes. Do not rely on private subagent chat state as the coordination source of truth. Subagents are optional executors for specific roles when the selected executor supports them; Vault files remain canonical.

Maintain status awareness before and after work: scan dashboard, inbox, role tasks, project tasks, blockers, and todo status. The coding session should be able to answer what each role/project is doing without asking the human to inspect the Vault manually.

## Mixed Executors

`rig crew` can mix Claude Code, Codex, and future executors because state lives in files, not in one long-running agent process.

Executor selection order:

1. Task-level `executor` metadata, if present.
2. Role `defaultExecutor`, if present.
3. Project `defaultExecutor`.
4. Crew `defaultExecutor`.
5. Fallback: `claude`.

Use project-level executors when teams prefer different coding agents per repo:

```bash
rig crew project add rig --path /path/to/projects/rig --executor claude
rig crew project add dsh-service --path /path/to/projects/dsh-service --executor codex
```

The executor only affects code-running / project-local work. Vault Markdown updates should still be written by the `rig crew` host so Claude and Codex share the same source of truth.

## Custom Roles

Custom roles are device-level configuration under `~/.rig`, not project repository state.

Directory layout:

```text
~/.rig/
└── crew/
    └── roles/
        └── security-reviewer/
            ├── role.json
            ├── prompt.md
            └── source.md
```

Commands:

```bash
rig crew role add security-reviewer --from ./security-reviewer.md --agent security-reviewer --executor codex
rig crew role add security-reviewer --from ./security-reviewer.md --agent security-reviewer --executor codex --crew personal
rig crew role list
rig crew role show security-reviewer
```

When a role is materialized in a Vault, use:

```text
<crew-root>/Roles/<role>/
├── Tasks.md
├── Notes.md
├── Role.md
└── Reports/
```

`<crew-root>/Shared/Roles.md` is generated so Lead can load available roles. If the user asks Lead to use a specific role, match that role by `name` first, then route the task with `[role:: <name>]`. If the role defines `agent`, use that agent/subagent for role execution when the executor supports it.

## Researcher

Use the Researcher role for source-backed research, architecture investigation, option comparisons, external-current facts, or durable reports.

Report destination precedence:

1. Explicit directory in the user's current request.
2. `~/.rig/RIG.md` `Research Output Policy`.
3. Fallback: `<crew-root>/Researcher/Reports` inside the current Vault.

Recommended `~/.rig/RIG.md` section:

```md
## Research Output Policy

- Default research report directory: <crew-root>/Researcher/Reports
- Resolve relative paths from the current crew Vault root.
- If the user requests an explicit output directory, use that directory unless it is inside a project submodule or contains secrets.

| Scope | Directory | Notes |
|---|---|---|
| default | <crew-root>/Researcher/Reports | General research reports |
| project:<name> | <crew-root>/Projects/<name>/Research | Project-specific research notes |
```

If the destination is unclear, create or ask Lead to create an Inbox question instead of guessing. When a report is written outside `<crew-root>/Researcher/Reports`, keep an index entry in `<crew-root>/Researcher/Index.md`.

## Rules Files

Read rules in this order:

1. Vault agent rules: `CLAUDE.md` and `AGENTS.md` at the Vault root. `rig crew init` maintains a managed `rig-crew` block in both files.
2. Project rules: `projects/<project>/RIG.md` (also accept `rig.md` for compatibility).
3. Project testing guide: `docs/testing.md`, `test/README.md`, or `tests/README.md`.
4. User rules: `~/.rig/RIG.md`.
5. Optional structured mapping: `~/.rig/crew.secrets.json`.
6. Environment variables, system keychain, or CI secrets.

`~/.rig/RIG.md` is the default user-level source for test account descriptions. It may describe aliases and where credentials come from, but never copy credentials into project files, reports, traces, or logs.

Project `RIG.md` must only declare public contracts: account aliases, required permissions, test tags, commands, and paths. It must not contain real passwords, cookies, tokens, auth state, or personal keychain paths.

## Frontend Testing Policy

For frontend/UI behavior:

- Use PRD-scoped Playwright E2E as the default and preferred test type.
- Do not add frontend unit tests by default.
- Do not add frontend integration tests by default.
- Do not run old frontend unit/integration suites as part of normal `rig crew` verification.
- Do not run the full historical E2E suite unless risk requires it.

Default frontend verification is:

```text
PM PRD / Acceptance Criteria
-> Tester creates current Test Scope
-> Playwright planner/generator creates or updates focused E2E
-> Tester runs only current PRD E2E + minimal smoke
-> Lead reports what was run and what was intentionally skipped
```

Run full regression only when:

- Project Owner asks for it.
- The change touches auth, routing, shared layout, build config, data migration, checkout/payment, or release flow.
- Focused PRD E2E cannot cover the risk.
- Lead marks the task `risk: high`.

Tester reports must include:

```md
## Test Result

Scope: focused PRD E2E + smoke

Ran:
- yarn playwright test tests/e2e/<feature>.spec.ts --project=chromium-staging
- yarn build

Not run:
- frontend unit/integration tests
  Reason: frontend policy is PRD E2E only.
- full historical E2E suite
  Reason: out of current PRD scope.

New/updated cases:
- tests/e2e/<feature>.spec.ts
```

## Test Accounts And Production Reproduction

Default to aliases from `~/.rig/RIG.md`.

- Staging/preview accounts may write only inside test workspaces.
- Production accounts must be read-only by default.
- Production tests must be opt-in and tagged, e.g. `@prod-readonly`.
- `yarn test` must never run production.
- `playwright/.auth` must be gitignored.
- Storage state, cookies, tokens, screenshots, traces, HAR, and console logs may contain secrets.

Production reproduction is read-only unless the user explicitly approves a guarded action.

```bash
yarn playwright test --project=chromium-production --grep @prod-readonly --trace on
```

## Hard Rules

- Use `yarn`, never `npm`, `pnpm`, or `npx`.
- Do not write personal Vault content into `projects/<project>`.
- Do not put secrets or private account sources into project repos.
- Do not run a separate multi-agent state machine inside a project repo; coordinate through one local Vault.
- Do not store custom role prompts in project repos; use `~/.rig/crew/roles/<role>/`.
- Do not overwrite unrelated Vault `CLAUDE.md` / `AGENTS.md` content; update only the managed `rig-crew` block.
- Do not overwrite existing agent work files on repeated `rig crew init`; only create missing files or update explicit managed blocks.
- Researcher reports default to Vault paths configured in `~/.rig/RIG.md`.
- For frontend testing, prefer one high-value PRD E2E over many low-signal unit/integration tests.
- If a required account alias is missing, run or recommend `rig crew doctor`; do not guess credentials.
