import { db } from '../db.js';
import { daysBetween, today } from './srs.js';

// Dynamic difficulty (i+1): infer a CEFR target for AI generation from the
// learner's actual performance, so the day-85 dialogue is harder than day-1's.
// Signals: plan day, recent writing error rate, shadowing scores, review lapses.

// Full CEFR scale as chosen by the user, with the intermediate "+" rungs the
// ladder needs to climb smoothly.
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LADDER = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C1+', 'C2'];

// Where each selectable level starts on the ladder.
const BASE = { A1: 0, A2: 2, B1: 4, B2: 6, C1: 8, C2: 10 };
// Profiles created before the CEFR switch used PT-BR labels.
const LEGACY = { Básico: 'A2', Intermediário: 'B1', Avançado: 'C1' };

// Concrete writing instructions per band — without these the model tends to
// write "clean corporate English" regardless of the label, which is exactly
// what makes lower levels feel too hard.
const GUIDANCE = {
  A1: 'very short simple sentences (5-8 words), present simple, only the ~500 most frequent words, no idioms, no phrasal verbs',
  'A1+': 'short simple sentences, present and basic past, top ~800 words, no idioms',
  A2: 'short everyday sentences, present/past/future simple, top ~1500 words, at most one very common phrasal verb',
  'A2+': 'simple sentences with basic connectors (and, but, because), top ~2000 words, a few very common phrasal verbs',
  B1: 'clear everyday language, common tenses, top ~2500 words, common phrasal verbs and a few work collocations; avoid rare idioms',
  'B1+': 'everyday and routine work language, some complex sentences, common collocations and idioms',
  B2: 'natural professional English, varied structures, common idioms and phrasal verbs, some nuance',
  'B2+': 'fluent professional English, richer vocabulary, hedging and register shifts',
  C1: 'sophisticated natural English, idiomatic, nuanced register, complex structures',
  'C1+': 'highly idiomatic and nuanced English, subtle connotation',
  C2: 'near-native English: full idiomatic range, subtlety, humour and cultural references',
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Normalize whatever is stored in users.level to a CEFR code.
export function normalizeLevel(level) {
  const v = String(level ?? '').trim();
  if (BASE[v.toUpperCase()] !== undefined) return v.toUpperCase();
  return LEGACY[v] ?? 'B1';
}

/**
 * Compare a piece of content against the learner's level and phrase the gap.
 * Returns null when it lands on their level — silence is the right message
 * then. Never blocks anything: the learner decides what to watch.
 */
export function levelGap(contentCefr, userLevel) {
  const c = String(contentCefr ?? '').toUpperCase();
  if (BASE[c] === undefined) return null;
  const mine = normalizeLevel(userLevel);
  // In CEFR steps (A1→A2 is 1), not ladder rungs.
  const delta = (BASE[c] - BASE[mine]) / 2;

  // A match is reported too, not swallowed. Saying nothing when the video sits
  // on the learner's level is indistinguishable from the feature being broken —
  // and "did it even run?" is exactly the doubt this is meant to remove.
  const msg =
    delta === 0
      ? `Este vídeo parece ${c}, o seu nível — bom lugar para estar.`
      : delta >= 2
        ? `Este vídeo parece ${c} e você está em ${mine} — bem acima. Vale assistir mesmo assim: ligue a tradução sem culpa e mire na ideia geral, não em cada palavra.`
        : delta === 1
          ? `Este vídeo parece ${c}, um degrau acima do seu ${mine} — é a faixa onde mais se aprende. Se travar, a tradução está aí.`
          : delta === -1
            ? `Este vídeo parece ${c}, um pouco abaixo do seu ${mine} — bom para ganhar fluidez e ouvir sem esforço.`
            : `Este vídeo parece ${c} e você está em ${mine} — deve soar fácil. Ótimo para relaxar, mas você avança mais com algo mais difícil.`;

  return { cefr: c, mine, delta, harder: delta > 0, match: delta === 0, msg };
}

// Returns { cefr, prompt } — `prompt` is the string handed to the AI.
export function levelTarget(user) {
  const base = BASE[normalizeLevel(user.level)];
  const day = clamp(daysBetween(user.start_date, today()) + 1, 1, 90);
  // The 90-day plan raises the bar across phases — but only by one ladder rung
  // per phase, so a beginner never jumps a whole CEFR band by the calendar.
  const phaseBump = day > 60 ? 2 : day > 30 ? 1 : 0;

  // Performance adjustment (−1, 0 or +1) from recent signals.
  let score = 0;

  // Writing: error density in the last 5 corrected texts.
  const writings = db
    .prepare('SELECT user_text, feedback_json FROM writings WHERE user_id = ? ORDER BY id DESC LIMIT 5')
    .all(user.id);
  if (writings.length >= 2) {
    let words = 0;
    let errors = 0;
    for (const w of writings) {
      words += String(w.user_text).split(/\s+/).length;
      try {
        errors += (JSON.parse(w.feedback_json)?.errors ?? []).length;
      } catch {
        /* ignore */
      }
    }
    const perHundred = words ? (errors / words) * 100 : 0;
    if (perHundred < 3) score += 1;
    else if (perHundred > 8) score -= 1;
  }

  // Shadowing: average score of the last 10 attempts.
  const sh = db
    .prepare(
      "SELECT AVG(score) avg, COUNT(*) c FROM (SELECT score FROM speaking_logs WHERE user_id = ? AND mode = 'shadow' AND score IS NOT NULL ORDER BY id DESC LIMIT 10)"
    )
    .get(user.id);
  if (sh?.c >= 5) {
    if (sh.avg >= 85) score += 1;
    else if (sh.avg < 55) score -= 1;
  }

  // Reviews: lapse rate ('again') in the last 100 ratings.
  const rv = db
    .prepare(
      `SELECT COUNT(*) c, SUM(rating = 'again') lapses FROM
         (SELECT r.rating FROM reviews r JOIN cards c ON c.id = r.card_id
            JOIN phrases p ON p.id = c.phrase_id JOIN decks d ON d.id = p.deck_id
           WHERE d.user_id = ? ORDER BY r.id DESC LIMIT 100)`
    )
    .get(user.id);
  if (rv?.c >= 30) {
    const rate = rv.lapses / rv.c;
    if (rate < 0.1) score += 1;
    else if (rate > 0.3) score -= 1;
  }

  const adj = clamp(score, -1, 1);
  // Never drift more than one rung below what the learner picked — the level
  // they chose is a floor they trust.
  const idx = clamp(base + phaseBump + adj, Math.max(0, base - 1), LADDER.length - 1);
  const cefr = LADDER[idx];
  // `cefr` goes inline in the prompt ("for a B1 learner"); `guidance` is a
  // separate instruction block appended at the end — mixing them inline would
  // break the sentence the model is reading.
  return {
    cefr,
    guidance: `The learner is at this level. Every bit of English you produce (content, examples, corrections) must fit it: ${GUIDANCE[cefr]}. They must understand ~95% of it without a dictionary, with only a few slightly harder items (i+1). Never write above this level.`,
  };
}
