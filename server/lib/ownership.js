import { db } from '../db.js';

// Resolve the owning user_id of each resource type (null when it doesn't exist).
// The app has no auth (local, trusted profiles), so this is not a security
// boundary — it prevents one profile from touching another's content by
// accident (wrong id, stale UI, shared machine).
export const ownerOf = {
  deck: (id) => db.prepare('SELECT user_id FROM decks WHERE id = ?').get(id)?.user_id ?? null,
  card: (id) =>
    db
      .prepare(
        `SELECT d.user_id FROM cards c
           JOIN phrases p ON p.id = c.phrase_id
           JOIN decks d ON d.id = p.deck_id
          WHERE c.id = ?`
      )
      .get(id)?.user_id ?? null,
  dialogue: (id) => db.prepare('SELECT user_id FROM dialogues WHERE id = ?').get(id)?.user_id ?? null,
  recording: (id) => db.prepare('SELECT user_id FROM recordings WHERE id = ?').get(id)?.user_id ?? null,
  youtubeVideo: (id) =>
    db.prepare('SELECT user_id FROM youtube_videos WHERE id = ?').get(id)?.user_id ?? null,
  channel: (id) => db.prepare('SELECT user_id FROM channels WHERE id = ?').get(id)?.user_id ?? null,
};

// Guard: replies 404 (not 403 — no need to reveal existence) unless the
// resource exists and belongs to `uid`. Returns true when the request may
// proceed. `uid` comes from the client (?uid= query) — see note above.
export function requireOwner(reply, ownerId, uid) {
  const u = Number(uid);
  if (!ownerId || !Number.isInteger(u) || u !== Number(ownerId)) {
    reply.code(404).send({ error: 'not found' });
    return false;
  }
  return true;
}
