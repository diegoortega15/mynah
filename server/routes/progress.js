import { db } from '../db.js';
import { today } from '../lib/srs.js';
import { touchStreak } from '../lib/streak.js';
import { idParams, body } from '../lib/schemas.js';

// The 4 daily blocks. The day is "complete" only when all are done.
export const BLOCKS = ['listen', 'vocab', 'speak', 'write'];

// Default daily target (count) per block, and the unit shown in the label.
export const TARGETS = { listen: 1, vocab: 20, speak: 2, write: 1 };
const UNIT = { listen: 'diálogo', vocab: 'cards', speak: 'práticas', write: 'texto' };

// Per-user targets: defaults overridden by users.targets_json (set in Settings).
export function getTargets(userId) {
  const row = db.prepare('SELECT targets_json FROM users WHERE id = ?').get(userId);
  let saved = {};
  try {
    saved = JSON.parse(row?.targets_json || '{}');
  } catch {
    /* corrupted json → defaults */
  }
  const t = { ...TARGETS };
  for (const b of BLOCKS) {
    const v = Number(saved[b]);
    if (Number.isInteger(v) && v > 0) t[b] = v;
  }
  return t;
}

// Blocks the user drives by "doing an action" (increment). Vocab is auto from reviews.
const INCREMENTABLE = ['listen', 'speak', 'write'];

function getSession(userId) {
  const t = today();
  let row = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND date = ?').get(userId, t);
  if (!row) {
    db.prepare('INSERT INTO sessions (user_id, date, blocks_done_json) VALUES (?, ?, ?)')
      .run(userId, t, '{}');
    row = db.prepare('SELECT * FROM sessions WHERE user_id = ? AND date = ?').get(userId, t);
  }
  return row;
}

function parseBlocks(row) {
  try {
    return JSON.parse(row.blocks_done_json || '{}');
  } catch {
    return {};
  }
}

function shape(row) {
  const blocks = parseBlocks(row);
  const status = {};
  for (const b of BLOCKS) status[b] = blocks[b] || { done: false, count: 0, info: '' };
  const doneCount = BLOCKS.filter((b) => status[b].done).length;
  return {
    date: row.date,
    blocks: status,
    doneCount,
    total: BLOCKS.length,
    complete: doneCount === BLOCKS.length,
    targets: getTargets(row.user_id),
  };
}

// Write one block's state, bumping the streak when the whole day completes.
function writeBlock(userId, block, data) {
  const row = getSession(userId);
  const blocks = parseBlocks(row);
  const wasComplete = BLOCKS.every((b) => blocks[b]?.done);

  blocks[block] = { ...(blocks[block] || {}), ...data };
  db.prepare('UPDATE sessions SET blocks_done_json = ? WHERE id = ?')
    .run(JSON.stringify(blocks), row.id);

  const nowComplete = BLOCKS.every((b) => blocks[b]?.done);
  if (nowComplete && !wasComplete) touchStreak(userId); // day completed → streak

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(row.id);
  return { ...shape(updated), justCompleted: nowComplete && !wasComplete };
}

// One action done in an incrementable block (listen/speak/write).
export function incBlock(userId, block) {
  const cur = parseBlocks(getSession(userId))[block] || {};
  const count = (cur.count || 0) + 1;
  const target = getTargets(userId)[block];
  const done = count >= target;
  return writeBlock(userId, block, {
    done,
    count,
    info: `${Math.min(count, target)}/${target} ${UNIT[block]}`,
  });
}

// Vocab progress, computed from today's reviews (target 20, or clearing the queue).
export function setVocabProgress(userId, { reviewedToday, due }) {
  const target = getTargets(userId).vocab;
  const done = reviewedToday >= target || due === 0;
  const info =
    done && due === 0 && reviewedToday < target
      ? 'Revisão em dia'
      : `${Math.min(reviewedToday, target)}/${target} cards`;
  return writeBlock(userId, 'vocab', { done, count: reviewedToday, info });
}

/**
 * Cards waiting for this learner today.
 */
function dueCount(userId) {
  return db
    .prepare(
      `SELECT COUNT(*) c FROM cards c JOIN phrases p ON p.id = c.phrase_id
         JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ? AND c.paused_reason IS NULL AND c.due_date <= ?`
    )
    .get(userId, today()).c;
}

/**
 * FSRS legitimately schedules nothing on some days. The "nothing due counts as
 * done" rule existed, but only fired inside a review submission — which needs a
 * card to review. On an empty day the block could never close, so the day never
 * completed and the streak broke through no fault of the learner.
 *
 * Granting it is marked `auto`, because it is the app conceding the block, not
 * the learner earning it: planDay() must not count "opened the app" as a day of
 * study.
 */
function grantVocabIfNothingDue(userId) {
  const row = getSession(userId);
  const blocks = parseBlocks(row);
  if (blocks.vocab?.done) return row;
  if (dueCount(userId) > 0) return row;
  writeBlock(userId, 'vocab', {
    done: true,
    auto: true,
    count: blocks.vocab?.count ?? 0,
    info: 'Revisão em dia',
  });
  return getSession(userId);
}

export default async function progressRoutes(app) {
  // Today's per-block progress for a user.
  app.get('/api/users/:id/today', (req) => shape(grantVocabIfNothingDue(req.params.id)));

  // Register one action in a block. Body: { block } (listen | speak | write).
  app.post('/api/users/:id/progress', {
    schema: {
      params: idParams,
      body: body(['block'], { block: { type: 'string', enum: ['listen', 'speak', 'write'] } }),
    },
  }, (req, reply) => {
    const { block } = req.body ?? {};
    if (!INCREMENTABLE.includes(block))
      return reply.code(400).send({ error: 'invalid block' });
    return incBlock(req.params.id, block);
  });
}
