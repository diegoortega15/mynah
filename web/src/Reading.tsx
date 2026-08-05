import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useSpeech } from './useSpeech.js';
import HelpTip from './HelpTip.jsx';
import ComprehensionQuiz from './ComprehensionQuiz.jsx';
import type { User, Reading as ReadingEntry, ComprehensionQuestion } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const THEMES = [
  'Carreira em tecnologia',
  'Trabalho remoto',
  'Produtividade',
  'Liderança',
  'Uma história curta',
];

interface Lookup {
  word: string;
  sentence: string;
  pt: string | null; // null = loading
  saved: boolean | 'saving';
}

// Extensive reading (LingQ-style): AI text at the learner's dynamic level,
// 1-click word lookup in context, and sentence mining straight to the deck.
export default function Reading({ user }: { user: User }) {
  const { speakLines, playOne, stop, pause, resume, isPlaying, paused, ttsSupported } = useSpeech();
  const [current, setCurrent] = useState<{
    title: string;
    text: string;
    id?: number;
    questions?: ComprehensionQuestion[];
    cefr?: string | null; // level it was written at, for the comprehension evidence
  } | null>(null);
  const [saved, setSaved] = useState<ReadingEntry[]>([]);
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [qBusy, setQBusy] = useState(false);
  const lookupCache = useState(() => new Map<string, string>())[0];

  // Silence the narration when leaving the tab.
  useEffect(
    () => () => stop(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Sentences of the current text, as lines for the playback queue (gives us
  // the same pause/resume/stop controls as the Listening tab).
  const textLines = current
    ? (current.text.match(/[^.!?]+[.!?]*\s*/g) ?? [current.text]).map((s) => ({ en: s.trim() }))
    : [];

  const loadSaved = useCallback(async () => {
    try {
      setSaved(await api.listReadings(user.id));
    } catch {
      /* lista opcional */
    }
  }, [user.id]);
  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  async function generate(t?: string) {
    const th = (t ?? theme).trim();
    setBusy(true);
    setErr('');
    setLookup(null);
    stop();
    try {
      const r = await api.generateReading(user.id, th || undefined);
      setCurrent({ title: r.title, text: r.text, id: r.id, questions: r.questions, cefr: r.cefr });
      setTheme('');
      loadSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function onWord(rawWord: string, sentence: string) {
    const word = rawWord.replace(/[^A-Za-z'-]/g, '');
    if (!word) return;
    // Same word clicked again while its lookup is in flight → ignore (no double AI call).
    if (lookup && lookup.pt === null && lookup.word === word && lookup.sentence === sentence) return;
    const key = `${word}::${sentence}`;
    const cached = lookupCache.get(key);
    setLookup({ word, sentence, pt: cached ?? null, saved: false });
    if (cached) return;
    try {
      const { pt } = await api.lookup(user.id, word, sentence);
      lookupCache.set(key, pt);
      // Only update if the user hasn't clicked another word meanwhile.
      setLookup((l) => (l && l.word === word && l.sentence === sentence ? { ...l, pt } : l));
    } catch (e) {
      setErr(errMsg(e));
      setLookup(null);
    }
  }

  async function saveSentence() {
    if (!lookup || lookup.saved) return; // saved or in flight
    setLookup((l) => (l ? { ...l, saved: 'saving' } : l));
    try {
      await api.savePhrase(user.id, {
        en: lookup.sentence,
        context: current ? `Leitura: ${current.title}` : 'Leitura',
      });
      setLookup((l) => (l ? { ...l, saved: true } : l));
    } catch (e) {
      setErr(errMsg(e));
      setLookup((l) => (l ? { ...l, saved: false } : l));
    }
  }

  // Render a sentence as clickable word tokens.
  const renderSentence = (s: string, si: number) => {
    const parts = s.split(/(\s+)/);
    return (
      <span key={si}>
        {parts.map((p, i) =>
          /\S/.test(p) ? (
            <button key={i} className="rw" onClick={() => onWord(p, s.trim())}>
              {p}
            </button>
          ) : (
            p
          )
        )}
      </span>
    );
  };

  const renderParagraph = (para: string, pi: number) => {
    // Sentence split (good enough for generated text).
    const sentences = para.match(/[^.!?]+[.!?]*\s*/g) ?? [para];
    return (
      <p key={pi} lang="en" className="reading-p">
        {sentences.map((s, si) => renderSentence(s, si))}
      </p>
    );
  };

  return (
    <div className="reading">
      <h1>📖 Ler <HelpTip topic="reading" /></h1>
      <p className="muted small">
        Leitura extensiva no seu nível: toque em qualquer palavra para ver o significado{' '}
        <em>naquela frase</em> e salve a frase como card. (Atividade extra — não conta bloco do
        dia.)
      </p>

      <section className="card">
        <h2>Gerar um texto</h2>
        <div className="row gen">
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Tema (ex: inteligência artificial, viagens…)"
            onKeyDown={(e) => e.key === 'Enter' && generate()}
          />
          <button className="primary" onClick={() => generate()} disabled={busy || !theme.trim()}>
            {busy ? 'Escrevendo…' : 'Gerar'}
          </button>
        </div>
        <div className="chips">
          <button className="chip surprise" disabled={busy} onClick={() => generate('')}>
            {busy ? 'Escrevendo…' : '🎲 Surpreenda-me'}
          </button>
          {THEMES.map((t) => (
            <button key={t} className="chip" disabled={busy} onClick={() => generate(t)}>
              {t}
            </button>
          ))}
        </div>
        {err && <p className="error small">{err}</p>}
      </section>

      {current && (
        <section className="card">
          <div className="row between">
            <h2>{current.title}</h2>
            {ttsSupported && (
              <div className="row">
                {!isPlaying ? (
                  <button className="ghost" title="Ouvir o texto" onClick={() => speakLines(textLines)}>
                    ▶ Ouvir tudo
                  </button>
                ) : (
                  <>
                    <button className="ghost" onClick={paused ? resume : pause}>
                      {paused ? '▶ Retomar' : '⏸ Pausar'}
                    </button>
                    <button className="danger-btn" onClick={stop}>⏹ Parar</button>
                  </>
                )}
              </div>
            )}
          </div>
          {current.text.split(/\n{2,}/).map((p, i) => renderParagraph(p, i))}

          {current.questions && current.questions.length > 0 ? (
            <ComprehensionQuiz
              key={current.title}
              questions={current.questions}
              kind="texto"
              userId={user.id}
              source="reading"
              sourceId={current.id}
              cefr={current.cefr}
            />
          ) : (
            current.id !== undefined && (
              // Reading created before the feature: generate on demand.
              <div className="row end" style={{ marginTop: 12 }}>
                <button
                  className="ghost mini"
                  disabled={qBusy}
                  onClick={async () => {
                    if (qBusy || current.id === undefined) return;
                    setQBusy(true);
                    try {
                      const { questions } = await api.readingQuestions(current.id, user.id);
                      setCurrent((c) => (c ? { ...c, questions } : c));
                      loadSaved();
                    } catch (e) {
                      setErr(errMsg(e));
                    } finally {
                      setQBusy(false);
                    }
                  }}
                >
                  {qBusy ? 'Criando perguntas…' : '✅ Gerar perguntas de compreensão'}
                </button>
              </div>
            )
          )}

          {lookup && (
            <div className="lookup-card">
              <div className="row between">
                <strong lang="en">{lookup.word}</strong>
                <span className="lookup-pt">{lookup.pt ?? 'traduzindo…'}</span>
              </div>
              <p className="muted small" lang="en">“{lookup.sentence}”</p>
              <div className="row end">
                {ttsSupported && (
                  <button className="ghost mini" onClick={() => playOne(lookup.sentence)}>🔊 frase</button>
                )}
                <button className="ghost mini" disabled={!!lookup.saved} onClick={saveSentence}>
                  {lookup.saved === true ? '✓ salvo' : lookup.saved === 'saving' ? '…' : '+ card (frase)'}
                </button>
                <button className="ghost mini" onClick={() => setLookup(null)}>✕</button>
              </div>
            </div>
          )}
        </section>
      )}

      {saved.length > 0 && (
        <section className="card">
          <h2>Leituras anteriores</h2>
          <ul className="deck-list">
            {saved.map((r) => (
              <li key={r.id}>
                <button
                  className="linklike"
                  onClick={() => {
                    stop();
                    setLookup(null);
                    setCurrent({ title: r.title, text: r.text_en, id: r.id, questions: r.questions, cefr: r.cefr });
                  }}
                >
                  {r.title}
                </button>
                {confirmDel === r.id ? (
                  <span className="row" style={{ gap: 8 }}>
                    <button className="ghost mini" onClick={() => setConfirmDel(null)}>✕</button>
                    <button
                      className="danger-btn mini"
                      disabled={delBusy}
                      onClick={async () => {
                        if (delBusy) return;
                        setDelBusy(true);
                        setConfirmDel(null);
                        await api.deleteReading(r.id, user.id).catch(() => {});
                        await loadSaved();
                        setDelBusy(false);
                      }}
                    >{delBusy ? '…' : 'Excluir?'}</button>
                  </span>
                ) : (
                  <button className="ghost mini del" title="Excluir" onClick={() => setConfirmDel(r.id)}>
                    🗑
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
