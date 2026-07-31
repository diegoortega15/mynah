import { db } from '../db.js';
import { correctWriting } from '../services/ai.js';

export default async function writingRoutes(app) {
  // Submit a text for AI correction.
  app.post('/api/users/:id/writing', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { prompt = '', text } = req.body ?? {};
    if (!text || !text.trim()) return reply.code(400).send({ error: 'text required' });

    let feedback;
    try {
      feedback = await correctWriting(text.trim(), user.level);
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'claude failed', detail: String(e.message) });
    }

    const info = db
      .prepare('INSERT INTO writings (user_id, prompt, user_text, feedback_json) VALUES (?, ?, ?, ?)')
      .run(user.id, prompt, text.trim(), JSON.stringify(feedback));

    return reply.code(201).send({ id: info.lastInsertRowid, feedback });
  });

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
