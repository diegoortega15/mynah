// Vitest setup — runs before test modules load. Isolates the database: db.js
// reads DB_PATH at import time, so every test works on a throwaway in-memory DB
// (schema.sql runs on open) and the real data/fluencylab.db is never touched.
process.env.DB_PATH = ':memory:';
