import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { YoutubeTranscript } from 'youtube-transcript';
import {
  generateDialogue,
  surpriseDialogue,
  generateQuestionsFor,
  classifyTranscriptLevel,
} from '../services/ai.js';
import { aiFail } from '../lib/aiError.js';
import { addPhrase } from '../lib/phrases.js';
import { ownerOf, requireOwner } from '../lib/ownership.js';
import { idParams, body } from '../lib/schemas.js';
import { levelTarget, levelGap } from '../lib/level.js';
import { resolveChannel } from '../lib/ytChannel.js';
import { getCached, translateList, translateOne, BATCH } from '../lib/translations.js';

function extractVideoId(url = '') {
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

// Join short caption segments into readable chunks, keeping each chunk's start
// time (in whole seconds) so the UI can show timestamps and seek the video.
function groupSegments(segs, maxLen = 170) {
  // youtube-transcript returns offset/duration in ms (srv3 caption format) or in
  // seconds (classic format). Detect by duration: a caption never lasts 60s+.
  const looksMs = segs.some((s) => Number(s.duration) > 60);
  const toSec = (v) => Math.max(0, Math.floor(Number(v || 0) / (looksMs ? 1000 : 1)));

  const chunks = [];
  let cur = '';
  let curOffset = 0;
  for (const s of segs) {
    const t = String(s.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (cur && (cur + ' ' + t).length > maxLen) {
      chunks.push({ text: cur.trim(), offset: curOffset });
      cur = t;
      curOffset = toSec(s.offset);
    } else {
      if (!cur) curOffset = toSec(s.offset);
      cur = (cur + ' ' + t).trim();
    }
  }
  if (cur) chunks.push({ text: cur.trim(), offset: curOffset });
  return chunks;
}

// Fingerprint of a transcript: detects captions that were edited or re-generated.
const hashChunks = (chunks) =>
  createHash('sha256').update(chunks.map((c) => `${c.offset}|${c.text}`).join('\n')).digest('hex').slice(0, 32);

// Translations already in the cache, aligned with chunks (null where missing).
const cachedTx = (chunks) => chunks.map((c) => getCached(c.text));

// The stored CEFR verdict plus how it compares to this learner's level.
function levelInfo(row, userId) {
  if (!row?.level_cefr) return null;
  const user = db.prepare('SELECT level FROM users WHERE id = ?').get(userId);
  return {
    cefr: row.level_cefr,
    why: row.level_why,
    gap: user ? levelGap(row.level_cefr, user.level) : null,
  };
}

// Best-effort video title via YouTube's public oEmbed endpoint (no API key).
async function fetchTitle(vid) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j.title || null;
  } catch {
    return null;
  }
}

export default async function listeningRoutes(app) {
  // Generate a dialogue for a theme and store it.
  app.post('/api/users/:id/listening/generate', {
    schema: {
      params: idParams,
      body: body(['theme'], { theme: { type: 'string', minLength: 1, maxLength: 120 } }),
    },
  }, async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const { theme } = req.body ?? {};
    if (!theme || !theme.trim()) return reply.code(400).send({ error: 'theme required' });

    const target = levelTarget(user);
    let dialogue;
    try {
      dialogue = await generateDialogue(theme.trim(), target);
    } catch (e) {
      return aiFail(req, reply, e);
    }
    if (!dialogue.lines.length) return reply.code(502).send({ error: 'empty dialogue' });

    const info = db
      .prepare(
        'INSERT INTO dialogues (user_id, theme, title, lines_json, questions_json, level_cefr) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        user.id, theme.trim(), dialogue.title,
        JSON.stringify(dialogue.lines), JSON.stringify(dialogue.questions ?? []), target.cefr
      );

    return reply.code(201).send({ id: info.lastInsertRowid, cefr: target.cefr, ...dialogue });
  });

  // Surprise: Claude picks a fresh theme and generates a dialogue.
  app.post('/api/users/:id/listening/surprise', async (req, reply) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });
    const target = levelTarget(user);
    let dialogue;
    try {
      dialogue = await surpriseDialogue(target);
    } catch (e) {
      return aiFail(req, reply, e);
    }
    if (!dialogue.lines.length) return reply.code(502).send({ error: 'empty dialogue' });
    const info = db
      .prepare(
        'INSERT INTO dialogues (user_id, theme, title, lines_json, questions_json, level_cefr) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        user.id, dialogue.theme, dialogue.title,
        JSON.stringify(dialogue.lines), JSON.stringify(dialogue.questions ?? []), target.cefr
      );
    return reply.code(201).send({ id: info.lastInsertRowid, cefr: target.cefr, ...dialogue });
  });

  // YouTube: fetch a video's transcript to practise with real audio.
  app.post('/api/users/:id/youtube', {
    schema: {
      params: idParams,
      body: body(['url'], { url: { type: 'string', minLength: 5, maxLength: 300 } }),
    },
  }, async (req, reply) => {
    const vid = extractVideoId(req.body?.url || '');
    if (!vid) return reply.code(400).send({ error: 'URL do YouTube inválida' });
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

    let segs;
    try {
      // Force English captions (default track can be another language).
      segs = await withTimeout(YoutubeTranscript.fetchTranscript(vid, { lang: 'en' }), 15000);
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({
        error: 'no_captions',
        detail:
          'Esse vídeo não tem legendas em inglês (ou o YouTube não as liberou). Escolha outro vídeo com legendas em inglês.',
      });
    }
    const chunks = groupSegments(segs);
    if (!chunks.length) return reply.code(502).send({ error: 'Transcrição vazia.' });

    // Save (or refresh) the video for this user so it can be reopened later.
    const title = await fetchTitle(vid);
    const row = db
      .prepare(
        `INSERT INTO youtube_videos (user_id, video_id, title, chunks_json, chunks_hash, fetched_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, video_id)
         DO UPDATE SET title = excluded.title, chunks_json = excluded.chunks_json,
                       chunks_hash = excluded.chunks_hash, fetched_at = excluded.fetched_at,
                       created_at = datetime('now')
         RETURNING id, level_cefr, level_why, fetched_at`
      )
      .get(req.params.id, vid, title, JSON.stringify(chunks), hashChunks(chunks));

    return {
      id: row.id, videoId: vid, title, chunks,
      tx: cachedTx(chunks),
      fetchedAt: row.fetched_at,
      level: levelInfo(row, req.params.id),
    };
  });

  // List a user's watched YouTube videos.
  app.get('/api/users/:id/youtube-videos', (req) => {
    const rows = db
      .prepare(
        'SELECT id, video_id, title, level_cefr, created_at FROM youtube_videos WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30'
      )
      .all(req.params.id);
    return rows.map((r) => ({
      id: r.id,
      videoId: r.video_id,
      title: r.title,
      cefr: r.level_cefr,
      created_at: r.created_at,
    }));
  });

  // Reopen a saved video (transcript served from cache — instant, no re-fetch).
  app.get('/api/users/:id/youtube-videos/:rowId', (req, reply) => {
    const r = db
      .prepare(
        'SELECT video_id, title, chunks_json, fetched_at, level_cefr, level_why FROM youtube_videos WHERE id = ? AND user_id = ?'
      )
      .get(req.params.rowId, req.params.id);
    if (!r) return reply.code(404).send({ error: 'vídeo não encontrado' });
    const chunks = JSON.parse(r.chunks_json);
    return {
      videoId: r.video_id, title: r.title, chunks,
      tx: cachedTx(chunks),
      fetchedAt: r.fetched_at,
      level: levelInfo(r, req.params.id),
    };
  });

  // Translate a slice of the transcript. The client walks the video in batches
  // so it can show progress and fill lines in as they land; anything already in
  // the translation cache comes back without touching the AI.
  app.post('/api/youtube-videos/:rowId/translate', {
    schema: {
      body: body([], { from: { type: 'integer', minimum: 0 }, to: { type: 'integer', minimum: 0 } }),
    },
  }, async (req, reply) => {
    if (!requireOwner(reply, ownerOf.youtubeVideo(req.params.rowId), req.query.uid)) return;
    const r = db.prepare('SELECT chunks_json FROM youtube_videos WHERE id = ?').get(req.params.rowId);
    const chunks = JSON.parse(r.chunks_json);

    const from = Math.max(0, Number(req.body?.from ?? 0));
    const to = Math.min(chunks.length, Number(req.body?.to ?? from + BATCH));
    if (from >= to) return { from, pt: [] };

    // Text comes from the DB, never from the client — the client only picks a range.
    const slice = chunks.slice(from, to).map((c) => c.text);
    try {
      return { from, pt: await translateList(slice) };
    } catch (e) {
      return aiFail(req, reply, e);
    }
  });

  // Re-fetch the caption track and see whether the video's transcript changed.
  // Captions do get edited, and auto-captions are re-generated as YouTube's
  // speech model improves — a stale transcript makes click-to-seek land wrong.
  app.post('/api/users/:id/youtube-videos/:rowId/refresh', async (req, reply) => {
    const r = db
      .prepare('SELECT video_id, chunks_json FROM youtube_videos WHERE id = ? AND user_id = ?')
      .get(req.params.rowId, req.params.id);
    if (!r) return reply.code(404).send({ error: 'vídeo não encontrado' });

    let segs;
    try {
      segs = await YoutubeTranscript.fetchTranscript(r.video_id, { lang: 'en' });
    } catch (e) {
      req.log.error(e);
      return reply.code(502).send({
        error: 'no_captions',
        detail: 'Não consegui buscar a legenda agora (o vídeo pode ter saído do ar ou perdido as legendas).',
      });
    }
    const chunks = groupSegments(segs);
    if (!chunks.length) return reply.code(502).send({ error: 'Transcrição vazia.' });

    // Compare against the stored transcript itself, not the chunks_hash column:
    // videos saved before that column existed have it NULL and would otherwise
    // all report "the captions changed" on the first refresh.
    const hash = hashChunks(chunks);
    const changed = hash !== hashChunks(JSON.parse(r.chunks_json));
    // Re-classify only when the content actually changed; the old level would be stale.
    db.prepare(
      `UPDATE youtube_videos SET chunks_json = ?, chunks_hash = ?, fetched_at = datetime('now')
         ${changed ? ', level_cefr = NULL, level_why = NULL' : ''}
       WHERE id = ?`
    ).run(JSON.stringify(chunks), hash, req.params.rowId);

    const fresh = db.prepare('SELECT fetched_at FROM youtube_videos WHERE id = ?').get(req.params.rowId);
    return { changed, chunks, tx: cachedTx(chunks), fetchedAt: fresh.fetched_at };
  });

  // Judge the video's CEFR level (one AI call, then cached on the row).
  // Called after the player renders, so it never delays getting to the video.
  app.post('/api/users/:id/youtube-videos/:rowId/level', async (req, reply) => {
    const r = db
      .prepare('SELECT video_id, chunks_json, level_cefr, level_why FROM youtube_videos WHERE id = ? AND user_id = ?')
      .get(req.params.rowId, req.params.id);
    if (!r) return reply.code(404).send({ error: 'vídeo não encontrado' });
    if (r.level_cefr) return levelInfo(r, req.params.id);

    // The level belongs to the video, not the profile — reuse another profile's verdict.
    const twin = db
      .prepare('SELECT level_cefr, level_why FROM youtube_videos WHERE video_id = ? AND level_cefr IS NOT NULL LIMIT 1')
      .get(r.video_id);

    let verdict = twin ? { cefr: twin.level_cefr, why: twin.level_why } : null;
    if (!verdict) {
      try {
        verdict = await classifyTranscriptLevel(JSON.parse(r.chunks_json));
      } catch (e) {
        return aiFail(req, reply, e);
      }
    }
    if (!verdict) return reply.code(502).send({ error: 'Não consegui avaliar o nível deste vídeo.' });

    db.prepare('UPDATE youtube_videos SET level_cefr = ?, level_why = ? WHERE id = ?')
      .run(verdict.cefr, verdict.why, req.params.rowId);
    return levelInfo({ level_cefr: verdict.cefr, level_why: verdict.why }, req.params.id);
  });

  // Delete a saved video (owner only).
  app.delete('/api/youtube-videos/:rowId', (req, reply) => {
    if (!requireOwner(reply, ownerOf.youtubeVideo(req.params.rowId), req.query.uid)) return;
    db.prepare('DELETE FROM youtube_videos WHERE id = ?').run(req.params.rowId);
    return { ok: true };
  });

  // ---- Favourite channels: where this learner likes to look for videos ----

  app.get('/api/users/:id/channels', (req) => {
    return db
      .prepare('SELECT id, name, url, note, created_at FROM channels WHERE user_id = ? ORDER BY name COLLATE NOCASE')
      .all(req.params.id);
  });

  // Accepts a handle, a channel URL, or a video URL (channel resolved via oEmbed).
  app.post('/api/users/:id/channels', {
    schema: {
      params: idParams,
      body: body(['input'], {
        input: { type: 'string', minLength: 1, maxLength: 300 },
        note: { type: 'string', maxLength: 120 },
      }),
    },
  }, async (req, reply) => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return reply.code(404).send({ error: 'user not found' });

    const ch = await resolveChannel(req.body?.input);
    if (!ch) {
      return reply.code(400).send({
        error: 'Não reconheci esse canal. Cole o endereço do canal (youtube.com/@nome) ou de um vídeo dele.',
      });
    }

    const existing = db
      .prepare('SELECT id, name, url, note, created_at FROM channels WHERE user_id = ? AND url = ?')
      .get(user.id, ch.url);
    if (existing) return reply.code(200).send({ ...existing, already: true });

    const info = db
      .prepare('INSERT INTO channels (user_id, name, url, note) VALUES (?, ?, ?, ?)')
      .run(user.id, ch.name, ch.url, req.body?.note?.trim() || null);
    return reply.code(201).send({
      id: info.lastInsertRowid,
      name: ch.name,
      url: ch.url,
      note: req.body?.note?.trim() || null,
    });
  });

  app.delete('/api/channels/:cid', (req, reply) => {
    if (!requireOwner(reply, ownerOf.channel(req.params.cid), req.query.uid)) return;
    db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.cid);
    return { ok: true };
  });

  // List a user's dialogues.
  app.get('/api/users/:id/listening', (req) => {
    const rows = db
      .prepare(
        'SELECT id, theme, title, lines_json, questions_json, level_cefr, created_at FROM dialogues WHERE user_id = ? ORDER BY id DESC LIMIT 30'
      )
      .all(req.params.id);
    const parse = (json, fallback) => {
      try {
        return json ? JSON.parse(json) : fallback;
      } catch {
        return fallback;
      }
    };
    return rows.map((r) => ({
      id: r.id,
      theme: r.theme,
      title: r.title,
      lines: parse(r.lines_json, []),
      questions: parse(r.questions_json, []), // dialogues created before this feature have none
      cefr: r.level_cefr, // null for dialogues generated before levels were recorded
      created_at: r.created_at,
    }));
  });

  // Backfill comprehension questions for a dialogue created before the feature.
  app.post('/api/dialogues/:dialogueId/questions', async (req, reply) => {
    const owner = ownerOf.dialogue(req.params.dialogueId);
    if (!requireOwner(reply, owner, req.query.uid)) return;
    const d = db
      .prepare('SELECT lines_json, questions_json FROM dialogues WHERE id = ?')
      .get(req.params.dialogueId);
    if (!d) return reply.code(404).send({ error: 'not found' });
    try {
      const existing = JSON.parse(d.questions_json || '[]');
      if (existing.length) return { questions: existing }; // already has them
    } catch {
      /* corrupted → regenerate */
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(owner);
    const text = JSON.parse(d.lines_json)
      .map((l) => `${l.speaker}: ${l.en}`)
      .join('\n');
    let questions;
    try {
      questions = await generateQuestionsFor(text, levelTarget(user));
    } catch (e) {
      return aiFail(req, reply, e);
    }
    db.prepare('UPDATE dialogues SET questions_json = ? WHERE id = ?')
      .run(JSON.stringify(questions), req.params.dialogueId);
    return { questions };
  });

  // Delete a dialogue (owner only).
  app.delete('/api/dialogues/:dialogueId', (req, reply) => {
    if (!requireOwner(reply, ownerOf.dialogue(req.params.dialogueId), req.query.uid)) return;
    db.prepare('DELETE FROM dialogues WHERE id = ?').run(req.params.dialogueId);
    return { ok: true };
  });

  // Save a phrase as a vocab card ("frase do dia"). Translates if no pt given.
  app.post('/api/users/:id/phrases', {
    schema: {
      params: idParams,
      body: body(['en'], {
        en: { type: 'string', minLength: 1, maxLength: 500 },
        pt: { type: 'string', maxLength: 500 },
        context: { type: 'string', maxLength: 1000 },
      }),
    },
  }, async (req, reply) => {
    let { en, pt, context } = req.body ?? {};
    if (!en || !en.trim()) return reply.code(400).send({ error: 'en required' });
    if (!pt || !pt.trim()) {
      try {
        pt = await translateOne(en.trim());
      } catch {
        pt = '';
      }
    }
    const phraseId = addPhrase(req.params.id, { en, pt, context });
    return reply.code(201).send({ phrase_id: phraseId });
  });
}
