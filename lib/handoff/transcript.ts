import fs from 'fs';
import path from 'path';
import { StringDecoder } from 'string_decoder';

type JsonObject = Record<string, any>;

export interface TranscriptLine {
  line: number;
  value?: JsonObject;
  parseError?: string;
}

export interface InspectOptions {
  recent?: number;
  maxChars?: number;
}

export interface ReadOptions {
  from?: number;
  limit?: number;
  maxChars?: number;
  full?: boolean;
}

export interface IntakeOptions {
  before?: number;
  limit?: number;
  maxChars?: number;
  full?: boolean;
}

interface BranchIndex {
  leafUuid?: string;
  activeUuids: Set<string>;
  indexedUuids: number;
}

interface BranchNode {
  parentUuid: string | null;
  line: number;
  messageId?: string;
  toolUseIds: string[];
  toolResultIds: string[];
  sourceToolAssistantUuid?: string;
}

export function assertTranscriptPath(transcriptPath: string): string {
  const absolute = path.resolve(transcriptPath);
  if (!absolute.endsWith('.jsonl')) throw new Error(`Claude transcript must be a .jsonl file: ${absolute}`);
  let stat: fs.Stats;
  try { stat = fs.statSync(absolute); } catch { throw new Error(`Claude transcript not found: ${absolute}`); }
  if (!stat.isFile()) throw new Error(`Claude transcript is not a file: ${absolute}`);
  return absolute;
}

export function* iterateTranscript(transcriptPath: string): Generator<TranscriptLine> {
  const absolute = assertTranscriptPath(transcriptPath);
  const fd = fs.openSync(absolute, 'r');
  const decoder = new StringDecoder('utf8');
  const buffer = Buffer.alloc(64 * 1024);
  let pending = '';
  let lineNumber = 0;

  const parse = (raw: string): TranscriptLine => {
    lineNumber++;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { line: lineNumber, parseError: 'line is not a JSON object' };
      }
      return { line: lineNumber, value };
    } catch (error) {
      return { line: lineNumber, parseError: error instanceof Error ? error.message : String(error) };
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

export function inspectTranscript(transcriptPath: string, options: InspectOptions = {}): JsonObject {
  const absolute = assertTranscriptPath(transcriptPath);
  const stat = fs.statSync(absolute);
  const recentLimit = clampInteger(options.recent, 20, 1, 200);
  const maxChars = clampInteger(options.maxChars, 4000, 256, 100000);
  const counts: Record<string, number> = {};
  const tools: Record<string, number> = {};
  const models = new Set<string>();
  const recent: JsonObject[] = [];
  const compactSummaries: JsonObject[] = [];
  let malformedLines = 0;
  let totalLines = 0;
  let title: string | undefined;
  let lastPrompt: string | undefined;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  const session: JsonObject = {};
  const branchNodes = new Map<string, BranchNode>();
  let leafUuid: string | undefined;
  let leafLine: number | undefined;

  for (const item of iterateTranscript(absolute)) {
    totalLines = item.line;
    if (!item.value) {
      malformedLines++;
      continue;
    }
    const value = item.value;
    captureBranchNode(branchNodes, value, item.line);
    const type = typeof value.type === 'string' ? value.type : 'unknown';
    counts[type] = (counts[type] || 0) + 1;
    captureSessionFields(session, value);
    if (typeof value.timestamp === 'string') {
      if (!firstTimestamp) firstTimestamp = value.timestamp;
      lastTimestamp = value.timestamp;
    }
    if (type === 'custom-title' && typeof value.customTitle === 'string') title = value.customTitle;
    if (type === 'last-prompt') {
      if (typeof value.lastPrompt === 'string') lastPrompt = truncate(value.lastPrompt, maxChars);
      if (typeof value.leafUuid === 'string') {
        leafUuid = value.leafUuid;
        leafLine = item.line;
      }
    }
    if (type === 'assistant' && value.message && typeof value.message.model === 'string') models.add(value.message.model);
    collectToolNames(value, tools);
    if (value.isCompactSummary === true) {
      compactSummaries.push({ line: item.line, uuid: value.uuid, timestamp: value.timestamp, summary: normalizeMessageContent(value.message && value.message.content, maxChars) });
    } else if (type === 'system' && value.subtype === 'compact_boundary') {
      compactSummaries.push({ line: item.line, uuid: value.uuid, timestamp: value.timestamp, compactMetadata: sanitize(value.compactMetadata, maxChars) });
    }
    if (type === 'user' || type === 'assistant' || type === 'last-prompt') {
      const normalized = normalizeTranscriptEntry(value, item.line, maxChars);
      recent.push(normalized);
      if (recent.length > recentLimit) recent.shift();
    }
  }

  const branch = resolveBranchIndex(branchNodes, leafUuid, leafLine);
  return {
    schemaVersion: 1,
    transcriptPath: absolute,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    lines: totalLines,
    malformedLines,
    session: {
      ...session,
      title,
      firstTimestamp,
      lastTimestamp,
      models: Array.from(models),
    },
    counts,
    tools,
    lastPrompt,
    branch: summarizeBranch(branch),
    compactSummaries: compactSummaries.map(entry => annotateBranch(entry, branch)),
    recent: recent.map(entry => annotateBranch(entry, branch)),
    subagentTranscripts: findSubagentTranscripts(absolute),
    paging: {
      command: `rig handoff intake ${JSON.stringify(absolute)}`,
      note: 'The intake view starts at the newest useful evidence. Pass its nextBeforeLine back as --before only when older evidence is still needed.',
    },
  };
}

/**
 * Build a model-facing recovery view in one streaming pass. Unlike `read`,
 * this intentionally omits format noise and pages meaningful evidence from
 * newest to oldest so the stopping point is always consumed first.
 */
export function intakeTranscript(transcriptPath: string, options: IntakeOptions = {}): JsonObject {
  const absolute = assertTranscriptPath(transcriptPath);
  const stat = fs.statSync(absolute);
  const requestedBefore = clampInteger(options.before, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(options.limit, 24, 1, 200);
  const maxChars = options.full ? Number.MAX_SAFE_INTEGER : clampInteger(options.maxChars, 4000, 256, 1000000);
  const checkpointMaxChars = options.full ? Number.MAX_SAFE_INTEGER : Math.min(1000000, Math.max(12000, maxChars * 3));
  const counts: Record<string, number> = {};
  const tools: Record<string, number> = {};
  const models = new Set<string>();
  const session: JsonObject = {};
  const branchNodes = new Map<string, BranchNode>();
  const compactSummaries: JsonObject[] = [];
  const editedFiles = new Map<string, number>();
  const pageEntries: JsonObject[] = [];
  let totalLines = 0;
  let malformedLines = 0;
  let omittedThinkingBlocks = 0;
  let recoverableEntries = 0;
  let recoverableBeforeCursor = 0;
  let leafUuid: string | undefined;
  let leafLine: number | undefined;
  let title: string | undefined;
  let lastPrompt: string | undefined;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;

  for (const item of iterateTranscript(absolute)) {
    totalLines = item.line;
    if (!item.value) {
      malformedLines++;
      continue;
    }
    const value = item.value;
    const type = typeof value.type === 'string' ? value.type : 'unknown';
    counts[type] = (counts[type] || 0) + 1;
    captureBranchNode(branchNodes, value, item.line);
    captureSessionFields(session, value);
    collectToolNames(value, tools);
    captureEditedFiles(editedFiles, value, item.line);
    omittedThinkingBlocks += countThinkingBlocks(value.message && value.message.content);

    if (typeof value.timestamp === 'string') {
      if (!firstTimestamp) firstTimestamp = value.timestamp;
      lastTimestamp = value.timestamp;
    }
    if (type === 'custom-title' && typeof value.customTitle === 'string') title = value.customTitle;
    if (type === 'last-prompt') {
      if (typeof value.lastPrompt === 'string') lastPrompt = truncateMiddle(value.lastPrompt, checkpointMaxChars);
      if (typeof value.leafUuid === 'string') {
        leafUuid = value.leafUuid;
        leafLine = item.line;
      }
    }
    if (type === 'assistant' && value.message && typeof value.message.model === 'string') models.add(value.message.model);
    if (value.isCompactSummary === true) {
      compactSummaries.push(removeUndefined({
        line: item.line,
        type: 'compact-summary',
        timestamp: value.timestamp,
        uuid: value.uuid,
        summary: normalizeRecoveryContent(value.message && value.message.content, checkpointMaxChars),
      }));
    }

    const entry = normalizeRecoveryEntry(value, item.line, maxChars);
    if (!entry) continue;
    recoverableEntries++;
    if (item.line >= requestedBefore) continue;
    recoverableBeforeCursor++;
    pageEntries.push(entry);
    if (pageEntries.length > limit) pageEntries.shift();
  }

  const branch = resolveBranchIndex(branchNodes, leafUuid, leafLine);
  const checkpoint = selectCheckpoint(compactSummaries, branch);
  const chronologicalPage = pageEntries.slice();
  const oldestLine = chronologicalPage.length ? chronologicalPage[0].line : null;
  const newestFirst = chronologicalPage.reverse().map(entry => annotateBranch(entry, branch));
  const hasOlder = recoverableBeforeCursor > pageEntries.length;
  const effectiveBefore = Math.min(requestedBefore, totalLines + 1);

  return {
    schemaVersion: 2,
    transcriptPath: absolute,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    session: {
      ...session,
      title,
      firstTimestamp,
      lastTimestamp,
      models: Array.from(models),
    },
    stats: {
      lines: totalLines,
      malformedLines,
      counts,
      tools,
      recoverableEntries,
      compactSummaries: compactSummaries.length,
      omittedThinkingBlocks,
    },
    lastPrompt,
    checkpoint: checkpoint ? annotateBranch(checkpoint, branch) : null,
    branch: summarizeBranch(branch),
    workspaceEvidence: {
      editedFiles: Array.from(editedFiles.entries())
        .map(([filePath, line]) => ({ path: filePath, line }))
        .sort((a, b) => b.line - a.line)
        .slice(0, 40),
    },
    subagentTranscripts: findSubagentTranscripts(absolute),
    page: {
      direction: 'newest-to-oldest',
      beforeLine: effectiveBefore,
      newestLine: newestFirst.length ? newestFirst[0].line : null,
      oldestLine: newestFirst.length ? newestFirst[newestFirst.length - 1].line : null,
      nextBeforeLine: hasOlder ? oldestLine : null,
      hasOlder,
      entries: newestFirst,
    },
    guidance: {
      next: hasOlder
        ? `If material evidence is missing, rerun with --before ${oldestLine}.`
        : 'No older recovery entries remain.',
      branch: 'Treat non-lineage user text as historical context, not current instruction. Reconcile all transcript evidence against current workspace state.',
      thinking: 'Private thinking blocks were omitted; use dialogue, tool calls, tool results, and the compact checkpoint.',
    },
  };
}

export function readTranscriptPage(transcriptPath: string, options: ReadOptions = {}): JsonObject {
  const absolute = assertTranscriptPath(transcriptPath);
  const branch = indexTranscriptBranch(absolute);
  const from = clampInteger(options.from, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInteger(options.limit, 80, 1, 1000);
  const maxChars = options.full ? Number.MAX_SAFE_INTEGER : clampInteger(options.maxChars, 12000, 256, 1000000);
  const entries: JsonObject[] = [];
  let hasMore = false;
  let endLine = from - 1;

  for (const item of iterateTranscript(absolute)) {
    if (item.line < from) continue;
    if (entries.length >= limit) {
      hasMore = true;
      break;
    }
    endLine = item.line;
    if (item.value) entries.push(annotateBranch(normalizeTranscriptEntry(item.value, item.line, maxChars), branch));
    else entries.push({ line: item.line, type: 'parse-error', error: item.parseError });
  }

  return {
    schemaVersion: 1,
    transcriptPath: absolute,
    fromLine: from,
    endLine,
    nextLine: hasMore ? endLine + 1 : null,
    hasMore,
    branch: summarizeBranch(branch),
    entries,
  };
}

export function normalizeTranscriptEntry(value: JsonObject, line: number, maxChars = 12000): JsonObject {
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  const base: JsonObject = {
    line,
    type,
    timestamp: value.timestamp,
    uuid: value.uuid,
    parentUuid: value.parentUuid,
  };
  if (value.isSidechain === true) base.isSidechain = true;
  if (typeof value.cwd === 'string') base.cwd = value.cwd;
  if (typeof value.gitBranch === 'string') base.gitBranch = value.gitBranch;

  if (type === 'user' || type === 'assistant') {
    base.role = value.message && value.message.role || type;
    base.content = normalizeMessageContent(value.message && value.message.content, maxChars);
    if (type === 'assistant' && value.message) {
      base.model = value.message.model;
      base.stopReason = value.message.stop_reason;
      base.usage = sanitize(value.message.usage, maxChars);
    }
    if (value.toolUseResult !== undefined) base.toolUseResult = sanitize(value.toolUseResult, maxChars);
    if (typeof value.sourceToolAssistantUUID === 'string') base.sourceToolAssistantUUID = value.sourceToolAssistantUUID;
    if (value.isCompactSummary === true) base.isCompactSummary = true;
    return removeUndefined(base);
  }

  switch (type) {
    case 'system':
      return removeUndefined({ ...base, subtype: value.subtype, level: value.level, content: sanitize(value.content, maxChars), compactMetadata: sanitize(value.compactMetadata, maxChars), error: value.error, stopReason: value.stopReason });
    case 'custom-title':
      return removeUndefined({ ...base, title: value.customTitle });
    case 'mode':
      return removeUndefined({ ...base, mode: value.mode });
    case 'last-prompt':
      return removeUndefined({ ...base, lastPrompt: truncate(value.lastPrompt, maxChars), leafUuid: value.leafUuid });
    case 'queue-operation':
      return removeUndefined({ ...base, operation: value.operation, content: sanitize(value.content, maxChars) });
    case 'attachment':
      return removeUndefined({ ...base, attachment: sanitizeAttachment(value.attachment, maxChars) });
    default:
      return removeUndefined({ ...base, data: sanitize(omitEnvelope(value), maxChars) });
  }
}

function normalizeRecoveryEntry(value: JsonObject, line: number, maxChars: number): JsonObject | null {
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  if ((type === 'user' || type === 'assistant') && value.isCompactSummary !== true) {
    const content = normalizeRecoveryContent(value.message && value.message.content, maxChars);
    if (!hasRecoveryContent(content) || isRecoveryControlContent(content)) return null;
    const entry: JsonObject = {
      line,
      type,
      role: value.message && value.message.role || type,
      timestamp: value.timestamp,
      uuid: value.uuid,
      parentUuid: value.parentUuid,
      content,
    };
    if (value.isSidechain === true) entry.isSidechain = true;
    if (value.toolUseResult !== undefined) entry.toolUseResult = sanitizeForRecovery(value.toolUseResult, maxChars);
    if (typeof value.sourceToolAssistantUUID === 'string') entry.sourceToolAssistantUUID = value.sourceToolAssistantUUID;
    return removeUndefined(entry);
  }

  if (type === 'system' && (value.level === 'error' || value.error !== undefined)) {
    return removeUndefined({
      line,
      type,
      timestamp: value.timestamp,
      uuid: value.uuid,
      parentUuid: value.parentUuid,
      subtype: value.subtype,
      level: value.level,
      content: sanitizeForRecovery(value.content, maxChars),
      error: sanitizeForRecovery(value.error, maxChars),
    });
  }
  return null;
}

function normalizeRecoveryContent(content: unknown, maxChars: number): unknown {
  if (typeof content === 'string') return content.trim() ? truncateMiddle(content, maxChars) : null;
  if (!Array.isArray(content)) return sanitizeForRecovery(content, maxChars);
  return content.map((block: any) => {
    if (!block || typeof block !== 'object') return sanitizeForRecovery(block, maxChars);
    switch (block.type) {
      case 'thinking':
        return null;
      case 'text':
        return typeof block.text === 'string' && block.text.trim()
          ? { type: 'text', text: truncateMiddle(block.text, maxChars) }
          : null;
      case 'tool_use':
        return removeUndefined({ type: 'tool_use', id: block.id, name: block.name, input: sanitizeForRecovery(block.input, maxChars) });
      case 'tool_result':
        return removeUndefined({ type: 'tool_result', toolUseId: block.tool_use_id, isError: block.is_error, content: normalizeRecoveryContent(block.content, maxChars) });
      case 'image':
        return { type: 'image', source: sanitizeImageSource(block.source) };
      default:
        return sanitizeForRecovery(block, maxChars);
    }
  }).filter(hasRecoveryContent);
}

function normalizeMessageContent(content: unknown, maxChars: number): unknown {
  if (typeof content === 'string') return truncate(content, maxChars);
  if (!Array.isArray(content)) return sanitize(content, maxChars);
  return content.map((block: any) => {
    if (!block || typeof block !== 'object') return sanitize(block, maxChars);
    switch (block.type) {
      case 'text':
        return { type: 'text', text: truncate(block.text, maxChars) };
      case 'thinking':
        return { type: 'thinking', omitted: true, note: 'Private model reasoning is intentionally not transferred.' };
      case 'tool_use':
        return { type: 'tool_use', id: block.id, name: block.name, input: sanitize(block.input, maxChars) };
      case 'tool_result':
        return { type: 'tool_result', toolUseId: block.tool_use_id, isError: block.is_error, content: normalizeMessageContent(block.content, maxChars) };
      case 'image':
        return { type: 'image', source: sanitizeImageSource(block.source) };
      default:
        return sanitize(block, maxChars);
    }
  });
}

function sanitizeAttachment(attachment: unknown, maxChars: number): unknown {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return sanitize(attachment, maxChars);
  const value = attachment as JsonObject;
  return removeUndefined({
    type: value.type,
    filename: value.filename,
    displayPath: value.displayPath,
    hookEvent: value.hookEvent,
    hookName: value.hookName,
    toolUseID: value.toolUseID,
    command: truncate(value.command, maxChars),
    exitCode: value.exitCode,
    durationMs: value.durationMs,
    content: sanitize(value.content, maxChars),
    stdout: truncate(value.stdout, maxChars),
    stderr: truncate(value.stderr, maxChars),
  });
}

function sanitizeImageSource(source: unknown): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { omitted: true };
  const value = source as JsonObject;
  return removeUndefined({ type: value.type, mediaType: value.media_type, path: value.path, url: value.url, data: value.data ? `[base64 omitted: ${String(value.data).length} chars]` : undefined });
}

function sanitize(value: unknown, maxChars: number, depth = 0): unknown {
  if (typeof value === 'string') return truncate(value, maxChars);
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 12) return '[nested value omitted]';
  if (Array.isArray(value)) return value.map(item => sanitize(item, maxChars, depth + 1));
  if (typeof value === 'object') {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value as JsonObject)) {
      if (key === 'signature') continue;
      if (key === 'data' && typeof item === 'string' && item.length > maxChars) {
        result[key] = `[large data omitted: ${item.length} chars]`;
      } else {
        result[key] = sanitize(item, maxChars, depth + 1);
      }
    }
    return result;
  }
  return String(value);
}

function sanitizeForRecovery(value: unknown, maxChars: number, depth = 0): unknown {
  if (typeof value === 'string') return truncateMiddle(value, maxChars);
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 12) return '[nested value omitted]';
  if (Array.isArray(value)) return value.map(item => sanitizeForRecovery(item, maxChars, depth + 1));
  if (typeof value === 'object') {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value as JsonObject)) {
      if (key === 'signature') continue;
      result[key] = sanitizeForRecovery(item, maxChars, depth + 1);
    }
    return result;
  }
  return String(value);
}

function truncate(value: string, maxChars: number): string;
function truncate(value: unknown, maxChars: number): unknown;
function truncate(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `\n… [truncated ${value.length - maxChars} chars; rerun this page with --full]`;
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const marker = `\n… [truncated ${value.length - maxChars} chars; rerun with --full] …\n`;
  const available = Math.max(2, maxChars - marker.length);
  const head = Math.max(1, Math.floor(available * 0.45));
  const tail = Math.max(1, available - head);
  return value.slice(0, head) + marker + value.slice(value.length - tail);
}

function hasRecoveryContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as JsonObject).length > 0;
  return value !== null && value !== undefined;
}

function isRecoveryControlContent(value: unknown): boolean {
  let text: string | null = null;
  if (typeof value === 'string') text = value.trim();
  if (Array.isArray(value) && value.length === 1 && value[0] && value[0].type === 'text' && typeof value[0].text === 'string') {
    text = value[0].text.trim();
  }
  if (!text) return false;
  return text === 'Continue from where you left off.'
    || text === 'No response requested.'
    || text.startsWith('<local-command-caveat>')
    || text.startsWith('<command-name>/compact</command-name>')
    || text.startsWith('<local-command-stdout>Compacted');
}

function countThinkingBlocks(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let count = 0;
  for (const block of content) if (block && block.type === 'thinking') count++;
  return count;
}

function collectToolNames(value: JsonObject, tools: Record<string, number>): void {
  const content = value.message && value.message.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block && block.type === 'tool_use' && typeof block.name === 'string') {
      tools[block.name] = (tools[block.name] || 0) + 1;
    }
  }
}

function captureEditedFiles(files: Map<string, number>, value: JsonObject, line: number): void {
  const attachment = value.attachment;
  if (attachment && attachment.type === 'edited_text_file' && typeof attachment.filename === 'string') {
    files.set(attachment.filename, line);
  }

  const content = value.message && value.message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || !/^(Edit|Write|MultiEdit|NotebookEdit)$/i.test(String(block.name || ''))) continue;
      const filePath = block.input && (block.input.file_path || block.input.path || block.input.notebook_path);
      if (typeof filePath === 'string') files.set(filePath, line);
    }
  }

  const result = value.toolUseResult;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const filePath = result.filePath || result.file_path;
    const looksEdited = result.oldString !== undefined || result.newString !== undefined || result.structuredPatch !== undefined;
    if (looksEdited && typeof filePath === 'string') files.set(filePath, line);
  }
}

function captureSessionFields(session: JsonObject, value: JsonObject): void {
  const fields = [
    ['sessionId', value.sessionId],
    ['cwd', value.cwd],
    ['gitBranch', value.gitBranch],
    ['claudeVersion', value.version],
    ['entrypoint', value.entrypoint],
  ];
  for (const [key, item] of fields) if (typeof item === 'string' && item) session[key] = item;
}

function indexTranscriptBranch(transcriptPath: string): BranchIndex {
  const nodes = new Map<string, BranchNode>();
  let leafUuid: string | undefined;
  let leafLine: number | undefined;
  for (const item of iterateTranscript(transcriptPath)) {
    if (!item.value) continue;
    captureBranchNode(nodes, item.value, item.line);
    if (item.value.type === 'last-prompt' && typeof item.value.leafUuid === 'string') {
      leafUuid = item.value.leafUuid;
      leafLine = item.line;
    }
  }
  return resolveBranchIndex(nodes, leafUuid, leafLine);
}

function captureBranchNode(nodes: Map<string, BranchNode>, value: JsonObject, line: number): void {
  if (typeof value.uuid !== 'string') return;
  const content = value.message && value.message.content;
  const toolUseIds: string[] = [];
  const toolResultIds: string[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'tool_use' && typeof block.id === 'string') toolUseIds.push(block.id);
      if (block && block.type === 'tool_result' && typeof block.tool_use_id === 'string') toolResultIds.push(block.tool_use_id);
    }
  }
  nodes.set(value.uuid, {
    parentUuid: typeof value.parentUuid === 'string' ? value.parentUuid : null,
    line,
    messageId: value.message && typeof value.message.id === 'string' ? value.message.id : undefined,
    toolUseIds,
    toolResultIds,
    sourceToolAssistantUuid: typeof value.sourceToolAssistantUUID === 'string' ? value.sourceToolAssistantUUID : undefined,
  });
}

function resolveBranchIndex(nodes: Map<string, BranchNode>, leafUuid?: string, leafLine?: number): BranchIndex {
  const activeUuids = new Set<string>();
  if (leafUuid && leafLine != null) {
    let extendedLeaf = leafUuid;
    for (const [uuid, node] of nodes) {
      if (node.line > leafLine && node.parentUuid === extendedLeaf) extendedLeaf = uuid;
    }
    leafUuid = extendedLeaf;
  }
  if (!leafUuid || !nodes.has(leafUuid)) return { leafUuid, activeUuids, indexedUuids: nodes.size };
  let current: string | undefined = leafUuid;
  while (current && !activeUuids.has(current)) {
    activeUuids.add(current);
    current = nodes.get(current)?.parentUuid || undefined;
  }

  // Claude can serialize parallel tool calls as sibling result rows. They are
  // not all ancestors of leafUuid, but remain active evidence from the same
  // assistant message/tool IDs. Expand the lineage without treating arbitrary
  // descendants (which may be rewound user branches) as active.
  let changed = true;
  while (changed) {
    changed = false;
    const activeMessageIds = new Set<string>();
    const activeToolUseIds = new Set<string>();
    for (const uuid of activeUuids) {
      const node = nodes.get(uuid);
      if (!node) continue;
      if (node.messageId) activeMessageIds.add(node.messageId);
      for (const id of node.toolUseIds) activeToolUseIds.add(id);
    }
    for (const [uuid, node] of nodes) {
      if (activeUuids.has(uuid)) continue;
      const sameAssistantMessage = !!node.messageId && activeMessageIds.has(node.messageId);
      const linkedAssistant = !!node.sourceToolAssistantUuid && activeUuids.has(node.sourceToolAssistantUuid);
      const linkedToolResult = node.toolResultIds.some(id => activeToolUseIds.has(id));
      if (sameAssistantMessage || linkedAssistant || linkedToolResult) {
        activeUuids.add(uuid);
        changed = true;
      }
    }
  }
  return { leafUuid, activeUuids, indexedUuids: nodes.size };
}

function selectCheckpoint(summaries: JsonObject[], branch: BranchIndex): JsonObject | null {
  if (branch.leafUuid && branch.activeUuids.has(branch.leafUuid)) {
    for (let index = summaries.length - 1; index >= 0; index--) {
      const uuid = summaries[index].uuid;
      if (typeof uuid === 'string' && branch.activeUuids.has(uuid)) return summaries[index];
    }
  }
  return summaries.length ? summaries[summaries.length - 1] : null;
}

function summarizeBranch(branch: BranchIndex): JsonObject {
  const available = !!branch.leafUuid && branch.activeUuids.has(branch.leafUuid);
  return {
    available,
    leafUuid: branch.leafUuid,
    indexedUuids: branch.indexedUuids,
    activeUuids: available ? branch.activeUuids.size : 0,
    nonLineageUuids: available ? Math.max(0, branch.indexedUuids - branch.activeUuids.size) : 0,
  };
}

function annotateBranch(entry: JsonObject, branch: BranchIndex): JsonObject {
  if (!branch.leafUuid || !branch.activeUuids.has(branch.leafUuid) || typeof entry.uuid !== 'string') return entry;
  return { ...entry, branch: branch.activeUuids.has(entry.uuid) ? 'active' : 'non-lineage' };
}

function findSubagentTranscripts(transcriptPath: string): string[] {
  const sessionDir = transcriptPath.slice(0, -'.jsonl'.length);
  const subagents = path.join(sessionDir, 'subagents');
  try {
    return fs.readdirSync(subagents)
      .filter(name => name.endsWith('.jsonl'))
      .map(name => path.join(subagents, name))
      .sort();
  } catch { return []; }
}

export function findLatestTranscript(projectsDir: string, cwd?: string): string | null {
  const files: { path: string; mtime: number }[] = [];
  walk(projectsDir, files, 0);
  files.sort((a, b) => b.mtime - a.mtime);
  if (!cwd) return files[0] ? files[0].path : null;
  const wanted = path.resolve(cwd);
  for (const candidate of files) {
    if (transcriptMentionsCwd(candidate.path, wanted)) return candidate.path;
  }
  return null;
}

function walk(dir: string, files: { path: string; mtime: number }[], depth: number): void {
  if (depth > 4) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'subagents') walk(full, files, depth + 1);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try { files.push({ path: full, mtime: fs.statSync(full).mtimeMs }); } catch { /* skip */ }
    }
  }
}

function transcriptMentionsCwd(transcriptPath: string, cwd: string): boolean {
  for (const item of iterateTranscript(transcriptPath)) {
    if (item.value && typeof item.value.cwd === 'string' && path.resolve(item.value.cwd) === cwd) return true;
  }
  return false;
}

function omitEnvelope(value: JsonObject): JsonObject {
  const result = { ...value };
  for (const key of ['type', 'timestamp', 'uuid', 'parentUuid', 'cwd', 'gitBranch', 'sessionId', 'version', 'entrypoint', 'isSidechain']) delete result[key];
  return result;
}

function removeUndefined(value: JsonObject): JsonObject {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`expected an integer between ${min} and ${max}, got ${value}`);
  return value;
}
