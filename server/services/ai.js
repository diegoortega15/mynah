import { getConfig } from '../config.js';
import * as claudeCli from './providers/claudeCli.js';
import * as codexCli from './providers/codexCli.js';
import * as geminiCli from './providers/geminiCli.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as ollama from './providers/ollama.js';

// Route a chat request to the configured provider. messages: [{role, content}].
// `cfgOverride` lets /config/test try a candidate config without persisting it.
export async function chat(messages, cfgOverride) {
  const c = cfgOverride || getConfig();
  switch (c.provider) {
    case 'codex-cli':
      return codexCli.chat(messages, c.codex);
    case 'gemini-cli':
      return geminiCli.chat(messages, c.geminiCli);
    case 'openai':
      return openai.chat(messages, c.openai);
    case 'gemini':
      return gemini.chat(messages, c.gemini);
    case 'ollama':
      return ollama.chat(messages, c.ollama);
    case 'claude-cli':
    default:
      return claudeCli.chat(messages, c.claude);
  }
}

// Pull JSON out of a response that may be fenced or wrapped in prose.
export function extractJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = Math.min(...['[', '{'].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
  const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (start !== Infinity && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

async function askJson(messages) {
  return extractJson(await chat(messages));
}

// Level handling. Callers pass the object from lib/level.js ({cefr, guidance});
// a bare string still works (tests/defaults). `inline` goes inside a sentence
// ("for a B1 learner"), `block` is appended as its own instruction paragraph —
// splicing the whole guidance inline would break the sentence being read.
function lv(level) {
  if (level && typeof level === 'object' && level.cefr) {
    return { inline: level.cefr, block: `\n\nLEVEL — ${level.cefr} (CEFR). ${level.guidance}` };
  }
  return { inline: String(level ?? 'B1'), block: '' };
}

// ── Vocabulary pack ──────────────────────────────────────────────────────────
export async function generatePack(theme, level = 'B1', count = 10) {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content:
        'You are a business English tutor. Always answer with raw JSON only, no markdown fences, no comments.',
    },
    {
      role: 'user',
      content: `Generate ${count} genuinely useful English phrases or collocations about the theme "${theme}" for a ${L.inline} Brazilian professional (meetings, emails, presentations, interviews).

Rules:
- Each item is a whole phrase or collocation IN CONTEXT, never a single isolated word.
- "pt" = natural Brazilian Portuguese translation.
- "context" = one short natural English example sentence used at work.

Return ONLY a JSON array: [{"en":"...","pt":"...","context":"..."}]${L.block}`,
    },
  ];
  const arr = await askJson(messages);
  if (!Array.isArray(arr)) throw new Error('pacote não é um array');
  return arr
    .filter((x) => x && x.en)
    .map((x) => ({
      en: String(x.en).trim(),
      pt: String(x.pt ?? '').trim(),
      context: String(x.context ?? '').trim(),
    }));
}

// ── Writing correction ───────────────────────────────────────────────────────
const ERROR_CATEGORIES =
  '"gramática" | "tempo verbal" | "preposição" | "artigo" | "vocabulário" | "ortografia" | "ordem das palavras" | "naturalidade"';

// `recurring` = the user's most frequent error categories (from the error
// bank) so the tutor watches for exactly what this learner keeps getting wrong.
export async function correctWriting(text, level = 'B1', recurring = []) {
  const L = lv(level);
  const recurringNote = recurring.length
    ? `\nThis learner's recurring error categories: ${recurring.join(', ')} — pay special attention to those.`
    : '';
  const messages = [
    {
      role: 'system',
      content:
        'You are an encouraging but precise English writing tutor. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Correct the text from a ${L.inline} Brazilian professional (grammar, word choice, naturalness).${recurringNote}

Return ONLY this JSON:
{
  "corrected": "full text with mistakes fixed, minimal changes",
  "errors": [{"original":"wrong bit","correction":"fixed bit","explanation":"short why, in Brazilian Portuguese","category":${ERROR_CATEGORIES}}],
  "rewrite": "a more natural, professional native-sounding version",
  "comment": "one short encouraging note in Brazilian Portuguese"
}
If there are no real errors, return an empty "errors" array.

Text:
"""${text}"""${L.block}`,
    },
  ];
  const j = await askJson(messages);
  return {
    corrected: String(j.corrected ?? text),
    errors: Array.isArray(j.errors) ? j.errors : [],
    rewrite: String(j.rewrite ?? ''),
    comment: String(j.comment ?? ''),
  };
}

// ── Listening dialogue ───────────────────────────────────────────────────────
// Comprehension questions ride along in the SAME call — no extra AI cost or
// latency. They are optional in the UI: a self-check against "passive
// listening", never a graded gate.
const QUESTIONS_SPEC = `"questions":[{"q":"comprehension question about MEANING (EN)","options":["3 short options (EN)","...","..."],"answer":0,"why":"short reason in Brazilian Portuguese quoting the line that proves it"}]`;
const QUESTIONS_RULES = `Also write exactly 3 comprehension questions ("questions"): about what HAPPENS/is MEANT in the dialogue (never about grammar or spelling), each with exactly 3 options, "answer" = index (0-2) of the correct one. Answerable only by someone who understood the dialogue.`;

function normalizeQuestions(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2)
    .slice(0, 3)
    .map((q) => ({
      q: String(q.q).trim(),
      options: q.options.slice(0, 3).map((o) => String(o).trim()),
      answer: Math.min(Math.max(Number(q.answer) || 0, 0), q.options.slice(0, 3).length - 1),
      why: String(q.why ?? '').trim(),
    }));
}

export async function generateDialogue(theme, level = 'B1') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content: 'You write natural English business dialogues. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Create a short natural English business dialogue for a ${L.inline} learner about "${theme}". Two speakers A and B, 8 to 12 short realistic lines.
${QUESTIONS_RULES}

Return ONLY this JSON:
{"title":"short English title","lines":[{"speaker":"A","en":"...","pt":"Brazilian Portuguese translation"}],${QUESTIONS_SPEC}}${L.block}`,
    },
  ];
  const j = await askJson(messages);
  const lines = Array.isArray(j.lines) ? j.lines : [];
  return {
    title: String(j.title ?? theme),
    lines: lines
      .filter((l) => l && l.en)
      .map((l) => ({
        speaker: l.speaker === 'B' ? 'B' : 'A',
        en: String(l.en).trim(),
        pt: String(l.pt ?? '').trim(),
      })),
    questions: normalizeQuestions(j.questions),
  };
}

// ── Conversation tutor ───────────────────────────────────────────────────────
// history: [{role:'user'|'assistant', content}] — the whole conversation so far.
export async function surpriseDialogue(level = 'B1') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content: 'You write natural English business dialogues. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Invent a fresh, interesting workplace scenario for a ${L.inline} English learner — vary it a lot (a negotiation, a daily stand-up, giving feedback, a client call, a job interview, small talk at the coffee machine, a project kickoff, handling a complaint, etc.). Then write the dialogue: two speakers A and B, 8 to 12 short realistic lines.

${QUESTIONS_RULES}

Return ONLY this JSON:
{"theme":"short theme label","title":"short English title","lines":[{"speaker":"A","en":"...","pt":"Brazilian Portuguese translation"}],${QUESTIONS_SPEC}}${L.block}`,
    },
  ];
  const j = await askJson(messages);
  const lines = Array.isArray(j.lines) ? j.lines : [];
  return {
    theme: String(j.theme ?? 'surprise'),
    title: String(j.title ?? 'Surprise'),
    lines: lines
      .filter((l) => l && l.en)
      .map((l) => ({
        speaker: l.speaker === 'B' ? 'B' : 'A',
        en: String(l.en).trim(),
        pt: String(l.pt ?? '').trim(),
      })),
    questions: normalizeQuestions(j.questions),
  };
}

// Analyze a spoken transcript (from a self-recording) and give feedback.
export async function analyzeSpeech(transcript, level = 'B1', prompt = '') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content:
        'You are a supportive but precise English speaking coach for a Brazilian learner. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `A ${L.inline} learner recorded themselves speaking${prompt ? ` about: "${prompt}"` : ''}. Below is the speech-to-text transcript of what they said (so punctuation may be missing — do NOT comment on pronunciation, accent or intonation, you can't hear it).

"""${transcript}"""

Give constructive feedback. Return ONLY this JSON (explanations in Brazilian Portuguese, example phrases in English):
{
  "comment": "one short encouraging overall note",
  "strengths": ["what they did well", "..."],
  "improvements": ["specific, actionable things to improve", "..."],
  "corrections": [{"original":"what they said (EN)","better":"more natural/correct (EN)","why":"short reason in PT","category":${ERROR_CATEGORIES}}],
  "score": 0
}
"score" is 0–100 for the content/clarity of what was said.${L.block}`,
    },
  ];
  const j = await askJson(messages);
  return {
    comment: String(j.comment ?? ''),
    strengths: Array.isArray(j.strengths) ? j.strengths.map(String) : [],
    improvements: Array.isArray(j.improvements) ? j.improvements.map(String) : [],
    corrections: Array.isArray(j.corrections) ? j.corrections : [],
    score: Number(j.score) || 0,
  };
}

// Fresh sentences for shadowing practice (not tied to the vocab queue).
export async function generateShadowing(level = 'B1', theme = '') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content: 'You create natural English sentences for shadowing (imitation) practice. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Generate 10 varied, natural English sentences a ${L.inline} professional would actually say at work${theme ? ` about "${theme}"` : ''}. Each 6–14 words, good spoken rhythm for shadowing. Vary the situations.

Return ONLY a JSON array: [{"en":"...","pt":"Brazilian Portuguese translation"}]${L.block}`,
    },
  ];
  const arr = await askJson(messages);
  return (Array.isArray(arr) ? arr : [])
    .filter((x) => x && x.en)
    .map((x) => ({ en: String(x.en).trim(), pt: String(x.pt ?? '').trim() }));
}

// ── Extensive reading ────────────────────────────────────────────────────────
export async function generateReading(level = 'B1', theme = '') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content:
        'You write engaging short texts for English learners (extensive reading). Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Write a short, genuinely interesting text for a ${L.inline} Brazilian professional${theme ? ` about "${theme}"` : ' about work, career or technology (pick something fresh)'}. 180-250 words, 3-4 paragraphs, natural modern English. It can be a story, an opinion piece or practical advice — extensive reading works when the reader WANTS to keep reading.

Return ONLY this JSON:
{"title":"short catchy title (EN)","text":"the full text with \\n\\n between paragraphs"}${L.block}`,
    },
  ];
  const j = await askJson(messages);
  const text = String(j.text ?? '').trim();
  if (!text) throw new Error('empty reading');
  return { title: String(j.title ?? (theme || 'Reading')), text };
}

// Word-in-context lookup (1-click dictionary for the reading tab).
export async function lookupWord(word, sentence) {
  const out = await chat([
    {
      role: 'system',
      content:
        'You are a dictionary for Brazilian learners of English. Given a word and the sentence it appears in, answer with ONLY the Brazilian Portuguese meaning OF THE WORD AS USED IN THAT SENTENCE — 2 to 6 words, no notes, no quotes.',
    },
    { role: 'user', content: `Word: "${word}"\nSentence: "${sentence}"` },
  ]);
  return String(out).trim().replace(/^["']|["']$/g, '');
}

// ── Roleplay with objective (Fases 2-3 do plano) ─────────────────────────────
export async function roleplayScenario(level = 'B1', theme = '') {
  const L = lv(level);
  const messages = [
    {
      role: 'system',
      content:
        'You design workplace roleplay exercises for English learners. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Create a workplace roleplay scenario for a ${L.inline} Brazilian learner${theme ? ` about "${theme}"` : ''}. The learner plays themselves; the AI plays the other character. Give the learner a CONCRETE objective to achieve through conversation (negotiate a deadline, convince a manager, handle an unhappy client, ask for a raise...). Vary the situations.

Return ONLY this JSON:
{"title":"short title (EN)","scenario":"2-3 sentence setup in Brazilian Portuguese","ai_role":"who the AI plays (EN, short)","objective":"the learner's goal in Brazilian Portuguese, specific and checkable","opening":"the AI character's first line (EN, natural spoken)"}${L.block}`,
    },
  ];
  const j = await askJson(messages);
  return {
    title: String(j.title ?? 'Roleplay'),
    scenario: String(j.scenario ?? ''),
    ai_role: String(j.ai_role ?? 'a colleague'),
    objective: String(j.objective ?? ''),
    opening: String(j.opening ?? 'Hi! Do you have a minute?'),
  };
}

export async function roleplayTurn(history, { level = 'B1', scenario } = {}) {
  const L = lv(level);
  const system = `You are playing a character in a workplace roleplay with a ${L.inline} Brazilian English learner.
Roleplay: ${scenario?.title ?? ''} — you play: ${scenario?.ai_role ?? 'a colleague'}. The learner's objective: ${scenario?.objective ?? ''}.
Rules for every reply:
- Stay firmly in character; natural spoken English, at most 2 short sentences per turn (real dialogue is brief — the learner should talk more than you).
- Do NOT correct the learner's English during the roleplay — corrections come in the final evaluation. Keep the conversation moving instead.
- Offer realistic resistance: the learner must WORK for the objective (push back once or twice before conceding, ask for justification).
- Never break character, never output JSON.${L.block}`;
  const reply = await chat([{ role: 'system', content: system }, ...history]);
  return { reply: String(reply ?? '').trim() };
}

export async function roleplayEvaluate(history, { level = 'B1', scenario } = {}) {
  const L = lv(level);
  const convo = history
    .map((m) => `${m.role === 'user' ? 'LEARNER' : 'CHARACTER'}: ${m.content}`)
    .join('\n');
  const messages = [
    {
      role: 'system',
      content:
        'You are an English teacher evaluating a workplace roleplay. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `A ${L.inline} Brazilian learner did this roleplay.
Objective: ${scenario?.objective ?? ''}
Conversation:
"""
${convo}
"""
Evaluate: did the learner achieve the objective? How effective and natural was their English? Be encouraging but honest.

Return ONLY this JSON (comments in Brazilian Portuguese, phrases in English):
{"achieved":true,"score":0,"feedback":"3-4 sentence assessment in PT-BR","better_phrases":[{"original":"what they said","better":"a more effective/natural version","why":"short reason in PT-BR","category":${ERROR_CATEGORIES}}]}
"score" is 0-100 (objective + communication quality).${L.block}`,
    },
  ];
  const j = await askJson(messages);
  return {
    achieved: !!j.achieved,
    score: Number(j.score) || 0,
    feedback: String(j.feedback ?? ''),
    better_phrases: Array.isArray(j.better_phrases) ? j.better_phrases : [],
  };
}

// Translate a single phrase to Brazilian Portuguese (for YouTube saves).
export async function translatePhrase(en) {
  const out = await chat([
    {
      role: 'system',
      content:
        'You translate English to natural Brazilian Portuguese. Answer with ONLY the translation — no quotes, no notes.',
    },
    { role: 'user', content: String(en) },
  ]);
  return String(out).trim().replace(/^["']|["']$/g, '');
}

export async function tutorReply(history, { level = 'B1', focus = '', recurring = [] } = {}) {
  const L = lv(level);
  const recurringNote = recurring.length
    ? `\n- This learner's recurring weak spots: ${recurring.join(', ')}. Watch for those specifically.`
    : '';
  const system = `You are Alex, a friendly and patient English conversation tutor talking with a ${L.inline} Brazilian learner who wants to improve spoken English for work${focus ? ` (today's focus: ${focus})` : ''}.
Rules for every reply:
- BREVITY IS CRITICAL: at most 2 short sentences + 1 short follow-up question (under ~30 words total). Real spoken turns are short — the learner should talk more than you.
- Never lecture, never list, never give more than one idea per turn.
- Speak natural English.
- If the learner makes a notable mistake, gently correct it in ONE brief aside (a few words), then continue.${recurringNote}
- Always end with a follow-up question to keep them talking.
- Never output JSON or break character.${L.block}`;

  const messages = [{ role: 'system', content: system }, ...history];
  const reply = await chat(messages);
  return { reply: String(reply ?? '').trim() };
}
