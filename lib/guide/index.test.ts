import fs from 'fs';
import os from 'os';
import path from 'path';
import { guideCli, readGuide, resolveGuidePath } from './index';

describe('Rig agent guide', () => {
  let tempDir: string;
  let guidePath: string;
  let clipboardPath: string;
  const oldGuidePath = process.env.RIG_GUIDE_PATH;
  const oldClipboardPath = process.env.RIG_HANDOFF_CLIPBOARD_FILE;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-guide-'));
    guidePath = path.join(tempDir, 'RIG_GUIDE.md');
    clipboardPath = path.join(tempDir, 'clipboard.txt');
    fs.writeFileSync(guidePath, '# Agent guide\n\nUse Rig safely.\n');
    process.env.RIG_GUIDE_PATH = guidePath;
    process.env.RIG_HANDOFF_CLIPBOARD_FILE = clipboardPath;
  });

  afterEach(() => {
    if (oldGuidePath === undefined) delete process.env.RIG_GUIDE_PATH;
    else process.env.RIG_GUIDE_PATH = oldGuidePath;
    if (oldClipboardPath === undefined) delete process.env.RIG_HANDOFF_CLIPBOARD_FILE;
    else process.env.RIG_HANDOFF_CLIPBOARD_FILE = oldClipboardPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('resolves and reads an explicitly configured guide', () => {
    expect(resolveGuidePath()).toBe(guidePath);
    expect(readGuide()).toContain('Use Rig safely.');
  });

  test('copies the exact guide without invoking a model', () => {
    guideCli({ copy: true });
    expect(fs.readFileSync(clipboardPath, 'utf8')).toBe(fs.readFileSync(guidePath, 'utf8'));
    expect(fs.statSync(clipboardPath).mode & 0o777).toBe(0o600);
  });

  test('prints the guide path without reading or copying content', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      guideCli({ path: true });
      expect(write).toHaveBeenCalledWith(guidePath + '\n');
      expect(fs.existsSync(clipboardPath)).toBe(false);
    } finally {
      write.mockRestore();
    }
  });

  test('rejects mutually exclusive output modes', () => {
    const previousExitCode = process.exitCode;
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      guideCli({ copy: true, path: true });
      expect(process.exitCode).toBe(1);
      expect(fs.existsSync(clipboardPath)).toBe(false);
    } finally {
      process.exitCode = previousExitCode;
      write.mockRestore();
    }
  });
});
