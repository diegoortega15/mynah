-- FluencyLab schema (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  avatar        TEXT DEFAULT '🧑',
  level         TEXT NOT NULL DEFAULT 'B1',       -- CEFR: A1 A2 B1 B2 C1 C2
  start_date    TEXT NOT NULL,              -- YYYY-MM-DD
  streak        INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active   TEXT,                        -- YYYY-MM-DD
  freezes       INTEGER NOT NULL DEFAULT 0,  -- streak protections (earned weekly)
  targets_json  TEXT,                         -- per-user daily targets override
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
  ease          REAL NOT NULL DEFAULT 2.5,   -- legacy (SM-2), kept for rollback
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps          INTEGER NOT NULL DEFAULT 0,
  due_date      TEXT NOT NULL,               -- YYYY-MM-DD
  state         TEXT NOT NULL DEFAULT 'new', -- new | learning | review | relearning
  -- FSRS scheduling memory (null on brand-new cards)
  stability     REAL,
  difficulty    REAL,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_review   TEXT                          -- YYYY-MM-DD
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
  questions_json TEXT,                       -- [{q, options[], answer, why}] comprehension check
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

-- Watched YouTube videos (transcript cached so they reopen instantly)
CREATE TABLE IF NOT EXISTS youtube_videos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id    TEXT NOT NULL,
  title       TEXT,
  chunks_json TEXT NOT NULL,                  -- [{text, offset}]
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, video_id)
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

-- Extensive reading: AI-generated texts at the learner's level (LingQ-style)
CREATE TABLE IF NOT EXISTS readings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme      TEXT,
  title      TEXT,
  text_en    TEXT NOT NULL,
  questions_json TEXT,                       -- [{q, options[], answer, why}] comprehension check
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id);

-- Error bank: every AI correction (writing/speaking) is stored and categorized
-- so recurring mistakes become visible and feed back into tutor/writing prompts.
CREATE TABLE IF NOT EXISTS user_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,                -- writing | speaking
  original    TEXT NOT NULL,
  correction  TEXT NOT NULL,
  explanation TEXT,
  category    TEXT,                          -- gramática, preposição, tempo verbal…
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_errors_user ON user_errors(user_id);

-- Indexes: SQLite does NOT index foreign keys automatically, and the app's
-- hottest query joins cards→phrases→decks filtered by user + due_date.
CREATE INDEX IF NOT EXISTS idx_decks_user        ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_phrases_deck      ON phrases(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_phrase      ON cards(phrase_id);
CREATE INDEX IF NOT EXISTS idx_cards_due         ON cards(due_date);
CREATE INDEX IF NOT EXISTS idx_reviews_card      ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_writings_user     ON writings(user_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_user    ON dialogues(user_id);
CREATE INDEX IF NOT EXISTS idx_speaking_user     ON speaking_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_user   ON recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_ytvideos_user     ON youtube_videos(user_id);
