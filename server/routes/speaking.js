import { db } from '../db.js';
import {
  tutorReply,
  generateShadowing,
  roleplayScenario,
  roleplayTurn,
  roleplayEvaluate,
} from '../services/ai.js';
import { recordErrors } from '../lib/errorBank.js';
import { idParams, body } from '../lib/schemas.js';
import { topCategories } from '../lib/errorBank.js';
import { levelTarget } from '../lib/level.js';
import { aiFail } from '../lib/aiError.js';
import { translateOne } from '../lib/translations.js';

export default async function speakingRoutes(app) {
  // On-demand translation (used by the tutor's "traduzir" button).
  app.post('/api/translate', {
    schema: { body: body(['text'], { text: { type: 'string', minLength: 1, maxLength: 1000 } }) },
  }, async (req, reply) => {
    const { text } = req.body ?? {};
    if (!text || !text.trim()) return reply.code(400).send({ error: 'text required' });
    try {
      return { pt: await translateOne(text.trim()) };
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });

  // Generate fresh shadowing sentences (IA), independent of the vocab queue.
  app.post('/api/users/:id/shadowing/generate', {
    schema: { params: idParams, body: body([], { theme: { type: 'string', maxLength: 120 } }) },
  }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    try {
      const items = await generateShadowing(levelTarget(user), req.body?.theme);
      if (!items.length) return reply.code(502).send({ error: 'empty' });
      return { items };
    } catch (e) {
      return aiFail(req, reply, e);
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
      const recurring = topCategories(user.id, 3).map((c) => c.category);
      const { reply: text } = await tutorReply(history, { level: levelTarget(user), focus, recurring });
      return { reply: text };
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });

  // ── Roleplay with objective ────────────────────────────────────────────────
  const normalizeHistory = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.text ?? m.content))
      .map((m) => ({
        role: m.role === 'tutor' || m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.text ?? m.content),
      }));

  // Start: generate a scenario with a concrete objective.
  app.post('/api/users/:id/roleplay/start', {
    schema: { params: idParams, body: body([], { theme: { type: 'string', maxLength: 120 } }) },
  }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    try {
      return await roleplayScenario(levelTarget(user), req.body?.theme);
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });

  // One in-character turn (no corrections mid-roleplay).
  app.post('/api/users/:id/roleplay/turn', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    const history = normalizeHistory(req.body?.messages);
    if (!history.length) return reply.code(400).send({ error: 'messages required' });
    try {
      return await roleplayTurn(history, {
        level: levelTarget(user),
        scenario: req.body?.scenario ?? {},
      });
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });

  // Final evaluation: objective achieved? score + better phrases (fed to the
  // error bank so recurring weaknesses accumulate).
  app.post('/api/users/:id/roleplay/evaluate', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    const history = normalizeHistory(req.body?.messages);
    if (!history.length) return reply.code(400).send({ error: 'messages required' });
    let result;
    try {
      result = await roleplayEvaluate(history, {
        level: levelTarget(user),
        scenario: req.body?.scenario ?? {},
      });
    } catch (e) {
      return aiFail(req, reply, e);
    }
    recordErrors(user.id, 'speaking', result.better_phrases);
    db.prepare(
      'INSERT INTO speaking_logs (user_id, mode, target_text, transcript, score) VALUES (?, ?, ?, ?, ?)'
    ).run(
      user.id,
      'roleplay',
      String(req.body?.scenario?.objective ?? ''),
      history.filter((m) => m.role === 'user').map((m) => m.content).join(' | ').slice(0, 4000),
      result.score
    );
    return result;
  });

  // Log a speaking attempt (shadowing / record).
  app.post('/api/users/:id/speaking', {
    schema: {
      params: idParams,
      body: body(['mode'], {
        mode: { type: 'string', enum: ['shadow', 'record', 'tutor', '432', 'roleplay'] },
        target: { type: 'string', maxLength: 1000 },
        transcript: { type: 'string', maxLength: 5000 },
        score: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
      }),
    },
  }, (req, reply) => {
    const { mode, target = '', transcript = '', score = null } = req.body ?? {};
    if (!['shadow', 'record', 'tutor', '432', 'roleplay'].includes(mode))
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
