import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useSpeech } from '../../useSpeech.js';
import type { User } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 4/3/2 technique (Maurice/Nation): tell the SAME story three times with less
// time each round. The repetition automatizes chunks; the shrinking clock
// forces fluency — with transfer to new topics. Classic is 4/3/2 minutes;
// 60/45/30s fits a 1-hour daily plan.
const ROUNDS = [60, 45, 30];

const TOPICS = [
  'Um projeto que você entregou recentemente (objetivo, seu papel, resultado)',
  'Como foi seu dia de trabalho ontem, do começo ao fim',
  'Um problema difícil que você resolveu e como',
  'Seus planos profissionais para os próximos 6 meses',
  'Explique seu trabalho para alguém de fora da área',
  'Uma ferramenta que você usa todo dia e por que gosta dela',
];

interface RoundResult {
  seconds: number;
  transcript: string;
  words: number;
  wpm: number;
}

export default function FourThreeTwo({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const { startDictation, stopDictation, sttSupported } = useSpeech();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [round, setRound] = useState(-1); // -1 idle · 0..2 current round · 3 finished
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [liveText, setLiveText] = useState('');
  const [err, setErr] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);

  useEffect(
    () => () => {
      clearInterval(timerRef.current ?? undefined);
      stopDictation();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function reset() {
    clearInterval(timerRef.current ?? undefined);
    setRound(-1);
    setRunning(false);
    setResults([]);
    setErr('');
  }

  function startRound(idx: number) {
    if (running) return; // double-tap guard
    setErr('');
    finishingRef.current = false;
    const secs = ROUNDS[idx];
    setRound(idx);
    setRunning(true);
    setRemaining(secs);
    setLiveText('');
    try {
      // onInterim shows the live transcript — visible proof that it's recording.
      startDictation({
        onInterim: setLiveText,
        onError: (m) => {
          // Mic blocked → abort the round (don't run an empty countdown);
          // the round button stays armed for a retry after fixing the mic.
          setErr(m);
          clearInterval(timerRef.current ?? undefined);
          setRunning(false);
        },
      });
    } catch (e) {
      setErr(errMsg(e));
      setRunning(false);
      return;
    }
    const endsAt = Date.now() + secs * 1000;
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !finishingRef.current) {
        finishingRef.current = true;
        clearInterval(timerRef.current ?? undefined);
        void finishRound(idx, secs);
      }
    }, 250);
  }

  async function finishRound(idx: number, secs: number) {
    setRunning(false);
    let transcript = '';
    try {
      transcript = await stopDictation();
    } catch {
      /* sem transcrição — segue com vazio */
    }
    const words = transcript.split(/\s+/).filter(Boolean).length;
    const wpm = Math.round((words / secs) * 60);
    setResults((rs) => [...rs, { seconds: secs, transcript, words, wpm }]);

    if (idx === ROUNDS.length - 1) {
      setRound(3);
      // One practice done (counts once, at the end of the 3 rounds).
      api.logSpeaking(user.id, { mode: '432', target: topic, transcript, score: wpm }).catch(() => {});
      onPractice?.();
    } else {
      setRound(idx + 1); // armed for the next round (user starts when ready)
    }
  }

  const fmtClock = (s: number) => `0:${String(s).padStart(2, '0')}`;

  return (
    <section className="card">
      <h2>4·3·2 — a mesma história, 3 vezes</h2>
      <p className="muted small">
        Conte a <strong>mesma história</strong> três vezes: {ROUNDS.map((r) => `${r}s`).join(' → ')}.
        Repetir com menos tempo automatiza as frases e destrava a fluência — técnica clássica de
        sala de aula (4/3/2), aqui em versão compacta.
      </p>

      {round === -1 && (
        <>
          <span className="field-label" id="ftt-topic">Tema</span>
          <div className="chips" role="group" aria-labelledby="ftt-topic">
            {TOPICS.map((t) => (
              <button
                key={t}
                className={`chip ${topic === t ? 'sel' : ''}`}
                onClick={() => setTopic(t)}
              >
                {t.length > 42 ? t.slice(0, 40) + '…' : t}
              </button>
            ))}
          </div>
          <p className="rec-prompt">🎯 {topic}</p>
          {!sttSupported && (
            <p className="error small">
              Este modo precisa do reconhecimento de voz (Chrome/Edge).
            </p>
          )}
          <button className="primary" disabled={!sttSupported} onClick={() => startRound(0)}>
            🎤 Começar rodada 1 ({ROUNDS[0]}s)
          </button>
        </>
      )}

      {round >= 0 && round < 3 && (
        <>
          <p className="rec-prompt">🎯 {topic}</p>
          {running ? (
            <div className="ftt-live">
              <span className="rec-pill">
                <span className="rec-dot" /> GRAVANDO — rodada {round + 1}/3
              </span>
              <div className={`ftt-clock ${remaining <= 10 ? 'low' : ''}`}>{fmtClock(remaining)}</div>
              <p className="muted small">Fale sem parar até o tempo acabar.</p>
              <p className="live-tx small" lang="en">
                📝 {liveText || 'Capturando sua fala…'}
              </p>
            </div>
          ) : (
            <div className="row center-row">
              <button className="primary" onClick={() => startRound(round)}>
                🎤 Rodada {round + 1} ({ROUNDS[round]}s) — mesma história, mais rápido
              </button>
            </div>
          )}
        </>
      )}

      {err && <p className="error small">{err}</p>}

      {results.length > 0 && (
        <div className="ftt-results">
          <h3>Suas rodadas</h3>
          <ul className="errors">
            {results.map((r, i) => (
              <li key={i}>
                <strong>Rodada {i + 1}</strong> ({r.seconds}s) — {r.words} palavras ·{' '}
                <strong>{r.wpm} wpm</strong>
                {r.transcript && (
                  <details className="tx-details">
                    <summary className="muted small">transcrição</summary>
                    <p className="tx" lang="en">{r.transcript}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {round === 3 && (
            <>
              <p className="comment">
                {results.length === 3 && results[2].wpm >= results[0].wpm
                  ? `💪 Sua fluência subiu de ${results[0].wpm} para ${results[2].wpm} wpm na mesma história — é exatamente o efeito esperado.`
                  : '💬 Compare as transcrições: a 3ª tende a sair mais direta e com menos hesitação.'}
              </p>
              <button className="primary" onClick={reset}>Praticar outro tema</button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
