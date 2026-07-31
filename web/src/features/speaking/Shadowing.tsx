import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useSpeech, similarity } from '../../useSpeech.js';
import type { User, ShadowItem } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const FALLBACK = [
  { en: 'Let me circle back on that after the meeting.', pt: 'Deixa eu voltar a esse assunto depois da reunião.' },
  { en: 'I just wanted to give you a heads-up about the schedule.', pt: 'Só queria te dar um aviso sobre o cronograma.' },
  { en: 'Could you bring me up to speed on what we discussed?', pt: 'Você poderia me atualizar sobre o que discutimos?' },
  { en: 'I think we should take this offline and discuss it later.', pt: 'Acho que devíamos tratar disso em separado e discutir depois.' },
];

export default function Shadowing({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const { speak, listen, sttSupported } = useSpeech();
  const [targets, setTargets] = useState<ShadowItem[]>([]);
  const [i, setI] = useState(0);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<{ transcript: string; score: number } | null>(null);
  const [err, setErr] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  async function generateNew() {
    setGenBusy(true);
    setErr('');
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

  // Navigate to another phrase and auto-play it. On initial open nothing plays —
  // the user starts the first one with the "🔊 Ouvir" button.
  function go(delta: number) {
    const ni = i + delta;
    if (ni < 0 || ni >= targets.length) return;
    setI(ni);
    setResult(null);
    setErr('');
    speak(targets[ni].en);
  }

  async function record() {
    if (!sttSupported || !target) return;
    setErr('');
    setResult(null);
    setListening(true);
    try {
      const transcript = await listen();
      const score = similarity(target.en, transcript);
      setResult({ transcript, score });
      api.logSpeaking(user.id, { mode: 'shadow', target: target.en, transcript, score }).catch(() => {});
      onPractice?.();
    } catch (e) {
      const m = errMsg(e);
      setErr(m === 'no-speech' ? 'Não ouvi nada — tente de novo.' : m);
    } finally {
      setListening(false);
    }
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
        <button className="ghost" aria-label="Ouvir a frase" onClick={() => speak(target.en)}>🔊 Ouvir</button>
        <button className={`primary ${listening ? 'rec' : ''}`} onClick={record} disabled={listening}>
          {listening ? '🎤 Ouvindo…' : '🎤 Falar'}
        </button>
      </div>
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
        <button className="ghost" disabled={i === 0} onClick={() => go(-1)}>← Anterior</button>
        <span className="muted small">{i + 1}/{targets.length}</span>
        <button className="ghost" disabled={i >= targets.length - 1} onClick={() => go(1)}>Próxima →</button>
      </div>
    </section>
  );
}
