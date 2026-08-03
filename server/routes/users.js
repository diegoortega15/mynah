import { db } from '../db.js';
import { today, daysBetween } from '../lib/srs.js';
import { idParams, body } from '../lib/schemas.js';
import { createStarterDeck } from '../lib/starterDeck.js';

const AVATARS = ['🧑', '👩', '👨', '🧕', '👧', '🦸', '🐨', '🦊', '🐼', '🦉'];

function phaseFor(dayNum) {
  if (dayNum <= 30) return { n: 1, name: 'Reativar e criar o hábito', range: '1–30' };
  if (dayNum <= 60) return { n: 2, name: 'Fluência e trabalho', range: '31–60' };
  return { n: 3, name: 'Polimento profissional', range: '61–90' };
}

const WEEK_FOCUS = [
  'Descanso ou revisão do Anki acumulado', // 0 = domingo
  'Shadowing (imitar um trecho de podcast/TED)',
  'Conversa com tutor — pauta livre do dia a dia',
  'Shadowing + escrever um e-mail profissional',
  'Conversa com tutor — tema de trabalho (reunião, projeto)',
  'Shadowing + gravar-se falando 2 min sobre um tema',
  'Imersão leve: 1 episódio ou 1 TED sem legenda', // 6 = sábado
];

const MILESTONES = [
  { day: 7, label: 'Hábito instalado' },
  { day: 30, label: 'Primeira conversa sem pânico' },
  { day: 45, label: 'Legenda opcional' },
  { day: 60, label: 'Reunião simulada' },
  { day: 90, label: 'Apresentação + Q&A' },
];

// Enrich a raw user row with derived day/phase/focus/milestones.
export function decorate(u) {
  const dayNum = Math.min(90, daysBetween(u.start_date, today()) + 1);
  const phase = phaseFor(dayNum);
  const dow = new Date(today() + 'T00:00:00').getDay();
  const nextMilestone = MILESTONES.find((m) => m.day >= dayNum) ?? null;
  const { targets_json, ...rest } = u;
  let targets;
  try {
    targets = targets_json ? JSON.parse(targets_json) : null;
  } catch {
    targets = null;
  }
  return {
    ...rest,
    targets,
    day: dayNum,
    phase,
    todayFocus: WEEK_FOCUS[dow],
    nextMilestone,
    milestones: MILESTONES.map((m) => ({ ...m, reached: dayNum >= m.day })),
  };
}

export default async function usersRoutes(app) {
  app.get('/api/users', () => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    return rows.map(decorate);
  });

  app.get('/api/users/:id', (req, reply) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return reply.code(404).send({ error: 'user not found' });
    return decorate(u);
  });

  app.post('/api/users', {
    schema: {
      body: body(['name'], {
        name: { type: 'string', minLength: 1, maxLength: 60 },
        level: { type: 'string', maxLength: 30 },
        avatar: { type: 'string', maxLength: 8 },
      }),
    },
  }, (req, reply) => {
    const { name, level = 'Intermediário', avatar } = req.body ?? {};
    if (!name || !name.trim()) return reply.code(400).send({ error: 'name required' });
    const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
    const av = avatar || AVATARS[count % AVATARS.length];
    const info = db
      .prepare('INSERT INTO users (name, avatar, level, start_date) VALUES (?, ?, ?, ?)')
      .run(name.trim(), av, level, today());
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    // Every new profile starts with a static deck — first review works in
    // 2 minutes, no AI required.
    createStarterDeck(u.id);
    return reply.code(201).send(decorate(u));
  });

  // Update profile fields (name, avatar, level, start_date).
  app.patch('/api/users/:id', {
    schema: {
      params: idParams,
      body: body([], {
        name: { type: 'string', minLength: 1, maxLength: 60 },
        level: { type: 'string', maxLength: 30 },
        avatar: { type: 'string', maxLength: 8 },
        start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        targets: {
          type: 'object',
          properties: {
            listen: { type: 'integer', minimum: 1, maximum: 5 },
            vocab: { type: 'integer', minimum: 5, maximum: 100 },
            speak: { type: 'integer', minimum: 1, maximum: 10 },
            write: { type: 'integer', minimum: 1, maximum: 5 },
          },
          additionalProperties: false,
        },
      }),
    },
  }, (req, reply) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return reply.code(404).send({ error: 'user not found' });

    const { name, avatar, level, start_date, targets } = req.body ?? {};
    const fields = {};
    if (name && name.trim()) fields.name = name.trim();
    if (avatar) fields.avatar = avatar;
    if (level) fields.level = level;
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) fields.start_date = start_date;
    if (targets && typeof targets === 'object') fields.targets_json = JSON.stringify(targets);

    const keys = Object.keys(fields);
    if (keys.length) {
      const set = keys.map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), u.id);
    }
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    return decorate(updated);
  });

  // Delete a profile and all its data (cascade).
  app.delete('/api/users/:id', (req, reply) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return reply.code(404).send({ error: 'user not found' });
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    return { ok: true };
  });

  // Aggregate stats for the profile screen.
  app.get('/api/users/:id/profile-stats', (req) => {
    const uid = req.params.id;
    const cards = db
      .prepare(
        `SELECT COUNT(*) c FROM cards c JOIN phrases p ON p.id = c.phrase_id
           JOIN decks d ON d.id = p.deck_id WHERE d.user_id = ?`
      )
      .get(uid).c;
    const reviews = db
      .prepare(
        `SELECT COUNT(*) c FROM reviews r JOIN cards c ON c.id = r.card_id
           JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
          WHERE d.user_id = ?`
      )
      .get(uid).c;
    const writings = db.prepare('SELECT COUNT(*) c FROM writings WHERE user_id = ?').get(uid).c;
    const dialogues = db.prepare('SELECT COUNT(*) c FROM dialogues WHERE user_id = ?').get(uid).c;
    const speaking = db.prepare('SELECT COUNT(*) c FROM speaking_logs WHERE user_id = ?').get(uid).c;
    return { cards, reviews, writings, dialogues, speaking };
  });
}
