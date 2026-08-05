import { LEVELS, idxOf, VOCAB, LISTENING, CLOZE } from './placementBank.js';

// Adaptive placement test. Stateless on purpose: the client keeps the answers
// and posts them back on every step, and the server recomputes what to ask
// next. No session storage, no way to end up with a half-finished row.
//
// Shape of an answer:
//   vocab     -> { id: 'vocab', known: ['water', 'afford', …] }
//   listening -> { id: 'l-b1', value: 1 }   (index of the chosen option)
//   cloze     -> { id: 'c-b1', value: 2 }

export const LISTENING_ITEMS = 5;
export const CLOZE_ITEMS = 8;
const START = idxOf('B1'); // everyone starts in the middle and the test walks

const clampIdx = (i) => Math.max(0, Math.min(LEVELS.length - 1, i));

/**
 * Shuffle a copy. The vocabulary list MUST be shuffled before it reaches the
 * learner: in bank order the made-up words all sit at the end, which gives the
 * trick away and turns the block back into a self-assessment.
 */
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick the unseen item closest to the wanted level (ties break upward). */
function pickNear(pool, wantIdx, seen) {
  const left = pool.filter((it) => !seen.has(it.id));
  if (!left.length) return null;
  return left.sort((a, b) => {
    const da = Math.abs(idxOf(a.level) - wantIdx);
    const db = Math.abs(idxOf(b.level) - wantIdx);
    return da - db || idxOf(b.level) - idxOf(a.level);
  })[0];
}

/**
 * Walk a block: right answer aims one level higher, wrong answer one lower.
 * Returns the running level index and the items already answered.
 */
function walk(pool, answers, limit) {
  const seen = new Set();
  let idx = START;
  const done = [];
  for (const a of answers) {
    const item = pool.find((it) => it.id === a.id);
    if (!item) continue;
    seen.add(item.id);
    const right = a.value === item.answer;
    done.push({ item, right });
    idx = clampIdx(idx + (right ? 1 : -1));
    if (done.length >= limit) break;
  }
  return { idx, seen, done };
}

/** Vocabulary breadth from the yes/no checklist. Null when the answers are noise. */
export function scoreVocab(known = []) {
  const said = new Set(known.map((w) => String(w).toLowerCase()));
  const fakes = VOCAB.filter((v) => v.fake);
  const faRate = fakes.filter((v) => said.has(v.w)).length / fakes.length;

  // Claiming most of the invented words means the answers carry no information;
  // scoring them anyway would hand out a flattering level for free.
  if (faRate > 0.5) return { cefr: null, faRate, reason: 'chute' };

  // A band counts as "known" at half or better, after discounting the rate at
  // which this person says yes to words that do not exist.
  let best = -1;
  for (const level of LEVELS) {
    const band = VOCAB.filter((v) => v.level === level);
    if (!band.length) continue;
    const hit = band.filter((v) => said.has(v.w)).length / band.length;
    if (hit - faRate >= 0.5) best = idxOf(level);
  }
  return { cefr: best < 0 ? LEVELS[0] : LEVELS[best], faRate, reason: null };
}

/** The next thing to ask, or the final result when the test is over. */
export function nextStep(answers = []) {
  const vocabAnswer = answers.find((a) => a.id === 'vocab');
  if (!vocabAnswer) {
    return {
      done: false,
      step: 1,
      total: 1 + LISTENING_ITEMS + CLOZE_ITEMS,
      item: { block: 'vocab', id: 'vocab', words: shuffled(VOCAB.map((v) => v.w)) },
    };
  }

  const lAnswers = answers.filter((a) => a.id.startsWith('l-'));
  if (lAnswers.length < LISTENING_ITEMS) {
    const { idx, seen } = walk(LISTENING, lAnswers, LISTENING_ITEMS);
    const item = pickNear(LISTENING, idx, seen);
    if (item) {
      return {
        done: false,
        step: 2 + lAnswers.length,
        total: 1 + LISTENING_ITEMS + CLOZE_ITEMS,
        item: { block: 'listening', id: item.id, speak: item.speak, q: item.q, options: item.options },
      };
    }
  }

  const cAnswers = answers.filter((a) => a.id.startsWith('c-'));
  if (cAnswers.length < CLOZE_ITEMS) {
    const { idx, seen } = walk(CLOZE, cAnswers, CLOZE_ITEMS);
    const item = pickNear(CLOZE, idx, seen);
    if (item) {
      return {
        done: false,
        step: 2 + LISTENING_ITEMS + cAnswers.length,
        total: 1 + LISTENING_ITEMS + CLOZE_ITEMS,
        item: { block: 'cloze', id: item.id, text: item.text, options: item.options },
      };
    }
  }

  return { done: true, ...scorePlacement(answers) };
}

/**
 * Combine the three blocks into one CEFR verdict.
 * Listening weighs most: this app is listening-first, and understanding speech
 * is the skill the learner said was the bottleneck. Vocabulary is the most
 * reliable single measure, so it comes second. Gap fill is the tie-breaker —
 * grammar knowledge outruns real comprehension in most self-taught learners.
 */
export function scorePlacement(answers = []) {
  const vocab = scoreVocab(answers.find((a) => a.id === 'vocab')?.known ?? []);
  const listening = walk(LISTENING, answers.filter((a) => a.id.startsWith('l-')), LISTENING_ITEMS);
  const cloze = walk(CLOZE, answers.filter((a) => a.id.startsWith('c-')), CLOZE_ITEMS);

  // A block's level is the hardest item answered right, nudged down when the
  // learner also missed something at or below it.
  const blockLevel = (done) => {
    if (!done.length) return null;
    const rights = done.filter((d) => d.right).map((d) => idxOf(d.item.level));
    const wrongs = done.filter((d) => !d.right).map((d) => idxOf(d.item.level));
    if (!rights.length) return 0;
    const top = Math.max(...rights);
    const missedBelow = wrongs.filter((w) => w <= top).length;
    return clampIdx(top - (missedBelow >= 2 ? 1 : 0));
  };

  const parts = [
    { key: 'listening', idx: blockLevel(listening.done), weight: 0.45 },
    { key: 'vocab', idx: vocab.cefr === null ? null : idxOf(vocab.cefr), weight: 0.35 },
    { key: 'cloze', idx: blockLevel(cloze.done), weight: 0.2 },
  ].filter((p) => p.idx !== null);

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0) || 1;
  const combined = parts.reduce((s, p) => s + p.idx * p.weight, 0) / totalWeight;
  const cefr = LEVELS[clampIdx(Math.round(combined))];

  return {
    cefr,
    blocks: {
      vocab: vocab.cefr,
      vocabNoise: vocab.reason === 'chute',
      listening: listening.done.length ? LEVELS[blockLevel(listening.done)] : null,
      listeningRight: listening.done.filter((d) => d.right).length,
      listeningTotal: listening.done.length,
      cloze: cloze.done.length ? LEVELS[blockLevel(cloze.done)] : null,
      clozeRight: cloze.done.filter((d) => d.right).length,
      clozeTotal: cloze.done.length,
    },
  };
}
