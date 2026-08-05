import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { translatePhrase, translateBatch } from '../services/ai.js';

// How many sentences go into one AI call. Measured on the Claude CLI with real
// transcripts: 9.6s per line one-by-one, 2.6s per line in tens, 3.1s per line in
// twenties — the fixed process start-up is already amortised at ten, and longer
// answers only generate slower. Ten also keeps each call well inside the CLI
// timeout and makes the progress bar move often. Running batches in parallel was
// measured too: no gain (86s vs 79s for 30 lines), so callers go sequentially.
export const BATCH = 10;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const keyOf = (en) => createHash('sha256').update(norm(en)).digest('hex').slice(0, 32);

export function getCached(en) {
  return db.prepare('SELECT pt FROM translations WHERE hash = ?').get(keyOf(en))?.pt ?? null;
}

export function putCached(en, pt) {
  if (!norm(en) || !norm(pt)) return;
  db.prepare(
    'INSERT INTO translations (hash, en, pt) VALUES (?, ?, ?) ON CONFLICT(hash) DO UPDATE SET pt = excluded.pt'
  ).run(keyOf(en), norm(en), String(pt).trim());
}

/** One sentence, cache first. */
export async function translateOne(en) {
  const hit = getCached(en);
  if (hit) return hit;
  const pt = await translatePhrase(en);
  putCached(en, pt);
  return pt;
}

/**
 * Translate a list, using the cache and one AI call per BATCH of misses.
 * Returns an array aligned with `texts`. A batch the model answers badly falls
 * back to one-by-one for those lines rather than losing them.
 */
export async function translateList(texts) {
  const out = texts.map((t) => getCached(t));
  const missing = texts.map((t, i) => [t, i]).filter(([, i]) => out[i] === null);

  for (let s = 0; s < missing.length; s += BATCH) {
    const slice = missing.slice(s, s + BATCH);
    let pts = null;
    try {
      pts = await translateBatch(slice.map(([t]) => t));
    } catch {
      pts = null;
    }
    if (pts && pts.length === slice.length) {
      slice.forEach(([en, i], k) => {
        out[i] = String(pts[k]).trim();
        putCached(en, out[i]);
      });
    } else {
      for (const [en, i] of slice) {
        try {
          out[i] = await translateOne(en);
        } catch {
          out[i] = null; // a line that fails stays untranslated; the rest survives
        }
      }
    }
  }
  return out;
}
