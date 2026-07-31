import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, 'fluencylab.db'));
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

export default db;
