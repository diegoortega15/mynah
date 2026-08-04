import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useSpeech, similarity } from '../../useSpeech.js';
import type { User, ShadowItem } from '../../types';

// Auto-stop: end the capture after this much silence following some speech.
// Long sentences have natural mid-clause pauses — 2s tolerates them; the old
// one-shot recognizer cut the mic on the FIRST pause, truncating long phrases.
const SILENCE_MS = 2000;
const MAX_CAPTURE_MS = 30000;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FALLBACK = [
  { en: 'Let me circle back on that after the meeting.', pt: 'Deixa eu voltar a esse assunto depois da reunião.' },
  { en: 'I just wanted to give you a heads-up about the schedule.', pt: 'Só queria te dar um aviso sobre o cronograma.' },
  { en: 'Could you bring me up to speed on what we discussed?', pt: 'Você poderia me atualizar sobre o que discutimos?' },
  { en: 'I think we should take this offline and discuss it later.', pt: 'Acho que devíamos tratar disso em separado e discutir depois.' },
];

export default function Shadowing({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const { playOne, stop, isPlaying, startDictation, stopDictation, sttSupported } = useSpeech();
  const [targets, setTargets] = useState<ShadowItem[]>([]);
  const [i, setI] = useState(0);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [result, setResult] = useState<{ transcript: string; score: number } | null>(null);
  const [err, setErr] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChangeRef = useRef(0);
  const gotSpeechRef = useRef(false);
  const finishingRef = useRef(false);

  // Leaving the screen mid-capture: close the mic and the watcher.
  useEffect(
    () => () => {
      if (watchRef.current) clearInterval(watchRef.current);
      stopDictation();
      stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function generateNew() {
    setGenBusy(true);
    setErr('');
    stop();
    try {
      const { items } = await api.shadowingGenerate(user.id);
      if (items?.length) {
        setTargets(items);
        setI(0);
        setResult(null);
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setGenBusy(false);
    }
  }

  useEffect(() => {
    api
      .getReview(user.id)
      .then((cards) => {
        const t = cards.map((c) => ({ en: c.text_en, pt: c.translation_pt }));
        setTargets(t.length ? t.slice(0, 20) : FALLBACK);
      })
      .catch(() => setTargets(FALLBACK));
  }, [user.id]);

  const target = targets[i];

  // Navigate to another phrase. Audio NEVER plays on its own — it only fires
  // when the user presses "🔊 Ouvir".
  function go(delta: number) {
    const ni = i + delta;
    if (ni < 0 || ni >= targets.length) return;
    stop();
    setI(ni);
    setResult(null);
    setErr('');
  }

  // Capture with the CONTINUOUS recognizer (survives mid-sentence pauses) and
  // auto-stop after SILENCE_MS without new speech — the mic stays open for the
  // whole phrase, however long it is. "✔ Corrigir" forces an early finish.
  function record() {
    if (!sttSupported || !target || listening) return;
    stop(); // never let the TTS voice bleed into the microphone
    setErr('');
    setResult(null);
    setLiveText('');
    gotSpeechRef.current = false;
    finishingRef.current = false;
    lastChangeRef.current = Date.now();
    try {
      startDictation({
        onInterim: (t) => {
          setLiveText(t);
          if (t.trim()) {
            gotSpeechRef.current = true;
            lastChangeRef.current = Date.now();
          }
        },
        onError: (m) => {
          setErr(m);
          void finishCapture(true);
        },
      });
    } catch (e) {
      setErr(errMsg(e));
      return;
    }
    setListening(true);
    const startedAt = Date.now();
    watchRef.current = setInterval(() => {
      const silent = Date.now() - lastChangeRef.current;
      const total = Date.now() - startedAt;
      if ((gotSpeechRef.current && silent >= SILENCE_MS) || total >= MAX_CAPTURE_MS) {
        void finishCapture(false);
      }
    }, 250);
  }

  async function finishCapture(aborted: boolean) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (watchRef.current) clearInterval(watchRef.current);
    setListening(false);
    const transcript = (await stopDictation()).trim();
    setLiveText('');
    if (aborted) return;
    if (!transcript) {
      setErr('Não ouvi nada — tente de novo.');
      return;
    }
    if (!target) return;
    const score = similarity(target.en, transcript);
    setResult({ transcript, score });
    api.logSpeaking(user.id, { mode: 'shadow', target: target.en, transcript, score }).catch(() => {});
    onPractice?.();
  }

  if (!target) return <p className="muted">Carregando frases…</p>;

  return (
    <section className="card shadow">
      <div className="row between">
        <span className="muted small">Ouça, repita imitando o ritmo, e grave.</span>
        <button className="ghost mini" onClick={generateNew} disabled={genBusy}>
          {genBusy ? 'Gerando…' : '🎲 Novas frases'}
        </button>
      </div>
      <p className="target" lang="en">{target.en}</p>
      {target.pt && <p className="target-pt muted">{target.pt}</p>}
      <div className="row center-row">
        {isPlaying ? (
          <button className="ghost" aria-label="Parar o áudio" onClick={stop}>⏹ Parar</button>
        ) : (
          <button
            className="ghost"
            aria-label="Ouvir a frase"
            disabled={listening}
            onClick={() => playOne(target.en)}
          >
            🔊 Ouvir
          </button>
        )}
        {listening ? (
          <button className="primary rec" onClick={() => void finishCapture(false)}>
            ✔ Corrigir agora
          </button>
        ) : (
          <button className="primary" onClick={record}>🎤 Falar</button>
        )}
      </div>
      {listening && (
        <p className="live-tx small" lang="en">
          <span className="rec-dot" /> {liveText || 'Ouvindo… fale a frase inteira — paro sozinho quando você terminar.'}
        </p>
      )}
      {err && <p className="error small">{err}</p>}
      {result && (
        <div className="score-box">
          <div className={`score ${result.score >= 80 ? 'good' : result.score >= 50 ? 'mid' : 'low'}`}>
            {result.score}%
          </div>
          <p className="muted small">Você disse: “{result.transcript}”</p>
        </div>
      )}
      <div className="row between nav">
        <button className="ghost" disabled={i === 0 || listening} onClick={() => go(-1)}>← Anterior</button>
        <span className="muted small">{i + 1}/{targets.length}</span>
        <button className="ghost" disabled={i >= targets.length - 1 || listening} onClick={() => go(1)}>Próxima →</button>
      </div>
    </section>
  );
}
