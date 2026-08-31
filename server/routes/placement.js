import { db } from '../db.js';
import { nextStep, scorePlacement } from '../lib/placement.js';
import { idxOf, LEVELS } from '../lib/placementBank.js';
import { normalizeLevel } from '../lib/level.js';
import { idParams, body } from '../lib/schemas.js';

// How much evidence before the app is allowed to question the profile's level.
const MIN_EVIDENCE = 5;

const ANSWERS = {
  // The client reports whether this browser can actually narrate English. It
  // cannot be inferred here: it depends on which voices the machine has.
  noAudio: { type: 'boolean' },
  answers: {
    type: 'array',
    maxItems: 60,
    items: {
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 40 },
        value: { type: 'integer' },
        known: { type: 'array', maxItems: 60, items: { type: 'string', maxLength: 40 } },
      },
      required: ['id'],
    },
  },
};

export default async function placementRoutes(app) {
  // Next question (or the verdict). Stateless: the client posts everything it
  // has answered so far, so a reload or a closed tab loses nothing but time.
  app.post('/api/placement/step', {
    schema: { body: body([], ANSWERS) },
  }, (req) => nextStep(req.body?.answers ?? [], { noAudio: !!req.body?.noAudio }));

  // Store a finished test. The level is NOT changed here — the learner decides.
  app.post('/api/users/:id/placement', {
    schema: { params: idParams, body: body([], ANSWERS) },
  }, (req, reply) => {
    const user = db.prepare('SELECT id, level FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const result = scorePlacement(req.body?.answers ?? []);
    const info = db
      .prepare('INSERT INTO placements (user_id, result_cefr, blocks_json) VALUES (?, ?, ?)')
      .run(user.id, result.cefr, JSON.stringify(result.blocks));

    const current = normalizeLevel(user.level);
    return reply.code(201).send({
      id: info.lastInsertRowid,
      ...result,
      current,
      differs: result.cefr !== current,
    });
  });

  // Accept the suggestion: this is the only place a test changes the profile.
  app.post('/api/users/:id/placement/:pid/apply', (req, reply) => {
    const row = db
      .prepare('SELECT id, result_cefr FROM placements WHERE id = ? AND user_id = ?')
      .get(req.params.pid, req.params.id);
    if (!row) return reply.code(404).send({ error: 'resultado não encontrado' });

    db.transaction(() => {
      db.prepare('UPDATE users SET level = ? WHERE id = ?').run(row.result_cefr, req.params.id);
      db.prepare('UPDATE placements SET applied = 1 WHERE id = ?').run(row.id);
    })();
    return { ok: true, level: row.result_cefr };
  });

  app.get('/api/users/:id/placements', (req) =>
    db
      .prepare(
        'SELECT id, result_cefr, blocks_json, applied, created_at FROM placements WHERE user_id = ? ORDER BY id DESC LIMIT 10'
      )
      .all(req.params.id)
      .map((r) => ({ ...r, blocks: JSON.parse(r.blocks_json), blocks_json: undefined }))
  );

  // Record how a comprehension quiz went. The level stored is the CONTENT's, so
  // the score means something later: 3/3 on B2 material is real evidence.
  app.post('/api/users/:id/comprehension', {
    schema: {
      params: idParams,
      body: body(['source', 'cefr', 'correct', 'total'], {
        source: { type: 'string', enum: ['dialogue', 'reading'] },
        source_id: { type: 'integer' },
        cefr: { type: 'string', maxLength: 4 },
        correct: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 1 },
      }),
    },
  }, (req, reply) => {
    const { source, source_id, cefr, correct, total } = req.body;
    db.prepare(
      'INSERT INTO comprehension_results (user_id, source, source_id, cefr, correct, total) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, source, source_id ?? null, cefr, correct, total);
    return reply.code(201).send({ ok: true });
  });

  // Does the accumulated quiz evidence disagree with the profile's level?
  // Only ever a suggestion — nothing here changes the level on its own.
  app.get('/api/users/:id/level-hint', (req) => {
    const user = db.prepare('SELECT level FROM users WHERE id = ?').get(req.params.id);
    if (!user) return { hint: null };
    const mine = normalizeLevel(user.level);

    const rows = db
      .prepare(
        'SELECT cefr, correct, total FROM comprehension_results WHERE user_id = ? ORDER BY id DESC LIMIT 20'
      )
      .all(req.params.id);

    // "B1+" and "B1" are the same band for this purpose: what matters is
    // whether the material sat above, at, or below the learner's level.
    const band = (c) => idxOf(String(c).replace('+', '').toUpperCase());
    const mineIdx = idxOf(mine);

    const at = rows.filter((r) => band(r.cefr) === mineIdx);
    const above = rows.filter((r) => band(r.cefr) > mineIdx);
    const rate = (list) =>
      list.reduce((s, r) => s + r.correct / r.total, 0) / (list.length || 1);

    if (above.length >= MIN_EVIDENCE && rate(above) >= 0.8) {
      const up = LEVELS[Math.min(LEVELS.length - 1, mineIdx + 1)];
      return {
        hint: {
          direction: 'up',
          suggested: up,
          current: mine,
          samples: above.length,
          msg: `Você acertou ${Math.round(rate(above) * 100)}% das perguntas em conteúdo acima do seu nível, nas últimas ${above.length} vezes. Talvez ${mine} já esteja fácil demais — quer tentar ${up}?`,
        },
      };
    }
    if (at.length >= MIN_EVIDENCE && rate(at) <= 0.4) {
      const down = LEVELS[Math.max(0, mineIdx - 1)];
      return {
        hint: {
          direction: 'down',
          suggested: down,
          current: mine,
          samples: at.length,
          msg: `Você acertou só ${Math.round(rate(at) * 100)}% das perguntas em conteúdo do seu próprio nível, nas últimas ${at.length} vezes. Baixar para ${down} por um tempo costuma destravar mais do que insistir.`,
        },
      };
    }
    return { hint: null };
  });
}
