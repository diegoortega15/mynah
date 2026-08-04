import { db } from '../db.js';
import { analyzeSpeech } from '../services/ai.js';
import { aiFail } from '../lib/aiError.js';
import { mkdirSync, existsSync, unlinkSync, statSync, createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ownerOf, requireOwner } from '../lib/ownership.js';
import { recordErrors } from '../lib/errorBank.js';
import { levelTarget } from '../lib/level.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const recDir = join(__dirname, '..', 'data', 'recordings');
mkdirSync(recDir, { recursive: true });

export default async function recordingsRoutes(app) {
  // Upload a recording (raw webm body). Query: ?kind=video|audio&prompt=...
  app.post(
    '/api/users/:id/recordings',
    {
      bodyLimit: 200 * 1024 * 1024, // uploads can be several MB (only here)
      schema: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
    },
    async (req, reply) => {
      const buf = req.body;
      if (!buf || !buf.length) return reply.code(400).send({ error: 'gravação vazia' });

    const kind = req.query.kind === 'audio' ? 'audio' : 'video';
    const mime = kind === 'audio' ? 'audio/webm' : 'video/webm';
    const fname = `${req.params.id}-${Date.now()}.webm`;
    // Async write — a 100MB+ video must not block the event loop.
    await writeFile(join(recDir, fname), buf);

    const info = db
      .prepare('INSERT INTO recordings (user_id, filename, mime, kind, prompt) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, fname, mime, kind, String(req.query.prompt || ''));
    return reply.code(201).send({ id: info.lastInsertRowid });
  });

  // Catalog for a user (with transcript + any AI feedback).
  app.get('/api/users/:id/recordings', (req) =>
    db
      .prepare('SELECT id, kind, mime, prompt, transcript, feedback_json, created_at FROM recordings WHERE user_id = ? ORDER BY id DESC')
      .all(req.params.id)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        mime: r.mime,
        prompt: r.prompt,
        transcript: r.transcript || '',
        feedback: r.feedback_json ? JSON.parse(r.feedback_json) : null,
        created_at: r.created_at,
      }))
  );

  // Save the transcript captured while recording (owner only).
  app.post('/api/recordings/:id/transcript', (req, reply) => {
    if (!requireOwner(reply, ownerOf.recording(req.params.id), req.query.uid)) return;
    const { transcript } = req.body ?? {};
    db.prepare('UPDATE recordings SET transcript = ? WHERE id = ?')
      .run(String(transcript || ''), req.params.id);
    return { ok: true };
  });

  // Analyze the spoken content with the AI and store the feedback (owner only).
  app.post('/api/recordings/:id/analyze', async (req, reply) => {
    if (!requireOwner(reply, ownerOf.recording(req.params.id), req.query.uid)) return;
    const r = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
    if (!r) return reply.code(404).send({ error: 'not found' });
    const transcript = String(req.body?.transcript ?? r.transcript ?? '').trim();
    if (!transcript) return reply.code(400).send({ error: 'sem transcrição para analisar' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user_id);
    let fb;
    try {
      fb = await analyzeSpeech(transcript, user ? levelTarget(user) : undefined, r.prompt);
    } catch (e) {
      return aiFail(req, reply, e);
    }
    db.prepare('UPDATE recordings SET transcript = ?, feedback_json = ? WHERE id = ?')
      .run(transcript, JSON.stringify(fb), r.id);
    recordErrors(r.user_id, 'speaking', fb.corrections);
    return fb;
  });

  // Stream a recording file (supports Range so video seeking works). Owner only.
  app.get('/api/recordings/:id/file', (req, reply) => {
    if (!requireOwner(reply, ownerOf.recording(req.params.id), req.query.uid)) return;
    const r = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
    if (!r) return reply.code(404).send({ error: 'not found' });
    const path = join(recDir, r.filename);
    if (!existsSync(path)) return reply.code(404).send({ error: 'file gone' });

    const size = statSync(path).size;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = m ? parseInt(m[1], 10) : NaN;
      const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
      // Invalid/unsatisfiable range → 416 (a bad range would crash createReadStream).
      if (!m || Number.isNaN(start) || start >= size || end < start) {
        return reply
          .code(416)
          .header('Content-Range', `bytes */${size}`)
          .send({ error: 'range not satisfiable' });
      }
      const safeEnd = Math.min(end, size - 1);
      reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${safeEnd}/${size}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', safeEnd - start + 1)
        .header('Content-Type', r.mime);
      return reply.send(createReadStream(path, { start, end: safeEnd }));
    }
    // Always stream — never buffer a whole video into memory.
    reply
      .header('Content-Type', r.mime)
      .header('Content-Length', size)
      .header('Accept-Ranges', 'bytes');
    return reply.send(createReadStream(path));
  });

  // Delete a recording (file + row). Owner only.
  app.delete('/api/recordings/:id', (req, reply) => {
    if (!requireOwner(reply, ownerOf.recording(req.params.id), req.query.uid)) return;
    const r = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
    if (r) {
      try {
        unlinkSync(join(recDir, r.filename));
      } catch {
        /* file already gone */
      }
      db.prepare('DELETE FROM recordings WHERE id = ?').run(r.id);
    }
    return { ok: true };
  });
}
