import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Runs before any test module is imported — points db.js at an isolated
    // in-memory database so tests never touch data/fluencylab.db.
    setupFiles: ['./test/setup.js'],
  },
});
