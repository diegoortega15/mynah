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
-- level_cefr: the level the content was generated at (see comprehension_results)
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
  chunks_hash TEXT,                           -- fingerprint: detects edited captions
  fetched_at  TEXT,                           -- when the caption track was captured
  level_cefr  TEXT,                           -- A1…C2, judged from the transcript
  level_why   TEXT,                           -- one line (PT-BR) explaining the call
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, video_id)
);

-- Translation cache, keyed by the SENTENCE ITSELF (not by position in a video).
-- Captions get edited and re-generated; keying by text means an edited transcript
-- only costs AI on the lines that actually changed. Shared by every profile and
-- every screen (YouTube, Tutor) — a translation is a pure function of the text.
CREATE TABLE IF NOT EXISTS translations (
  hash       TEXT PRIMARY KEY,                -- sha256 of the normalised English
  en         TEXT NOT NULL,
  pt         TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Placement test results. Kept as history (not overwritten) so redoing the test
-- on day 45 can be compared with the one taken on day 1.
CREATE TABLE IF NOT EXISTS placements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_cefr TEXT NOT NULL,
  blocks_json TEXT NOT NULL,                  -- per-block detail, shown to the learner
  applied     INTEGER NOT NULL DEFAULT 0,     -- 1 when the learner accepted the suggestion
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_placements_user ON placements(user_id, created_at);

-- Comprehension quiz results, tagged with the level of the CONTENT. Scoring 3/3
-- on B2 material is evidence about the learner that a self-declared level is not.
CREATE TABLE IF NOT EXISTS comprehension_results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL,                   -- 'dialogue' | 'reading'
  source_id  INTEGER,
  cefr       TEXT NOT NULL,                   -- level the content was written at
  correct    INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comprehension_user ON comprehension_results(user_id, created_at);

-- Favourite YouTube channels: where this learner likes to look for videos
CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,                    -- display name (@handle or given title)
  url        TEXT NOT NULL,                    -- canonical channel URL
  note       TEXT,                             -- why it is useful ("legendas boas", "TI")
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, url)
);
CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);

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
