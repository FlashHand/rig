# rig wiki — Agent adapter

> Status: Draft v0 — 2026-05-17.
> v1 implementation: Claude Code only. Codex / pi-agent are speced as stubs so the interface is forward-compatible.

---

## 1. Single interface

`lib/wiki/agent/types.ts`:

```ts
export type AgentName = 'claude' | 'codex' | 'pi';

export interface AgentAdapter {
  name: AgentName;

  /** Returns whether the CLI is on PATH and which version. */
  detect(): Promise<{ installed: boolean; version?: string; path?: string }>;

  /**
   * One-shot non-interactive run.
   * The host has already copied the wiki dir into `cwd` (a sandbox).
   * The adapter spawns the CLI, waits for completion, returns stdout/stderr.
   * The host then diffs sandbox vs original to extract writes.
   */
  run(opts: AgentRunOpts): Promise<AgentRunResult>;
}

export interface AgentRunOpts {
  prompt: string;                              // user-facing instruction
  systemPrompt?: string;                       // appended to the agent's system prompt
  files?: string[];                            // extra files to inject (read-only)
  cwd: string;                                 // sandbox path
  allowWrite: boolean;                         // ingest=true, query/lint=false
  tools?: ('webfetch' | 'qmd' | 'bash')[];     // tool whitelist hint
  timeoutMs?: number;                          // hard kill after this
}

export interface AgentRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number;
}
```

The **host** (not the adapter) handles the diff-vs-original step. That keeps adapters small and means we don't trust any agent's "I wrote these files" report.

---

## 2. Sandbox-copy-and-diff flow

For any operation that may write:

```
1. host: mkdir ~/.rig/cache/sandbox/<wiki>/<run-id>/
2. host: copy <wiki-dir> → sandbox  (excluding raw/, purpose.md, schema.md — read-only)
3. host: write read-only injection files (purpose.md, schema.md, etc.) into sandbox/.rig-readonly/
4. host: adapter.run({ cwd: sandbox, allowWrite: true, ... })
5. host: diff sandbox vs <wiki-dir> using `diff -urN`
6. host: filter diff (reject any patch touching raw/, purpose.md, schema.md)
7. host: present diff to user (or apply directly in daemon `--apply` mode)
8. host: rm -rf sandbox
```

Rationale: all three target agents (Claude, Codex, pi) have different permission models; this flow normalizes them. Even a fully unrestricted agent can't corrupt the real wiki because step 6 throws away forbidden patches.

---

## 3. Claude Code adapter (v1 — only implementation)

`lib/wiki/agent/claude.ts`:

```ts
spawn('claude', [
  '-p',                                    // print mode (non-interactive)
  '--system-prompt', systemPrompt,
  ...allowedToolsFlags(opts.allowWrite, opts.tools),
  opts.prompt
], { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeoutMs });
```

Allowed-tools whitelist (passed via `--allowedTools`):
- `query` / `lint`: `Read, Bash(qmd:*)`
- `ingest`: `Read, Write, Edit, Bash(qmd:*)`
- `fetch`: `Read, Write, WebFetch`

System prompt prepended (host always wraps adapter's `systemPrompt`):
```
You are the executor for `rig wiki <op>`.
You MUST follow <wiki>/schema.md exactly.
You MUST NOT edit raw/, purpose.md, schema.md. Host enforces this and will reject any such patch.
Output is consumed by a CLI; keep stdout to status updates only. Persist actual content by writing files.
```

Version check: parse `claude --version`. Require Claude Code >= 2.0 (tools API stable).

Why no direct Anthropic API:
- Requires an API key + billing setup that not every machine has.
- Different protocol; we'd reinvent the tool plumbing Claude Code already gives us.
- Claude Code is already the user's daily driver — its config (`~/.claude/settings.json`) is the source of truth for credentials and MCP servers.

---

## 4. Codex adapter (stub)

Target: OpenAI's `codex` CLI (the `Codex` agent, not the IDE plugin).

Expected invocation (v1 stub, not implemented):
```ts
spawn('codex', [
  'exec', '--no-tui',
  '--cwd', opts.cwd,
  // codex permission model TBD — likely needs --readonly when !allowWrite
  opts.prompt
], { ... });
```

Open questions before P3 ships this:
- Does codex have a `--allowed-tools`-equivalent flag, or only coarse `--readonly` / full access?
- What does codex print as its "I'm done" signal? Does `--no-tui` exist?
- Does codex respect external `cwd` or insist on its own workspace?

Until those are answered, the adapter `detect()` returns installed but `run()` throws `not-implemented`.

---

## 5. pi-agent adapter (stub)

Target: Personal-Intelligence-style agent CLI. Exact upstream TBD (Bo to specify).

Expected invocation pattern:
```ts
// many pi-agent CLIs take prompt-file to avoid argv-length limits
const tmpFile = await writeTmp(opts.prompt);
spawn('pi', ['run', '--prompt-file', tmpFile, '--cwd', opts.cwd], { ... });
```

Same "open questions" caveat as Codex. Stub `detect()` returns installed when `which pi` succeeds; `run()` throws `not-implemented`.

---

## 6. Choosing the agent

| Operation | Recommended | Why |
|---|---|---|
| `ingest` | Claude | long context, stable tool calls, v1 default |
| `query` | any | whichever is on the box |
| `lint` | Claude or Codex | both do structured scans well |
| `fetch` | any with WebFetch | falls back to `curl` + Readability if absent |

Default agent: `~/.rig/config.json5` → `wiki.defaultAgent` (initially `'claude'`).
Per-invocation override: `--agent <name>` flag.

---

## 7. Detection registry

`lib/wiki/agent/index.ts` exports a single registry:

```ts
import { ClaudeAdapter } from './claude';
import { CodexAdapter } from './codex';
import { PiAdapter } from './pi';
export const adapters: AgentAdapter[] = [
  new ClaudeAdapter(),
  new CodexAdapter(),
  new PiAdapter(),
];
export function getAdapter(name: AgentName) {
  const a = adapters.find(x => x.name === name);
  if (!a) throw new Error(`unknown agent: ${name}`);
  return a;
}
```

`rig wiki agent list` iterates `adapters`, calls `detect()`, prints a table.
`rig wiki agent use <name>` rejects names whose adapter `run()` is `not-implemented`.
