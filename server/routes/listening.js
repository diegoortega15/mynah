import { db } from '../db.js';
import { YoutubeTranscript } from 'youtube-transcript';
import { generateDialogue, surpriseDialogue, translatePhrase } from '../services/ai.js';
import { addPhrase } from '../lib/phrases.js';

function extractVideoId(url = '') {
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

// Join short caption segments into readable chunks.
function groupSegments(segs, maxLen = 170) {
  const chunks = [];
  let cur = '';
  for (const s of segs) {
    const t = String(s.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (cur && (cur + ' ' + t).length > maxLen) {
      chunks.push(cur.trim());
      cur = t;
    } else {
      cur = (cur + ' ' + t).trim();
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}

export default async function listeningRoutes(app) {
  // Generate a dialogue for a theme and store it.
  app.post('/api/users/:id/listening/generate', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { theme } = req.body ?? {};
    if (!theme || !theme.trim()) return reply.code(400).send({ error: 'theme required' });

    let dialogue;
    try {
      dialogue = await generateDialogue(theme.trim(), user.level);
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'claude failed', detail: String(e.message) });
    }
    if (!dialogue.lines.length) return reply.code(502).send({ error: 'empty dialogue' });

    const info = db
      .prepare('INSERT INTO dialogues (user_id, theme, title, lines_json) VALUES (?, ?, ?, ?)')
      .run(user.id, theme.trim(), dialogue.title, JSON.stringify(dialogue.lines));

    return reply.code(201).send({ id: info.lastInsertRowid, ...dialogue });
  });

  // Surprise: Claude picks a fresh theme and generates a dialogue.
  app.post('/api/users/:id/listening/surprise', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    let dialogue;
    try {
      dialogue = await surpriseDialogue(user.level);
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({ error: 'ai failed', detail: String(e.message) });
    }
    if (!dialogue.lines.length) return reply.code(502).send({ error: 'empty dialogue' });
    const info = db
      .prepare('INSERT INTO dialogues (user_id, theme, title, lines_json) VALUES (?, ?, ?, ?)')
      .run(user.id, dialogue.theme, dialogue.title, JSON.stringify(dialogue.lines));
    return reply.code(201).send({ id: info.lastInsertRowid, ...dialogue });
  });

  // YouTube: fetch a video's transcript to practise with real audio.
  app.post('/api/users/:id/youtube', async (req, reply) => {
    const vid = extractVideoId(req.body?.url || '');
    if (!vid) return reply.code(400).send({ error: 'URL do YouTube inválida' });
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    let segs;
    try {
      // Force English captions (default track can be another language).
      segs = await withTimeout(YoutubeTranscript.fetchTranscript(vid, { lang: 'en' }), 15000);
    } catch (e) {
      return reply.code(502).send({
        error:
          'Esse vídeo não tem legendas em inglês (ou legendas disponíveis). Escolha outro vídeo com legendas em inglês.',
        detail: String(e.message),
      });
    }
    const chunks = groupSegments(segs);
    if (!chunks.length) return reply.code(502).send({ error: 'Transcrição vazia.' });
    return { videoId: vid, chunks };
  });

  // List a user's dialogues.
  app.get('/api/users/:id/listening', (req) => {
    const rows = db
      .prepare('SELECT id, theme, title, lines_json, created_at FROM dialogues WHERE user_id = ? ORDER BY id DESC LIMIT 30')
      .all(req.params.id);
    return rows.map((r) => ({
      id: r.id,
      theme: r.theme,
      title: r.title,
      lines: JSON.parse(r.lines_json),
      created_at: r.created_at,
    }));
  });

  // Delete a dialogue.
  app.delete('/api/dialogues/:dialogueId', (req) => {
    db.prepare('DELETE FROM dialogues WHERE id = ?').run(req.params.dialogueId);
    return { ok: true };
  });

  // Save a phrase as a vocab card ("frase do dia"). Translates if no pt given.
  app.post('/api/users/:id/phrases', async (req, reply) => {
    let { en, pt, context } = req.body ?? {};
    if (!en || !en.trim()) return reply.code(400).send({ error: 'en required' });
    if (!pt || !pt.trim()) {
      try {
        pt = await translatePhrase(en.trim());
      } catch {
        pt = '';
      }
    }
    const phraseId = addPhrase(req.params.id, { en, pt, context });
    return reply.code(201).send({ phrase_id: phraseId });
  });
}
