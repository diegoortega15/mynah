import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useSpeech } from '../../useSpeech.js';
import { looksPortuguese } from '../../langCheck.js';
import type { User, TutorMessage, RoleplayScenario, RoleplayEval } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const THEMES = [
  'Negociar um prazo',
  'Convencer o gerente de uma ideia',
  'Cliente insatisfeito',
  'Pedir aumento',
  'Discordar educadamente numa reunião',
];

// Roleplay with a concrete objective (Loora/Speak style): the AI stays in
// character and pushes back; corrections only come in the final rubric —
// correcting mid-conversation would rebuild the fear of speaking the plan
// wants to destroy.
export default function Roleplay({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const { playOne, stop, pause, resume, isPlaying, paused, startDictation, stopDictation, dictating, sttSupported } =
    useSpeech();
  const storeKey = `mynah.roleplay.${user.id}`;
  const [scenario, setScenario] = useState<RoleplayScenario | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) || 'null')?.scenario ?? null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<TutorMessage[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) || 'null')?.messages ?? [];
    } catch {
      return [];
    }
  });
  const [evaluation, setEvaluation] = useState<RoleplayEval | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [draft, setDraft] = useState('');
  const [liveText, setLiveText] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (scenario) localStorage.setItem(storeKey, JSON.stringify({ scenario, messages: messages.slice(-40) }));
    else localStorage.removeItem(storeKey);
  }, [scenario, messages, storeKey]);

  useEffect(
    () => () => {
      stopDictation();
      stop(); // silence the character's voice when leaving
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function start(theme?: string) {
    setStarting(true);
    setErr('');
    setEvaluation(null);
    try {
      const s = await api.roleplayStart(user.id, theme);
      setScenario(s);
      setMessages([{ role: 'tutor', text: s.opening }]);
      playOne(s.opening);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setStarting(false);
    }
  }

  async function send(text?: string) {
    const msg = (text ?? draft).trim();
    if (!msg || busy || !scenario) return;
    // English-production input: nudge (keeps the draft so it can be rewritten).
    if (looksPortuguese(msg)) {
      setDraft(msg);
      setErr('🎭 O roleplay é em inglês! Tente dizer a mesma coisa em inglês — errar faz parte.');
      return;
    }
    setDraft('');
    setErr('');
    const history: TutorMessage[] = [...messages, { role: 'user', text: msg }];
    setMessages(history);
    setBusy(true);
    try {
      const res = await api.roleplayTurn(user.id, { messages: history, scenario });
      setMessages([...history, { role: 'tutor', text: res.reply }]);
      playOne(res.reply);
      onPractice?.();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function evaluate() {
    if (!scenario || messages.length < 2) return;
    setEvaluating(true);
    setErr('');
    try {
      const r = await api.roleplayEvaluate(user.id, { messages, scenario });
      setEvaluation(r);
      onPractice?.();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setEvaluating(false);
    }
  }

  function reset() {
    setScenario(null);
    setMessages([]);
    setEvaluation(null);
    setErr('');
    localStorage.removeItem(storeKey);
  }

  function startRec() {
    setErr('');
    setLiveText('');
    try {
      startDictation({ onInterim: setLiveText, onError: setErr });
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function sendRec() {
    const t = await stopDictation();
    setLiveText('');
    if (t) send(t);
    else setErr('Não ouvi nada — tente de novo.');
  }
  async function cancelRec() {
    await stopDictation();
    setLiveText('');
  }

  // ── Idle: pick a theme ─────────────────────────────────────────────────────
  if (!scenario) {
    return (
      <section className="card">
        <h2>🎭 Roleplay com objetivo</h2>
        <p className="muted small">
          Um cenário de trabalho com uma <strong>meta concreta</strong> (negociar, convencer,
          resolver). O personagem resiste de verdade — e a avaliação só vem no final, pra você
          falar sem medo de errar.
        </p>
        <div className="chips">
          <button className="chip surprise" disabled={starting} onClick={() => start()}>
            {starting ? 'Criando…' : '🎲 Cenário surpresa'}
          </button>
          {THEMES.map((t) => (
            <button key={t} className="chip" disabled={starting} onClick={() => start(t)}>
              {t}
            </button>
          ))}
        </div>
        {err && <p className="error small">{err}</p>}
      </section>
    );
  }

  // ── Rubric ─────────────────────────────────────────────────────────────────
  if (evaluation) {
    return (
      <section className="card feedback">
        <div className="row between">
          <h2>{evaluation.achieved ? '🏆 Objetivo atingido!' : '📋 Quase lá'}</h2>
          <span className={`fb-score ${evaluation.score >= 80 ? 'good' : evaluation.score >= 50 ? 'mid' : 'low'}`}>
            {evaluation.score}/100
          </span>
        </div>
        <p className="muted small">🎯 {scenario.objective}</p>
        <p className="comment">{evaluation.feedback}</p>
        {evaluation.better_phrases.length > 0 && (
          <>
            <h3>✏️ Frases que teriam soado melhor</h3>
            <ul className="errors">
              {evaluation.better_phrases.map((p, i) => (
                <li key={i}>
                  <span className="wrong">{p.original}</span> →{' '}
                  <span className="right">{p.better}</span>
                  {p.why && <div className="muted small">{p.why}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row end">
          <button className="primary" onClick={reset}>🎭 Novo cenário</button>
        </div>
      </section>
    );
  }

  // ── In progress ────────────────────────────────────────────────────────────
  return (
    <section className="card tutor">
      <div className="roleplay-brief">
        <strong>{scenario.title}</strong>
        <p className="muted small">{scenario.scenario}</p>
        <p className="objective">🎯 {scenario.objective}</p>
      </div>

      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'tutor' && <span className="who">{scenario.ai_role}</span>}
            <p lang={m.role === 'tutor' ? 'en' : undefined}>{m.text}</p>
            {m.role === 'tutor' && (
              <div className="bubble-actions">
                <button className="ghost mini" aria-label="Ouvir" onClick={() => playOne(m.text)}>🔊</button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble tutor typing">…</div>}
        <div ref={endRef} />
      </div>

      {err && <p className="error small">{err}</p>}

      {isPlaying && (
        <div className="row end tts-controls">
          <button className="ghost mini" onClick={paused ? resume : pause}>
            {paused ? '▶ Retomar' : '⏸ Pausar'}
          </button>
          <button className="ghost mini" onClick={stop}>⏹ Parar som</button>
        </div>
      )}

      {dictating ? (
        <div className="dictation">
          <p className="live">
            <span className="rec-dot" /> {liveText || 'Ouvindo… fale à vontade e toque em Enviar.'}
          </p>
          <div className="row end">
            <button className="ghost" onClick={cancelRec}>✕ Cancelar</button>
            <button className="primary" onClick={sendRec} disabled={busy}>Enviar 🎤</button>
          </div>
        </div>
      ) : (
        <div className="row compose">
          <button
            className="primary mic"
            onClick={startRec}
            disabled={busy || !sttSupported}
            aria-label="Gravar voz"
            title="Gravar voz"
          >
            🎤
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="…ou escreva em inglês"
            aria-label="Sua fala no roleplay"
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={busy}
          />
          <button className="primary" onClick={() => send()} disabled={busy || !draft.trim()}>
            Enviar
          </button>
        </div>
      )}

      <div className="row end" style={{ marginTop: 10 }}>
        <button className="ghost" onClick={reset}>✕ Abandonar</button>
        <button
          className="primary"
          onClick={evaluate}
          disabled={evaluating || messages.filter((m) => m.role === 'user').length < 2}
          title="Encerra a conversa e recebe a avaliação"
        >
          {evaluating ? 'Avaliando…' : '🏁 Encerrar e avaliar'}
        </button>
      </div>
    </section>
  );
}
