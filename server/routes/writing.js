import { db } from '../db.js';
import { correctWriting } from '../services/ai.js';
import { aiFail } from '../lib/aiError.js';
import { idParams, body } from '../lib/schemas.js';
import { recordErrors, topCategories, recentErrors } from '../lib/errorBank.js';
import { levelTarget } from '../lib/level.js';

export default async function writingRoutes(app) {
  // Submit a text for AI correction.
  app.post('/api/users/:id/writing', {
    schema: {
      params: idParams,
      body: body(['text'], {
        text: { type: 'string', minLength: 1, maxLength: 8000 },
        prompt: { type: 'string', maxLength: 300 },
      }),
    },
  }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { prompt = '', text } = req.body ?? {};
    if (!text || !text.trim()) return reply.code(400).send({ error: 'text required' });

    // Feed the learner's recurring error categories into the prompt so the
    // correction focuses on what THEY keep getting wrong.
    const recurring = topCategories(user.id, 3).map((c) => c.category);

    let feedback;
    try {
      feedback = await correctWriting(text.trim(), levelTarget(user), recurring);
    } catch (e) {
      return aiFail(req, reply, e);
    }

    const info = db
      .prepare('INSERT INTO writings (user_id, prompt, user_text, feedback_json) VALUES (?, ?, ?, ?)')
      .run(user.id, prompt, text.trim(), JSON.stringify(feedback));
    recordErrors(user.id, 'writing', feedback.errors);

    return reply.code(201).send({ id: info.lastInsertRowid, feedback });
  });

  // Recurring-errors summary (top categories in 30 days + recent examples).
  app.get('/api/users/:id/errors', (req) => ({
    top: topCategories(req.params.id, 5),
    recent: recentErrors(req.params.id, 8),
  }));

  // History (most recent first).
  app.get('/api/users/:id/writing', (req) => {
    const rows = db
      .prepare('SELECT * FROM writings WHERE user_id = ? ORDER BY id DESC LIMIT 20')
      .all(req.params.id);
    return rows.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      user_text: r.user_text,
      feedback: r.feedback_json ? JSON.parse(r.feedback_json) : null,
      created_at: r.created_at,
    }));
  });
}
