import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// DB_PATH lets tests (and advanced users) point elsewhere — ':memory:' gives an
// isolated throwaway database so tests never touch the real data/ folder.
let dbPath = process.env.DB_PATH;
if (!dbPath) {
  const dataDir = join(__dirname, '..', 'data');
  mkdirSync(dataDir, { recursive: true });
  dbPath = join(dataDir, 'fluencylab.db');
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema (idempotent — all CREATE TABLE IF NOT EXISTS)
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations: schema.sql is the full current schema (fresh installs get everything).
// These bring OLDER databases forward, idempotently — only adds what's missing,
// so real errors are never swallowed.
function addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumnIfMissing('recordings', 'transcript', 'TEXT');
addColumnIfMissing('recordings', 'feedback_json', 'TEXT');

addColumnIfMissing('users', 'freezes', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'targets_json', 'TEXT');
addColumnIfMissing('dialogues', 'questions_json', 'TEXT');
addColumnIfMissing('readings', 'questions_json', 'TEXT');

// Levels migrated from the old PT-BR labels to the CEFR scale (A1…C2).
db.exec(`
  UPDATE users SET level = 'A2' WHERE level = 'Básico';
  UPDATE users SET level = 'B1' WHERE level = 'Intermediário';
  UPDATE users SET level = 'C1' WHERE level = 'Avançado';
`);

// FSRS migration (SM-2 → FSRS): new scheduling columns + one-time backfill.
addColumnIfMissing('cards', 'stability', 'REAL');
addColumnIfMissing('cards', 'difficulty', 'REAL');
addColumnIfMissing('cards', 'lapses', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('cards', 'last_review', 'TEXT');
// Approximate FSRS memory for cards that already have SM-2 history:
// stability ≈ current interval (≥1 day); difficulty maps ease 2.5→5, 1.3→~9.8
// (clamped 1..10). New cards stay NULL and start fresh on first review.
db.exec(`
  UPDATE cards SET
    stability  = MAX(interval_days, 1),
    difficulty = MIN(10, MAX(1, 5 + (2.5 - ease) * 4))
  WHERE stability IS NULL AND state != 'new'
`);

export default db;
