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

interface BranchIndex {
  leafUuid?: string;
  activeUuids: Set<string>;
  indexedUuids: number;
}

interface BranchNode {
  parentUuid: string | null;
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

  for (const item of iterateTranscript(absolute)) {
    totalLines = item.line;
    if (!item.value) {
      malformedLines++;
      continue;
    }
    const value = item.value;
    captureBranchNode(branchNodes, value);
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
      if (typeof value.leafUuid === 'string') leafUuid = value.leafUuid;
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

  const branch = resolveBranchIndex(branchNodes, leafUuid);
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
      command: `rig handoff read ${JSON.stringify(absolute)} --from 1 --limit 80`,
      note: 'Increase --from using nextLine until hasMore is false. Use --full only for specific pages that need untruncated tool output.',
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

function truncate(value: string, maxChars: number): string;
function truncate(value: unknown, maxChars: number): unknown;
function truncate(value: unknown, maxChars: number): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + `\n… [truncated ${value.length - maxChars} chars; rerun this page with --full]`;
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
  for (const item of iterateTranscript(transcriptPath)) {
    if (!item.value) continue;
    captureBranchNode(nodes, item.value);
    if (item.value.type === 'last-prompt' && typeof item.value.leafUuid === 'string') {
      leafUuid = item.value.leafUuid;
    }
  }
  return resolveBranchIndex(nodes, leafUuid);
}

function captureBranchNode(nodes: Map<string, BranchNode>, value: JsonObject): void {
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
    messageId: value.message && typeof value.message.id === 'string' ? value.message.id : undefined,
    toolUseIds,
    toolResultIds,
    sourceToolAssistantUuid: typeof value.sourceToolAssistantUUID === 'string' ? value.sourceToolAssistantUUID : undefined,
  });
}

function resolveBranchIndex(nodes: Map<string, BranchNode>, leafUuid?: string): BranchIndex {
  const activeUuids = new Set<string>();
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
