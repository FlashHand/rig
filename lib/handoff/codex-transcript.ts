import fs from 'fs';
import path from 'path';
import { StringDecoder } from 'string_decoder';
import { readCodexLatestPointer } from './codex-pointer';

type JsonObject = Record<string, any>;

export interface CodexIntakeOptions {
  before?: number;
  limit?: number;
  maxChars?: number;
  full?: boolean;
}

export interface CodexReadOptions {
  from?: number;
  limit?: number;
  maxChars?: number;
  full?: boolean;
}

const CODEX_PREFLUSH_POINTER_MAX_AGE_MS = 2 * 60 * 1000;

interface CodexTranscriptLine {
  line: number;
  value?: JsonObject;
  parseError?: string;
}

interface ToolCall {
  line: number;
  turnId?: string;
  callId: string;
  tool: string;
  arguments: unknown;
  source: string;
}

interface WebSearchEvidence {
  line: number;
  turnId?: string;
  callId: string;
  status?: string;
  action?: JsonObject;
}

interface TurnAbort {
  line: number;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface SessionMeta {
  threadId?: string;
  sessionId?: string;
  cwd?: string;
  cliVersion?: string;
  parentThreadId?: string;
  forkedFromId?: string;
  agentPath?: string;
  threadSource?: string;
}

export function assertCodexTranscriptPath(transcriptPath: string): string {
  const absolute = path.resolve(transcriptPath);
  if (!absolute.endsWith('.jsonl')) throw new Error(`Codex transcript must be a .jsonl file: ${absolute}`);
  let stat: fs.Stats;
  try { stat = fs.statSync(absolute); } catch { throw new Error(`Codex transcript not found: ${absolute}`); }
  if (!stat.isFile()) throw new Error(`Codex transcript is not a file: ${absolute}`);
  return absolute;
}

export function* iterateCodexTranscript(transcriptPath: string): Generator<CodexTranscriptLine> {
  const absolute = assertCodexTranscriptPath(transcriptPath);
  const fd = fs.openSync(absolute, 'r');
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.alloc(64 * 1024);
  let pending = '';
  let line = 0;
  const parse = (raw: string): CodexTranscriptLine => {
    line++;
    try {
      const value = JSON.parse(raw);
      if (!isObject(value)) return { line, parseError: 'line is not a JSON object' };
      return { line, value };
    } catch (error) {
      return { line, parseError: error instanceof Error ? error.message : String(error) };
    }
  };

  try {
    let bytes = 0;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      pending += decoder.write(buffer.subarray(0, bytes));
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const raw = pending.slice(0, newline).replace(/\r$/, '');
        pending = pending.slice(newline + 1);
        if (raw.trim()) yield parse(raw);
        newline = pending.indexOf('\n');
      }
    }
    pending += decoder.end();
    if (pending.trim()) yield parse(pending.replace(/\r$/, ''));
  } finally {
    fs.closeSync(fd);
  }
}

export function intakeCodexTranscript(transcriptPath: string, options: CodexIntakeOptions = {}): JsonObject {
  const absolute = assertCodexTranscriptPath(transcriptPath);
  const stat = fs.statSync(absolute);
  const before = clampInteger(options.before, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(options.limit, 24, 1, 200);
  const maxChars = options.full ? Number.MAX_SAFE_INTEGER : clampInteger(options.maxChars, 4000, 256, 1000000);
  const topTypes: Record<string, number> = {};
  const payloadTypes: Record<string, number> = {};
  const unknownPayloadTypes: Record<string, number> = {};
  const omitted = { reasoning: 0, telemetry: 0, developerMessages: 0, worldState: 0, encrypted: 0 };
  const entries: JsonObject[] = [];
  const fallbackMessages: JsonObject[] = [];
  const messageEntries = new Map<string, JsonObject>();
  const calls = new Map<string, ToolCall>();
  const completedCalls = new Set<string>();
  const webSearches = new Map<string, WebSearchEvidence>();
  const editedFiles = new Map<string, JsonObject>();
  const failedPatches: JsonObject[] = [];
  const turnStarts = new Map<string, number>();
  const turnCompletions = new Map<string, number>();
  const turnFinals = new Set<string>();
  const turnAbortions = new Map<string, TurnAbort>();
  const turnOrder: string[] = [];
  const seenTurns = new Set<string>();
  const rolledBackTurns = new Map<string, number>();
  const rollbackEvents: JsonObject[] = [];
  const subagentIds = new Map<string, { agentPath?: string; lastActivityKind?: string }>();
  let session: SessionMeta = {};
  let sessionCaptured = false;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let totalLines = 0;
  let malformedLines = 0;
  let compacted = 0;
  let lastCompactionLine: number | null = null;
  let latestTurnId: string | undefined;

  for (const item of iterateCodexTranscript(absolute)) {
    totalLines = item.line;
    if (!item.value) {
      malformedLines++;
      continue;
    }
    const row = item.value;
    const topType = stringValue(row.type) || 'unknown';
    const payload = isObject(row.payload) ? row.payload : {};
    const payloadType = stringValue(payload.type) || '';
    topTypes[topType] = (topTypes[topType] || 0) + 1;
    if (payloadType) payloadTypes[payloadType] = (payloadTypes[payloadType] || 0) + 1;
    if (typeof row.timestamp === 'string') {
      if (!firstTimestamp) firstTimestamp = row.timestamp;
      lastTimestamp = row.timestamp;
    }

    if (topType === 'session_meta') {
      if (!sessionCaptured) {
        session = captureSessionMeta(payload);
        sessionCaptured = true;
      }
      continue;
    }
    if (topType === 'world_state') {
      omitted.worldState++;
      continue;
    }
    if (topType === 'compacted') {
      compacted++;
      lastCompactionLine = item.line;
      omitted.encrypted += countForbiddenKeys(payload, 'encrypted_content');
      continue;
    }
    if (topType === 'response_item') {
      if (payloadType === 'reasoning') {
        omitted.reasoning++;
        omitted.encrypted += countForbiddenKeys(payload, 'encrypted_content');
        continue;
      }
      if (payloadType === 'message') {
        const role = stringValue(payload.role);
        if (role !== 'user' && role !== 'assistant') {
          if (role === 'developer' || role === 'system') omitted.developerMessages++;
          continue;
        }
        const content = extractTextContent(payload.content, maxChars);
        if (!content.length) continue;
        const turnId = getTurnId(payload);
        const phase = stringValue(payload.phase);
        const entry = removeUndefined({
          type: 'message', line: item.line, turnId, role, phase, content, source: 'response_item',
        });
        entries.push(entry);
        messageEntries.set(messageFingerprint(role, phase, content), entry);
        rememberTurn(turnId, turnOrder, seenTurns);
        if (role === 'assistant' && phase === 'final_answer' && turnId) turnFinals.add(turnId);
        continue;
      }
      if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
        const call = normalizeToolCall(payload, payloadType, item.line, maxChars);
        if (call) calls.set(call.callId, call);
        if (call) rememberTurn(call.turnId, turnOrder, seenTurns);
        continue;
      }
      if (payloadType === 'tool_search_call') {
        const call = normalizeToolSearchCall(payload, item.line, maxChars);
        if (call) {
          calls.set(call.callId, call);
          rememberTurn(call.turnId, turnOrder, seenTurns);
        }
        continue;
      }
      if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
        const callId = stringValue(payload.call_id);
        if (!callId) continue;
        const call = calls.get(callId);
        completedCalls.add(callId);
        entries.push(removeUndefined({
          type: 'tool-exchange',
          line: item.line,
          callLine: call && call.line,
          turnId: call && call.turnId || getTurnId(payload),
          callId,
          tool: call && call.tool || '<unknown>',
          arguments: call && call.arguments,
          output: sanitizeRecovery(payload.output, maxChars),
          source: call && call.source || payloadType,
        }));
        continue;
      }
      if (payloadType === 'tool_search_output') {
        const callId = stringValue(payload.call_id) || stringValue(payload.id);
        if (!callId) continue;
        const call = calls.get(callId);
        completedCalls.add(callId);
        entries.push(removeUndefined({
          type: 'tool-exchange',
          line: item.line,
          callLine: call && call.line,
          turnId: call && call.turnId || getTurnId(payload),
          callId,
          tool: 'tool_search',
          arguments: call && call.arguments,
          output: removeUndefined({
            status: stringValue(payload.status),
            tools: summarizeToolDefinitions(payload.tools),
          }),
          source: 'tool_search',
        }));
        continue;
      }
      if (payloadType === 'web_search_call') {
        const callId = stringValue(payload.call_id) || stringValue(payload.id) || `web-search-line-${item.line}`;
        const evidence = removeUndefined({
          line: item.line,
          turnId: getTurnId(payload),
          callId,
          status: stringValue(payload.status),
          action: normalizeWebSearchAction(payload.action, maxChars),
        }) as WebSearchEvidence;
        webSearches.set(callId, evidence);
        rememberTurn(evidence.turnId, turnOrder, seenTurns);
        continue;
      }
      if (payloadType === 'agent_message') {
        const content = extractTextContent(payload.content, maxChars);
        if (content.length) entries.push(removeUndefined({
          type: 'agent-message', line: item.line, turnId: getTurnId(payload),
          author: payload.author, recipient: payload.recipient, content,
        }));
        omitted.encrypted += countForbiddenKeys(payload, 'encrypted_content');
        continue;
      }
      unknownPayloadTypes[`response_item:${payloadType || '<missing>'}`] = (unknownPayloadTypes[`response_item:${payloadType || '<missing>'}`] || 0) + 1;
      continue;
    }

    if (topType === 'event_msg') {
      if (payloadType === 'agent_reasoning') {
        omitted.reasoning++;
        continue;
      }
      if (payloadType === 'token_count' || payloadType === 'thread_settings_applied') {
        omitted.telemetry++;
        continue;
      }
      if (payloadType === 'task_started') {
        const turnId = stringValue(payload.turn_id);
        if (turnId) {
          turnStarts.set(turnId, item.line);
          rememberTurn(turnId, turnOrder, seenTurns);
          latestTurnId = turnId;
        }
        continue;
      }
      if (payloadType === 'task_complete') {
        const turnId = stringValue(payload.turn_id);
        if (turnId) turnCompletions.set(turnId, item.line);
        continue;
      }
      if (payloadType === 'turn_aborted') {
        const turnId = stringValue(payload.turn_id);
        if (turnId) {
          rememberTurn(turnId, turnOrder, seenTurns);
          const aborted = removeUndefined({
            line: item.line,
            reason: stringValue(payload.reason),
            startedAt: normalizeTimestamp(payload.started_at),
            completedAt: normalizeTimestamp(payload.completed_at),
            durationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : undefined,
          }) as TurnAbort;
          turnAbortions.set(turnId, aborted);
          entries.push(removeUndefined({ type: 'turn-aborted', turnId, ...aborted }));
        }
        continue;
      }
      if (payloadType === 'thread_rolled_back') {
        const numTurns = clampInteger(
          typeof payload.num_turns === 'number' ? payload.num_turns : undefined,
          1,
          1,
          1000,
        );
        const rolledBackTurnIds: string[] = [];
        for (let index = turnOrder.length - 1; index >= 0 && rolledBackTurnIds.length < numTurns; index--) {
          const turnId = turnOrder[index];
          if (rolledBackTurns.has(turnId)) continue;
          rolledBackTurns.set(turnId, item.line);
          rolledBackTurnIds.push(turnId);
        }
        const rollback = { line: item.line, numTurns, rolledBackTurnIds };
        rollbackEvents.push(rollback);
        entries.push({ type: 'rollback', ...rollback });
        continue;
      }
      if (payloadType === 'user_message' || payloadType === 'agent_message') {
        const role = payloadType === 'user_message' ? 'user' : 'assistant';
        const turnId = getTurnId(payload);
        rememberTurn(turnId, turnOrder, seenTurns);
        const content = extractTextContent(payload.message, maxChars);
        const localImages = role === 'user'
          ? extractLocalImagePaths(payload.local_images || payload.images, maxChars)
          : [];
        if (content.length || localImages.length) fallbackMessages.push(removeUndefined({
          type: 'message', line: item.line, turnId, role,
          phase: role === 'assistant' ? payload.phase : undefined,
          content, localImages: localImages.length ? localImages : undefined, source: 'event_msg',
        }));
        continue;
      }
      if (payloadType === 'patch_apply_end') {
        const files = capturePatchFiles(payload.changes, item.line, getTurnId(payload));
        for (const file of files) editedFiles.set(file.path, file);
        if (payload.success === false) failedPatches.push(removeUndefined({
          line: item.line, turnId: getTurnId(payload), callId: payload.call_id, status: payload.status,
        }));
        continue;
      }
      if (payloadType === 'image_generation_end') {
        entries.push(removeUndefined({
          type: 'generated-image',
          line: item.line,
          turnId: getTurnId(payload),
          callId: stringValue(payload.call_id),
          status: stringValue(payload.status),
          savedPath: truncateMiddle(payload.saved_path, maxChars),
        }));
        continue;
      }
      if (payloadType === 'thread_goal_updated') {
        const goal = isObject(payload.goal) ? payload.goal : {};
        entries.push(removeUndefined({
          type: 'goal', line: item.line, objective: truncateMiddle(goal.objective, maxChars), status: goal.status,
        }));
        continue;
      }
      if (payloadType === 'sub_agent_activity') {
        const threadId = stringValue(payload.agent_thread_id);
        if (threadId) subagentIds.set(threadId, {
          agentPath: stringValue(payload.agent_path),
          lastActivityKind: stringValue(payload.kind),
        });
        continue;
      }
      if (payloadType.includes('error')) {
        entries.push(removeUndefined({
          type: 'error', line: item.line, turnId: getTurnId(payload),
          message: sanitizeRecovery(payload.message || payload.error || payload, maxChars),
        }));
        continue;
      }
      // Patch/MCP completion rows are intentionally omitted here. Their
      // response_item call/output pair is the stable model-facing evidence.
      if (!['context_compacted', 'web_search_end', 'mcp_tool_call_end'].includes(payloadType)) {
        unknownPayloadTypes[`event_msg:${payloadType || '<missing>'}`] = (unknownPayloadTypes[`event_msg:${payloadType || '<missing>'}`] || 0) + 1;
      }
      continue;
    }

    if (topType !== 'turn_context' && topType !== 'inter_agent_communication_metadata') {
      unknownPayloadTypes[`${topType}:${payloadType || '<missing>'}`] = (unknownPayloadTypes[`${topType}:${payloadType || '<missing>'}`] || 0) + 1;
    }
  }

  for (const fallback of fallbackMessages) {
    const fingerprint = messageFingerprint(fallback.role, fallback.phase, fallback.content);
    const existing = messageEntries.get(fingerprint);
    if (existing) {
      if (Array.isArray(fallback.localImages) && fallback.localImages.length) {
        existing.localImages = fallback.localImages;
      }
    } else {
      entries.push(fallback);
      messageEntries.set(fingerprint, fallback);
    }
  }
  for (const call of calls.values()) {
    if (completedCalls.has(call.callId)) continue;
    entries.push(removeUndefined({
      type: 'tool-exchange', line: call.line, callLine: call.line, turnId: call.turnId,
      callId: call.callId, tool: call.tool, arguments: call.arguments,
      pending: true, source: call.source,
    }));
  }
  for (const search of webSearches.values()) entries.push(removeUndefined({ type: 'web-search', ...search }));
  const activeEntries = entries
    .filter(entry => !entry.turnId || !rolledBackTurns.has(entry.turnId))
    .sort((a, b) => a.line - b.line);
  const eligible = activeEntries.filter(entry => entry.line < before);
  const pageChronological = eligible.slice(Math.max(0, eligible.length - limit));
  const pageEntries = pageChronological.slice().reverse();
  const oldestLine = pageEntries.length ? pageEntries[pageEntries.length - 1].line : null;
  const hasOlder = eligible.length > pageChronological.length;
  const activeLatestTurnId = findLatestActiveTurn(turnOrder, rolledBackTurns) || (
    latestTurnId && !rolledBackTurns.has(latestTurnId) ? latestTurnId : undefined
  );
  const activeLastUserLine = activeEntries.reduce<number | null>((latest, entry) => (
    entry.type === 'message' && entry.role === 'user' ? entry.line : latest
  ), null);
  const latestStartedLine = activeLatestTurnId ? turnStarts.get(activeLatestTurnId) : undefined;
  const latestAbort = activeLatestTurnId ? turnAbortions.get(activeLatestTurnId) : undefined;
  const pendingToolCalls = Array.from(calls.values())
    .filter(call => !completedCalls.has(call.callId)
      && !rolledBackTurns.has(call.turnId || '')
      && (!activeLatestTurnId || call.turnId === activeLatestTurnId))
    .map(call => ({ callId: call.callId, tool: call.tool, line: call.line }));

  return {
    schemaVersion: 1,
    source: 'codex-rollout',
    transcriptPath: absolute,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    session: removeUndefined({ ...session, firstTimestamp, lastTimestamp }),
    stats: {
      lines: totalLines,
      malformedLines,
      topTypes,
      payloadTypes,
      recoverableEntries: activeEntries.length,
      omitted,
      unknownPayloadTypes,
    },
    compaction: { count: compacted, lastLine: lastCompactionLine, readableCheckpoint: false },
    rollbacks: {
      count: rollbackEvents.length,
      events: rollbackEvents.slice(-20),
      excludedTurnIds: Array.from(rolledBackTurns.keys()),
    },
    currentTurn: removeUndefined({
      turnId: activeLatestTurnId,
      startedLine: latestStartedLine,
      completed: activeLatestTurnId ? turnCompletions.has(activeLatestTurnId) : undefined,
      completionLine: activeLatestTurnId ? turnCompletions.get(activeLatestTurnId) : undefined,
      hasFinalAnswer: activeLatestTurnId ? turnFinals.has(activeLatestTurnId) : undefined,
      aborted: !!latestAbort,
      abortLine: latestAbort && latestAbort.line,
      abortReason: latestAbort && latestAbort.reason,
      lastUserLine: activeLastUserLine,
      pendingToolCalls,
    }),
    workspaceEvidence: {
      editedFiles: Array.from(editedFiles.values())
        .map(file => rolledBackTurns.has(file.turnId || '') ? { ...file, rolledBack: true } : file)
        .sort((a, b) => b.line - a.line)
        .slice(0, 80),
      failedPatches: failedPatches.map(patch => rolledBackTurns.has(patch.turnId || '')
        ? { ...patch, rolledBack: true }
        : patch),
    },
    subagentTranscripts: resolveSubagentTranscripts(absolute, subagentIds),
    page: {
      direction: 'newest-to-oldest',
      beforeLine: Math.min(before, totalLines + 1),
      newestLine: pageEntries.length ? pageEntries[0].line : null,
      oldestLine,
      nextBeforeLine: hasOlder ? oldestLine : null,
      hasOlder,
      entries: pageEntries,
    },
    guidance: {
      next: hasOlder ? `If material evidence is missing, rerun with --before ${oldestLine}.` : 'No older recovery entries remain.',
      privacy: 'Private reasoning, encrypted content, runtime developer messages, world state, and token telemetry were omitted.',
      state: 'Rolled-back dialogue is excluded and aborted turns are labeled. Reconcile transcript evidence against the current workspace and Git state before continuing.',
    },
  };
}

export function inspectCodexTranscript(transcriptPath: string, options: { recent?: number; maxChars?: number } = {}): JsonObject {
  return intakeCodexTranscript(transcriptPath, {
    limit: clampInteger(options.recent, 20, 1, 200),
    maxChars: clampInteger(options.maxChars, 4000, 256, 100000),
  });
}

export function readCodexTranscriptPage(transcriptPath: string, options: CodexReadOptions = {}): JsonObject {
  const absolute = assertCodexTranscriptPath(transcriptPath);
  const from = clampInteger(options.from, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(options.limit, 80, 1, 1000);
  const maxChars = options.full ? Number.MAX_SAFE_INTEGER : clampInteger(options.maxChars, 12000, 256, 1000000);
  const entries: JsonObject[] = [];
  let endLine = from - 1;
  let hasMore = false;
  for (const item of iterateCodexTranscript(absolute)) {
    if (item.line < from) continue;
    if (entries.length >= limit) {
      hasMore = true;
      break;
    }
    endLine = item.line;
    if (!item.value) entries.push({ line: item.line, type: 'parse-error', error: item.parseError });
    else entries.push(normalizeDiagnosticRow(item.value, item.line, maxChars));
  }
  return { schemaVersion: 1, source: 'codex-rollout', transcriptPath: absolute, fromLine: from, endLine, nextLine: hasMore ? endLine + 1 : null, hasMore, entries };
}

export function findLatestCodexTranscript(sessionsDir: string, cwd?: string, pointerPath?: string): string | null {
  const wanted = cwd ? path.resolve(cwd) : undefined;
  let savedPointer: { path: string; updatedAt: number; fresh: boolean } | null = null;
  if (pointerPath) {
    const pointer = readCodexLatestPointer(pointerPath);
    if (pointer && (!wanted || path.resolve(pointer.cwd) === wanted)) {
      // The hook's exact path and cwd are authoritative for the live turn.
      // The JSONL may not have been flushed yet, and session_meta.cwd can
      // remain the startup directory after the client changes workspace.
      const pointerTranscript = path.resolve(pointer.transcriptPath);
      try {
        const stat = fs.statSync(pointerTranscript);
        if (stat.isFile()) {
          const meta = readCodexSessionMeta(pointerTranscript);
          if (!meta.agentPath && meta.threadSource !== 'subagent') {
            savedPointer = {
              path: pointerTranscript,
              updatedAt: Date.parse(pointer.updatedAt) || stat.mtimeMs,
              fresh: isFreshPointerTimestamp(pointer.updatedAt),
            };
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT'
          && isFreshPointerTimestamp(pointer.updatedAt)) return pointerTranscript;
      }
    }
  }

  const files: { path: string; mtime: number }[] = [];
  if (savedPointer && savedPointer.fresh) return savedPointer.path;
  walkJsonl(sessionsDir, files, 0);
  files.sort((a, b) => b.mtime - a.mtime);
  let latestRoot: { path: string; mtime: number } | null = null;
  for (const candidate of files) {
    const meta = readCodexSessionMeta(candidate.path);
    // agent_path/thread_source are explicit subagent markers. parent_thread_id
    // and forked_from_id may also describe a user-created top-level fork.
    if (meta.agentPath || meta.threadSource === 'subagent') continue;
    if (!meta.threadId && !meta.sessionId) continue;
    if (wanted && (!meta.cwd || path.resolve(meta.cwd) !== wanted)) continue;
    latestRoot = candidate;
    break;
  }
  if (!savedPointer) return latestRoot && latestRoot.path;
  if (!latestRoot || latestRoot.path === savedPointer.path) return savedPointer.path;
  return latestRoot.mtime > savedPointer.updatedAt ? latestRoot.path : savedPointer.path;
}

export function readCodexSessionMeta(transcriptPath: string): SessionMeta {
  try {
    for (const item of iterateCodexTranscript(transcriptPath)) {
      if (!item.value) continue;
      if (item.value.type === 'session_meta' && isObject(item.value.payload)) return captureSessionMeta(item.value.payload);
      if (item.line > 20) break;
    }
  } catch { /* invalid candidates are ignored by latest selection */ }
  return {};
}

function normalizeToolCall(payload: JsonObject, payloadType: string, line: number, maxChars: number): ToolCall | null {
  const callId = stringValue(payload.call_id);
  if (!callId) return null;
  const namespace = stringValue(payload.namespace);
  const name = stringValue(payload.name) || '<unknown>';
  const tool = namespace ? `${namespace}.${name}` : name;
  let args = payloadType === 'function_call' ? payload.arguments : payload.input;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { /* retain string */ }
  }
  return { line, turnId: getTurnId(payload), callId, tool, arguments: sanitizeRecovery(args, maxChars), source: payloadType };
}

function normalizeToolSearchCall(payload: JsonObject, line: number, maxChars: number): ToolCall | null {
  const callId = stringValue(payload.call_id) || stringValue(payload.id);
  if (!callId) return null;
  let args = payload.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { /* retain string */ }
  }
  return {
    line,
    turnId: getTurnId(payload),
    callId,
    tool: 'tool_search',
    arguments: sanitizeRecovery(args, maxChars),
    source: 'tool_search',
  };
}

function normalizeWebSearchAction(value: unknown, maxChars: number): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const result: JsonObject = {};
  for (const key of ['type', 'query', 'url', 'pattern']) {
    const item = stringValue(value[key]);
    if (item) result[key] = truncateMiddle(item, maxChars);
  }
  if (Array.isArray(value.queries)) {
    const queries = value.queries
      .filter((item: unknown): item is string => typeof item === 'string')
      .slice(0, 50)
      .map((item: string) => truncateMiddle(item, maxChars));
    if (queries.length) result.queries = queries;
  }
  return Object.keys(result).length ? result : undefined;
}

function summarizeToolDefinitions(value: unknown): JsonObject {
  if (!Array.isArray(value)) return { count: 0, names: [] };
  const names: string[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const name = stringValue(item.name) || stringValue(item.tool_name);
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= 80) break;
  }
  return { count: value.length, names };
}

function normalizeDiagnosticRow(row: JsonObject, line: number, maxChars: number): JsonObject {
  const topType = stringValue(row.type) || 'unknown';
  const payload = isObject(row.payload) ? row.payload : {};
  const payloadType = stringValue(payload.type) || '';
  if (topType === 'session_meta') return { line, type: topType, session: captureSessionMeta(payload) };
  if (topType === 'response_item' && payloadType === 'message') {
    const role = stringValue(payload.role);
    if (role === 'user' || role === 'assistant') return removeUndefined({ line, type: 'message', role, phase: payload.phase, turnId: getTurnId(payload), content: extractTextContent(payload.content, maxChars) });
  }
  if (topType === 'response_item' && (payloadType === 'function_call' || payloadType === 'custom_tool_call')) {
    const call = normalizeToolCall(payload, payloadType, line, maxChars);
    return call ? { type: 'tool-call', ...call } : { line, type: 'omitted', sourceType: `${topType}:${payloadType}` };
  }
  if (topType === 'response_item' && (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output')) {
    return { line, type: 'tool-output', callId: payload.call_id, output: sanitizeRecovery(payload.output, maxChars) };
  }
  if (topType === 'response_item' && payloadType === 'web_search_call') {
    return removeUndefined({
      line,
      type: 'web-search',
      callId: payload.call_id || payload.id,
      status: payload.status,
      action: normalizeWebSearchAction(payload.action, maxChars),
    });
  }
  if (topType === 'response_item' && payloadType === 'tool_search_call') {
    const call = normalizeToolSearchCall(payload, line, maxChars);
    return call ? { type: 'tool-call', ...call } : { line, type: 'omitted', sourceType: `${topType}:${payloadType}` };
  }
  if (topType === 'response_item' && payloadType === 'tool_search_output') {
    return {
      line,
      type: 'tool-output',
      callId: payload.call_id || payload.id,
      status: payload.status,
      tools: summarizeToolDefinitions(payload.tools),
    };
  }
  if (topType === 'event_msg' && payloadType === 'user_message') {
    return removeUndefined({
      line,
      type: 'message',
      role: 'user',
      turnId: getTurnId(payload),
      content: extractTextContent(payload.message, maxChars),
      localImages: extractLocalImagePaths(payload.local_images || payload.images, maxChars),
    });
  }
  if (topType === 'event_msg' && payloadType === 'patch_apply_end') {
    return { line, type: 'patch', success: payload.success, status: payload.status, changedFiles: capturePatchFiles(payload.changes, line, getTurnId(payload)) };
  }
  if (topType === 'event_msg' && payloadType === 'turn_aborted') {
    return removeUndefined({ line, type: 'turn-aborted', turnId: payload.turn_id, reason: payload.reason });
  }
  if (topType === 'event_msg' && payloadType === 'thread_rolled_back') {
    return { line, type: 'rollback', numTurns: payload.num_turns };
  }
  if (topType === 'event_msg' && payloadType === 'image_generation_end') {
    return removeUndefined({
      line,
      type: 'generated-image',
      callId: payload.call_id,
      status: payload.status,
      savedPath: truncateMiddle(payload.saved_path, maxChars),
    });
  }
  return { line, type: 'omitted', sourceType: `${topType}:${payloadType || '<missing>'}` };
}

function captureSessionMeta(payload: JsonObject): SessionMeta {
  return removeUndefined({
    threadId: stringValue(payload.id),
    sessionId: stringValue(payload.session_id),
    cwd: stringValue(payload.cwd),
    cliVersion: stringValue(payload.cli_version),
    parentThreadId: stringValue(payload.parent_thread_id),
    forkedFromId: stringValue(payload.forked_from_id),
    agentPath: stringValue(payload.agent_path),
    threadSource: stringValue(payload.thread_source),
  });
}

function capturePatchFiles(changes: unknown, line: number, turnId?: string): JsonObject[] {
  if (!isObject(changes)) return [];
  return Object.entries(changes).map(([filePath, change]) => {
    const detail = isObject(change) ? change : {};
    return removeUndefined({
      path: filePath,
      line,
      turnId,
      changeType: detail.type || detail.change_type || detail.kind,
      movePath: detail.move_path || detail.movePath,
    });
  });
}

function extractLocalImagePaths(value: unknown, maxChars: number): JsonObject[] {
  if (!Array.isArray(value)) return [];
  const result: JsonObject[] = [];
  for (const item of value) {
    const candidate = typeof item === 'string'
      ? item
      : isObject(item) ? stringValue(item.path) || stringValue(item.local_path) : undefined;
    if (!candidate || !path.isAbsolute(candidate)) continue;
    result.push({ path: truncateMiddle(candidate, maxChars) });
    if (result.length >= 40) break;
  }
  return result;
}

function extractTextContent(value: unknown, maxChars: number): JsonObject[] {
  if (typeof value === 'string') return value.trim() ? [{ type: 'text', text: truncateMiddle(value, maxChars) }] : [];
  if (!Array.isArray(value)) return [];
  const result: JsonObject[] = [];
  for (const block of value) {
    if (!isObject(block)) continue;
    const type = stringValue(block.type);
    if (type !== 'input_text' && type !== 'output_text' && type !== 'text') continue;
    const text = stringValue(block.text);
    if (text && text.trim()) result.push({ type: 'text', text: truncateMiddle(text, maxChars) });
  }
  return result;
}

function messageFingerprint(role: unknown, phase: unknown, content: unknown): string {
  return `${String(role)}\u0000${String(phase || '')}\u0000${JSON.stringify(content)}`;
}

function rememberTurn(turnId: string | undefined, order: string[], seen: Set<string>): void {
  if (!turnId || seen.has(turnId)) return;
  seen.add(turnId);
  order.push(turnId);
}

function findLatestActiveTurn(order: string[], rolledBack: Map<string, number>): string | undefined {
  for (let index = order.length - 1; index >= 0; index--) {
    if (!rolledBack.has(order[index])) return order[index];
  }
  return undefined;
}

function getTurnId(payload: JsonObject): string | undefined {
  const metadata = isObject(payload.internal_chat_message_metadata_passthrough)
    ? payload.internal_chat_message_metadata_passthrough : {};
  return stringValue(metadata.turn_id) || stringValue(payload.turn_id);
}

function sanitizeRecovery(value: unknown, maxChars: number, depth = 0): unknown {
  if (depth > 8) return '[depth omitted]';
  if (typeof value === 'string') return truncateMiddle(value, maxChars);
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map(item => sanitizeRecovery(item, maxChars, depth + 1));
  if (!isObject(value)) return String(value);
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenKey(key)) continue;
    result[key] = sanitizeRecovery(child, maxChars, depth + 1);
  }
  return result;
}

function isForbiddenKey(key: string): boolean {
  return [
    'encrypted_content', 'reasoning', 'signature', 'base_instructions',
    'dynamic_tools', 'developer_instructions', 'world_state', 'rate_limits',
    'token_count', 'token_usage',
  ].includes(key);
}

function countForbiddenKeys(value: unknown, key: string, depth = 0): number {
  if (depth > 8 || !value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + countForbiddenKeys(child, key, depth + 1), 0);
  let count = 0;
  for (const [name, child] of Object.entries(value as JsonObject)) {
    if (name === key) count++;
    count += countForbiddenKeys(child, key, depth + 1);
  }
  return count;
}

function resolveSubagentTranscripts(
  transcriptPath: string,
  ids: Map<string, { agentPath?: string; lastActivityKind?: string }>,
): JsonObject[] {
  if (ids.size === 0) return [];
  const root = findSessionsRoot(transcriptPath);
  if (!root) return Array.from(ids.entries()).map(([threadId, detail]) => ({ threadId, ...detail }));
  const files: { path: string; mtime: number }[] = [];
  walkJsonl(root, files, 0);
  return Array.from(ids.entries()).map(([threadId, detail]) => {
    const match = files.find(file => path.basename(file.path).includes(threadId));
    return removeUndefined({ threadId, path: match && match.path, ...detail });
  });
}

function findSessionsRoot(value: string): string | null {
  let current = path.dirname(path.resolve(value));
  while (path.dirname(current) !== current) {
    if (path.basename(current) === 'sessions') return current;
    current = path.dirname(current);
  }
  return null;
}

function walkJsonl(dir: string, files: { path: string; mtime: number }[], depth: number): void {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const candidate = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonl(candidate, files, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try { files.push({ path: candidate, mtime: fs.statSync(candidate).mtimeMs }); } catch { /* ignore races */ }
    }
  }
}

function truncateMiddle(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string' || value.length <= maxChars) return value;
  const marker = `\n… ${value.length - maxChars} chars omitted …\n`;
  const available = Math.max(2, maxChars - marker.length);
  const head = Math.ceil(available / 2);
  return value.slice(0, head) + marker + value.slice(value.length - (available - head));
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isFreshPointerTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -30000 && age <= CODEX_PREFLUSH_POINTER_MAX_AGE_MS;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const milliseconds = Math.abs(value) < 100000000000 ? value * 1000 : value;
  try { return new Date(milliseconds).toISOString(); } catch { return undefined; }
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function removeUndefined<T extends JsonObject>(value: T): T {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}
