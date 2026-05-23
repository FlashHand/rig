// Default file-type filters shared by `scan` and `survey`. Anything in
// BINARY_EXTENSIONS is excluded BEFORE we even consider asking the agent
// about it — these are categorically not wiki sources.
//
// The wiki's own schema.md "Ingestion policy" section drives further
// (LLM-applied) filtering inside `rig wiki survey`. This file is just
// the hard floor.

import path from 'path';

// Extensions matched by simple basename suffix. Lowercase, leading dot.
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // archives
  '.zip', '.tar', '.tgz', '.gz', '.bz2', '.xz', '.7z', '.rar', '.dmg', '.iso',
  // binaries / native modules
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.lib',
  '.class', '.jar', '.pyc', '.pyo', '.node', '.wasm',
  // audio / video
  '.mp4', '.mov', '.mkv', '.avi', '.webm', '.wmv', '.flv',
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus',
  // design / proprietary
  '.psd', '.ai', '.fig', '.sketch', '.fla', '.indd', '.xd',
  // model weights / embeddings
  '.gguf', '.safetensors', '.pt', '.pth', '.onnx', '.h5', '.pkl', '.npz', '.tflite',
  // build / lock / source-map artifacts (handled by .min.js / .lock suffix too)
  '.map', '.tsbuildinfo',
  // misc
  '.ds_store', '.pyd', '.swp', '.swo',
]);

// Filename patterns matched by exact basename or known suffix combos.
function isBinaryByName(basename: string): boolean {
  const lower = basename.toLowerCase();
  // multi-segment archives
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tar.bz2') || lower.endsWith('.tar.xz')) return true;
  // minified js / source maps
  if (lower.endsWith('.min.js') || lower.endsWith('.min.css') || lower.endsWith('.bundle.js')) return true;
  // lockfiles
  if (lower === 'yarn.lock' || lower === 'package-lock.json' || lower === 'pnpm-lock.yaml' || lower === 'cargo.lock' || lower === 'composer.lock' || lower === 'gemfile.lock') return true;
  if (lower.endsWith('.lock')) return true;
  return false;
}

/**
 * True if the file should be skipped as a wiki source on extension /
 * filename grounds alone. Cheap, deterministic, no I/O.
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext && BINARY_EXTENSIONS.has(ext)) return true;
  return isBinaryByName(path.basename(filePath));
}
