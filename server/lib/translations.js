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

/** The cached row, or null. `source` tells AI translations from local stopgaps. */
export function getRow(en) {
  return db.prepare('SELECT pt, source FROM translations WHERE hash = ?').get(keyOf(en)) ?? null;
}

export function getCached(en) {
  return getRow(en)?.pt ?? null;
}

export function putCached(en, pt, source = 'ai') {
  if (!norm(en) || !norm(pt)) return;
  db.prepare(
    `INSERT INTO translations (hash, en, pt, source) VALUES (?, ?, ?, ?)
     ON CONFLICT(hash) DO UPDATE SET pt = excluded.pt, source = excluded.source`
  ).run(keyOf(en), norm(en), String(pt).trim(), source);
}

/** Store translations produced by the browser's on-device translator. */
export function putLocal(items = []) {
  let n = 0;
  const write = db.transaction((list) => {
    for (const { en, pt } of list) {
      // Never overwrite a good AI translation with a local one.
      if (getRow(en)?.source === 'ai') continue;
      putCached(en, pt, 'local');
      n++;
    }
  });
  write(items.filter((i) => i && norm(i.en) && norm(i.pt)));
  return n;
}

/** One sentence, cache first. */
export async function translateOne(en) {
  const row = getRow(en);
  if (row?.source === 'ai') return row.pt;
  try {
    const pt = await translatePhrase(en);
    putCached(en, pt, 'ai');
    return pt;
  } catch (e) {
    if (row) return row.pt; // a local stopgap beats failing outright
    throw e;
  }
}

/**
 * Translate a list, using the cache and one AI call per BATCH of misses.
 * Returns an array aligned with `texts`. A batch the model answers badly falls
 * back to one-by-one for those lines rather than losing them.
 *
 * Lines cached as 'local' are retried with the AI so a stopgap gets upgraded,
 * but the stopgap is kept if the AI is still down.
 */
export async function translateList(texts) {
  const rows = texts.map((t) => getRow(t));
  const out = rows.map((r) => (r?.source === 'ai' ? r.pt : null));
  const missing = texts.map((t, i) => [t, i]).filter(([, i]) => out[i] === null);

  // With the provider down every retry costs a full timeout while the caller
  // waits, so give up after two failures in a row — enough to tell "the AI is
  // gone" from "this one line upset the model".
  let fails = 0;
  const aiDead = () => fails >= 2;

  for (let s = 0; s < missing.length && !aiDead(); s += BATCH) {
    const slice = missing.slice(s, s + BATCH);
    let pts = null;
    try {
      pts = await translateBatch(slice.map(([t]) => t));
    } catch {
      pts = null;
    }
    if (pts && pts.length === slice.length) {
      fails = 0;
      slice.forEach(([en, i], k) => {
        out[i] = String(pts[k]).trim();
        putCached(en, out[i], 'ai');
      });
      continue;
    }
    for (const [en, i] of slice) {
      if (aiDead()) break;
      try {
        out[i] = await translateOne(en);
        fails = 0;
      } catch {
        out[i] = null;
        fails++;
      }
    }
  }

  // Whatever the AI could not produce falls back to the stopgap, if any.
  return out.map((pt, i) => pt ?? rows[i]?.pt ?? null);
}
