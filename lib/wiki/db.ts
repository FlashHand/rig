import fs from 'fs';
import { paths } from './paths';

// Lazy load so unit tests that don't touch the DB don't need the native binary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;
let cached: Database | null = null;

export function getDb(): Database {
  if (cached) return cached;
  fs.mkdirSync(paths.home, { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(paths.stateDb);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  cached = db;
  return db;
}

export function closeDb() {
  if (cached) {
    try { cached.close(); } catch { /* ignore */ }
    cached = null;
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_sha (
      wiki TEXT NOT NULL,
      path TEXT NOT NULL,
      sha TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      PRIMARY KEY (wiki, path)
    );
    CREATE TABLE IF NOT EXISTS last_run (
      wiki TEXT NOT NULL,
      op TEXT NOT NULL,
      ts INTEGER NOT NULL,
      exit_code INTEGER NOT NULL,
      PRIMARY KEY (wiki, op)
    );
    CREATE TABLE IF NOT EXISTS ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wiki TEXT NOT NULL,
      source_path TEXT NOT NULL,
      ts INTEGER NOT NULL,
      diff_hash TEXT NOT NULL,
      applied INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts5 USING fts5(
      wiki, slug, body, tokenize='unicode61 remove_diacritics 2'
    );
  `);
}

export function recordLastRun(wiki: string, op: string, exitCode: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO last_run (wiki, op, ts, exit_code) VALUES (?, ?, ?, ?)
     ON CONFLICT(wiki, op) DO UPDATE SET ts = excluded.ts, exit_code = excluded.exit_code`
  ).run(wiki, op, Date.now(), exitCode);
}

export function getLastRun(wiki: string, op: string): { ts: number; exit_code: number } | undefined {
  return getDb()
    .prepare('SELECT ts, exit_code FROM last_run WHERE wiki = ? AND op = ?')
    .get(wiki, op) as { ts: number; exit_code: number } | undefined;
}
