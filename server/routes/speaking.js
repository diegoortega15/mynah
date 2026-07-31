import { db } from '../db.js';
import { tutorReply, generateShadowing, translatePhrase } from '../services/ai.js';

export default async function speakingRoutes(app) {
  // On-demand translation (used by the tutor's "traduzir" button).
  app.post('/api/translate', async (req, reply) => {
    const { text } = req.body ?? {};
    if (!text || !text.trim()) return reply.code(400).send({ error: 'text required' });
    try {
      return { pt: await translatePhrase(text.trim()) };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'ai failed', detail: String(e.message) });
    }
  });

  // Generate fresh shadowing sentences (IA), independent of the vocab queue.
  app.post('/api/users/:id/shadowing/generate', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    try {
      const items = await generateShadowing(user.level, req.body?.theme);
      if (!items.length) return reply.code(502).send({ error: 'empty' });
      return { items };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'ai failed', detail: String(e.message) });
    }
  });

  // Conversation tutor turn. Send the whole conversation as `messages`.
  app.post('/api/users/:id/tutor', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { messages, message, focus } = req.body ?? {};
    // Accept a messages array [{role:'user'|'tutor'|'assistant', text|content}] or a single message.
    let history = Array.isArray(messages)
      ? messages
          .filter((m) => (m.text ?? m.content))
          .map((m) => ({
            role: m.role === 'tutor' || m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.text ?? m.content),
          }))
      : [];
    if (!history.length && message?.trim()) history = [{ role: 'user', content: message.trim() }];
    if (!history.length) return reply.code(400).send({ error: 'message required' });

    try {
      const { reply: text } = await tutorReply(history, { level: user.level, focus });
      return { reply: text };
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'ai failed', detail: String(e.message) });
    }
  });

  // Log a speaking attempt (shadowing / record).
  app.post('/api/users/:id/speaking', (req, reply) => {
    const { mode, target = '', transcript = '', score = null } = req.body ?? {};
    if (!['shadow', 'record', 'tutor'].includes(mode))
      return reply.code(400).send({ error: 'invalid mode' });
    const info = db
      .prepare('INSERT INTO speaking_logs (user_id, mode, target_text, transcript, score) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, mode, target, transcript, score);
    return reply.code(201).send({ id: info.lastInsertRowid });
  });

  // Recent speaking history.
  app.get('/api/users/:id/speaking', (req) => {
    return db
      .prepare('SELECT * FROM speaking_logs WHERE user_id = ? ORDER BY id DESC LIMIT 30')
      .all(req.params.id);
  });
}
