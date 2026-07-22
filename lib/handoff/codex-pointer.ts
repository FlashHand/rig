import fs from 'fs';
import path from 'path';

export interface CodexLatestPointer {
  schemaVersion: 1;
  sessionId: string;
  transcriptPath: string;
  cwd: string;
  model?: string;
  turnId?: string;
  updatedAt: string;
}

export function writeCodexLatestPointer(pointerPath: string, pointer: CodexLatestPointer): void {
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  const temp = `${pointerPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, JSON.stringify(pointer, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, pointerPath);
    fs.chmodSync(pointerPath, 0o600);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}

export function readCodexLatestPointer(pointerPath: string): CodexLatestPointer | null {
  if (!fs.existsSync(pointerPath)) return null;
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(pointerPath, 'utf8')); }
  catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pointer = value as Record<string, unknown>;
  if (pointer.schemaVersion !== 1
    || typeof pointer.sessionId !== 'string'
    || typeof pointer.transcriptPath !== 'string'
    || typeof pointer.cwd !== 'string'
    || typeof pointer.updatedAt !== 'string') return null;
  return pointer as unknown as CodexLatestPointer;
}

