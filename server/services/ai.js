import { getConfig } from '../config.js';
import * as claudeCli from './providers/claudeCli.js';
import * as codexCli from './providers/codexCli.js';
import * as geminiCli from './providers/geminiCli.js';
import * as openai from './providers/openai.js';
import * as gemini from './providers/gemini.js';
import * as ollama from './providers/ollama.js';

// Route a chat request to the configured provider. messages: [{role, content}].
export async function chat(messages) {
  const c = getConfig();
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

// ── Vocabulary pack ──────────────────────────────────────────────────────────
export async function generatePack(theme, level = 'Intermediário', count = 10) {
  const messages = [
    {
      role: 'system',
      content:
        'You are a business English tutor. Always answer with raw JSON only, no markdown fences, no comments.',
    },
    {
      role: 'user',
      content: `Generate ${count} genuinely useful English phrases or collocations about the theme "${theme}" for a ${level} Brazilian professional (meetings, emails, presentations, interviews).

Rules:
- Each item is a whole phrase or collocation IN CONTEXT, never a single isolated word.
- "pt" = natural Brazilian Portuguese translation.
- "context" = one short natural English example sentence used at work.

Return ONLY a JSON array: [{"en":"...","pt":"...","context":"..."}]`,
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
export async function correctWriting(text, level = 'Intermediário') {
  const messages = [
    {
      role: 'system',
      content:
        'You are an encouraging but precise English writing tutor. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Correct the text from a ${level} Brazilian professional (grammar, word choice, naturalness).

Return ONLY this JSON:
{
  "corrected": "full text with mistakes fixed, minimal changes",
  "errors": [{"original":"wrong bit","correction":"fixed bit","explanation":"short why, in Brazilian Portuguese"}],
  "rewrite": "a more natural, professional native-sounding version",
  "comment": "one short encouraging note in Brazilian Portuguese"
}
If there are no real errors, return an empty "errors" array.

Text:
"""${text}"""`,
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
export async function generateDialogue(theme, level = 'Intermediário') {
  const messages = [
    {
      role: 'system',
      content: 'You write natural English business dialogues. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Create a short natural English business dialogue for a ${level} learner about "${theme}". Two speakers A and B, 8 to 12 short realistic lines.

Return ONLY this JSON:
{"title":"short English title","lines":[{"speaker":"A","en":"...","pt":"Brazilian Portuguese translation"}]}`,
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
  };
}

// ── Conversation tutor ───────────────────────────────────────────────────────
// history: [{role:'user'|'assistant', content}] — the whole conversation so far.
export async function surpriseDialogue(level = 'Intermediário') {
  const messages = [
    {
      role: 'system',
      content: 'You write natural English business dialogues. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Invent a fresh, interesting workplace scenario for a ${level} English learner — vary it a lot (a negotiation, a daily stand-up, giving feedback, a client call, a job interview, small talk at the coffee machine, a project kickoff, handling a complaint, etc.). Then write the dialogue: two speakers A and B, 8 to 12 short realistic lines.

Return ONLY this JSON:
{"theme":"short theme label","title":"short English title","lines":[{"speaker":"A","en":"...","pt":"Brazilian Portuguese translation"}]}`,
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
  };
}

// Analyze a spoken transcript (from a self-recording) and give feedback.
export async function analyzeSpeech(transcript, level = 'Intermediário', prompt = '') {
  const messages = [
    {
      role: 'system',
      content:
        'You are a supportive but precise English speaking coach for a Brazilian learner. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `A ${level} learner recorded themselves speaking${prompt ? ` about: "${prompt}"` : ''}. Below is the speech-to-text transcript of what they said (so punctuation may be missing — do NOT comment on pronunciation, accent or intonation, you can't hear it).

"""${transcript}"""

Give constructive feedback. Return ONLY this JSON (explanations in Brazilian Portuguese, example phrases in English):
{
  "comment": "one short encouraging overall note",
  "strengths": ["what they did well", "..."],
  "improvements": ["specific, actionable things to improve", "..."],
  "corrections": [{"original":"what they said (EN)","better":"more natural/correct (EN)","why":"short reason in PT"}],
  "score": 0
}
"score" is 0–100 for the content/clarity of what was said.`,
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
export async function generateShadowing(level = 'Intermediário', theme = '') {
  const messages = [
    {
      role: 'system',
      content: 'You create natural English sentences for shadowing (imitation) practice. Always answer with raw JSON only, no markdown.',
    },
    {
      role: 'user',
      content: `Generate 10 varied, natural English sentences a ${level} professional would actually say at work${theme ? ` about "${theme}"` : ''}. Each 6–14 words, good spoken rhythm for shadowing. Vary the situations.

Return ONLY a JSON array: [{"en":"...","pt":"Brazilian Portuguese translation"}]`,
    },
  ];
  const arr = await askJson(messages);
  return (Array.isArray(arr) ? arr : [])
    .filter((x) => x && x.en)
    .map((x) => ({ en: String(x.en).trim(), pt: String(x.pt ?? '').trim() }));
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

export async function tutorReply(history, { level = 'Intermediário', focus = '' } = {}) {
  const system = `You are Alex, a friendly and patient English conversation tutor talking with a ${level} Brazilian learner who wants to improve spoken English for work${focus ? ` (today's focus: ${focus})` : ''}.
Rules for every reply:
- Keep it SHORT and spoken (1-3 sentences), like a real conversation.
- Speak natural English.
- If the learner makes a notable mistake, gently correct it in one brief aside, then continue.
- Always end with a follow-up question to keep them talking.
- Never output JSON or break character.`;

  const messages = [{ role: 'system', content: system }, ...history];
  const reply = await chat(messages);
  return { reply: String(reply ?? '').trim() };
}
