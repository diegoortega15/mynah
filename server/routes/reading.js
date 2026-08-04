import { db } from '../db.js';
import { generateReading, lookupWord, generateQuestionsFor } from '../services/ai.js';
import { aiFail } from '../lib/aiError.js';
import { idParams, body } from '../lib/schemas.js';
import { requireOwner } from '../lib/ownership.js';
import { levelTarget } from '../lib/level.js';

export default async function readingRoutes(app) {
  // Generate a text at the learner's (dynamic) level and store it.
  app.post('/api/users/:id/reading/generate', {
    schema: { params: idParams, body: body([], { theme: { type: 'string', maxLength: 120 } }) },
  }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    let r;
    try {
      r = await generateReading(levelTarget(user), req.body?.theme);
    } catch (e) {
      return aiFail(req, reply, e);
    }
    const info = db
      .prepare(
        'INSERT INTO readings (user_id, theme, title, text_en, questions_json) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        user.id, String(req.body?.theme ?? ''), r.title, r.text,
        JSON.stringify(r.questions ?? [])
      );
    return reply.code(201).send({ id: info.lastInsertRowid, ...r });
  });

  // List saved readings (full text — they're small).
  app.get('/api/users/:id/readings', (req) =>
    db
      .prepare(
        'SELECT id, theme, title, text_en, questions_json, created_at FROM readings WHERE user_id = ? ORDER BY id DESC LIMIT 30'
      )
      .all(req.params.id)
      .map(({ questions_json, ...rest }) => {
        let questions;
        try {
          questions = questions_json ? JSON.parse(questions_json) : [];
        } catch {
          questions = []; // readings created before this feature
        }
        return { ...rest, questions };
      })
  );

  // Backfill comprehension questions for a reading created before the feature.
  app.post('/api/readings/:rid/questions', async (req, reply) => {
    const row = db
      .prepare('SELECT user_id, text_en, questions_json FROM readings WHERE id = ?')
      .get(req.params.rid);
    if (!requireOwner(reply, row?.user_id ?? null, req.query.uid)) return;
    try {
      const existing = JSON.parse(row.questions_json || '[]');
      if (existing.length) return { questions: existing }; // already has them
    } catch {
      /* corrupted → regenerate */
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    let questions;
    try {
      questions = await generateQuestionsFor(row.text_en, levelTarget(user));
    } catch (e) {
      return aiFail(req, reply, e);
    }
    db.prepare('UPDATE readings SET questions_json = ? WHERE id = ?')
      .run(JSON.stringify(questions), req.params.rid);
    return { questions };
  });

  // Delete a reading (owner only).
  app.delete('/api/readings/:rid', (req, reply) => {
    const owner =
      db.prepare('SELECT user_id FROM readings WHERE id = ?').get(req.params.rid)?.user_id ?? null;
    if (!requireOwner(reply, owner, req.query.uid)) return;
    db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.rid);
    return { ok: true };
  });

  // 1-click word lookup (word meaning IN its sentence).
  app.post('/api/users/:id/lookup', {
    schema: {
      params: idParams,
      body: body(['word', 'sentence'], {
        word: { type: 'string', minLength: 1, maxLength: 60 },
        sentence: { type: 'string', minLength: 1, maxLength: 600 },
      }),
    },
  }, async (req, reply) => {
    try {
      return { pt: await lookupWord(req.body.word, req.body.sentence) };
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });
}
