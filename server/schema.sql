-- FluencyLab schema (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  avatar        TEXT DEFAULT '🧑',
  level         TEXT NOT NULL DEFAULT 'Intermediário',
  start_date    TEXT NOT NULL,              -- YYYY-MM-DD
  streak        INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active   TEXT,                        -- YYYY-MM-DD
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  theme      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phrases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id        INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  text_en        TEXT NOT NULL,
  translation_pt TEXT,
  context        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase_id     INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  ease          REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps          INTEGER NOT NULL DEFAULT 0,
  due_date      TEXT NOT NULL,               -- YYYY-MM-DD
  state         TEXT NOT NULL DEFAULT 'new'  -- new | learning | review
);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating      TEXT NOT NULL,                 -- again | hard | good | easy
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 2: writing practice + AI correction
CREATE TABLE IF NOT EXISTS writings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt       TEXT,
  user_text    TEXT NOT NULL,
  feedback_json TEXT,                        -- {corrected, errors[], rewrite, comment}
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 3: generated listening dialogues
CREATE TABLE IF NOT EXISTS dialogues (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme      TEXT,
  title      TEXT,
  lines_json TEXT NOT NULL,                  -- [{speaker, en, pt}]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 4: speaking attempts (shadowing / record / tutor)
CREATE TABLE IF NOT EXISTS speaking_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL,                 -- shadow | record | tutor
  target_text TEXT,
  transcript  TEXT,
  score       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Self-recordings (video/audio) — "grave-se" catalog
CREATE TABLE IF NOT EXISTS recordings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT,
  kind       TEXT,                          -- video | audio
  prompt     TEXT,
  transcript TEXT,                           -- what was said (speech-to-text)
  feedback_json TEXT,                        -- AI feedback
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily progress: which of the 4 blocks were done each day (per user)
CREATE TABLE IF NOT EXISTS sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,             -- YYYY-MM-DD
  blocks_done_json TEXT NOT NULL DEFAULT '{}',
  minutes_total   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date)
);
