// Chrome's built-in Translator API (Chromium 138+): on-device, free, offline
// after a one-off language-pack download.
//
// Used ONLY as a safety net for when the AI is unreachable. Compared side by
// side against Claude on a real TED transcript, it writes fluent Portuguese but
// is context-blind: "paper" (an essay) became "papel" on one line and "jornal"
// on the next, habitual "would" turned into the conditional, and a chunk that
// starts mid-sentence came out as a subjunctive wish. Fluent-but-wrong is worse
// than clumsy for a learner who cannot spot the error — so this never replaces
// the AI, it only fills the gap when there would otherwise be nothing.

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}
type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
interface TranslatorStatic {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }): Promise<TranslatorInstance>;
}
declare global {
  interface Window {
    Translator?: TranslatorStatic;
  }
}

// Every call is raced against a deadline: watching this API from an embedded
// browser, both availability() and create() hung forever with no error. A
// fallback that freezes the UI is worse than no fallback.
const CREATE_MS = 20000;
const LINE_MS = 5000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export const localTranslateSupported = () => typeof window.Translator !== 'undefined';

let pending: Promise<TranslatorInstance | null> | null = null;

/** One shared translator per session (creating it may download a language pack). */
function getTranslator(): Promise<TranslatorInstance | null> {
  if (!localTranslateSupported()) return Promise.resolve(null);
  if (!pending) {
    pending = withTimeout(
      window.Translator!.create({ sourceLanguage: 'en', targetLanguage: 'pt' }),
      CREATE_MS
    ).then((t) => {
      if (!t) pending = null; // failed or timed out — let a later attempt retry
      return t;
    });
  }
  return pending;
}

/**
 * Translate on-device. Returns an array aligned with `texts`, null where it
 * could not translate. Never throws and never hangs.
 */
export async function translateLocally(texts: string[]): Promise<(string | null)[]> {
  const t = await getTranslator();
  if (!t) return texts.map(() => null);
  const out: (string | null)[] = [];
  for (const text of texts) {
    const pt = await withTimeout(t.translate(text), LINE_MS);
    out.push(pt && pt.trim() ? pt.trim() : null);
  }
  return out;
}
