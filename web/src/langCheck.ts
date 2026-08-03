// Cheap local language check for the ENGLISH-production inputs (writing, tutor,
// roleplay). Goal: catch the common case of typing/dictating Portuguese where
// English is expected — instant, offline, no AI call. Errs on the side of NOT
// flagging (better to let an ambiguous text through than to block English).

const PT_WORDS = new Set([
  'que', 'não', 'nao', 'com', 'para', 'uma', 'você', 'voce', 'está', 'esta', 'mais', 'isso',
  'muito', 'também', 'tambem', 'mas', 'como', 'por', 'dos', 'das', 'ele', 'ela', 'seu', 'sua',
  'meu', 'minha', 'fazer', 'trabalho', 'hoje', 'dia', 'bom', 'boa', 'obrigado', 'obrigada',
  'sim', 'porque', 'quando', 'onde', 'tenho', 'sobre', 'ser', 'foi', 'são', 'sao', 'estou',
  'vou', 'quero', 'pode', 'tudo', 'bem', 'já', 'ja', 'ainda', 'depois', 'antes', 'então',
  'entao', 'gente', 'coisa', 'ontem', 'amanhã', 'amanha', 'semana', 'preciso', 'reunião',
]);

const EN_WORDS = new Set([
  'the', 'i', 'you', 'to', 'a', 'is', 'it', 'that', 'of', 'and', 'in', 'was', 'my', 'for',
  'on', 'with', 'at', 'this', 'have', 'be', 'are', 'we', 'they', 'he', 'she', 'do', 'not',
  'but', 'so', 'what', 'about', 'can', 'will', 'would', 'like', 'work', 'today', 'were',
  'been', 'there', 'your', 'me', 'am', 'good', 'day', 'yes', 'no', 'when', 'how', 'want',
]);

// True when the text looks like Portuguese rather than English.
export function looksPortuguese(text: string): boolean {
  const t = String(text).toLowerCase();
  // Accented vowels/ç never appear in English words — strong signal.
  if (/[ãõçâêôáàéíóúü]/.test(t)) return true;
  const words = t.replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return false; // too short to judge
  let pt = 0;
  let en = 0;
  for (const w of words) {
    if (PT_WORDS.has(w)) pt++;
    if (EN_WORDS.has(w)) en++;
  }
  return pt >= 2 && pt > en;
}
