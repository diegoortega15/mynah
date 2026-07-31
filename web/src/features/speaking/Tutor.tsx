import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useSpeech } from '../../useSpeech.js';
import type { User, TutorMessage } from '../../types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Tutor({ user, onPractice }: { user: User; onPractice?: () => void }) {
  const { speak, startDictation, stopDictation, dictating, sttSupported } = useSpeech();
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [liveText, setLiveText] = useState('');
  const [err, setErr] = useState('');
  const [tx, setTx] = useState<Record<number, string>>({}); // translations of tutor messages, by index
  const [txBusy, setTxBusy] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Translate a tutor message on demand (toggle off if already shown).
  async function translate(i: number, text: string) {
    if (tx[i]) {
      setTx((t) => {
        const n = { ...t };
        delete n[i];
        return n;
      });
      return;
    }
    setTxBusy(i);
    try {
      const { pt } = await api.translate(text);
      setTx((t) => ({ ...t, [i]: pt }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setTxBusy(null);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  // Stop the mic (dictation) if the user leaves the tutor mid-recording.
  useEffect(
    () => () => {
      stopDictation();
    },
    [stopDictation]
  );

  async function send(text?: string) {
    const msg = (text ?? draft).trim();
    if (!msg || busy) return;
    setDraft('');
    setErr('');
    const history: TutorMessage[] = [...messages, { role: 'user', text: msg }];
    setMessages(history);
    setBusy(true);
    try {
      // Send the whole conversation so any AI provider keeps context.
      const res = await api.tutor(user.id, { messages: history, focus: user.todayFocus });
      setMessages([...history, { role: 'tutor', text: res.reply }]);
      speak(res.reply);
      onPractice?.();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Start recording: keeps listening through pauses until you press Enviar.
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

  return (
    <section className="card tutor">
      <div className="chat">
        {messages.length === 0 && (
          <p className="muted center-row">
            Fale ou escreva algo em inglês para começar. O tutor Alex conversa e corrige de leve.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'tutor' && <span className="who">Alex</span>}
            <p lang={m.role === 'tutor' ? 'en' : undefined}>{m.text}</p>
            {tx[i] && <p className="bubble-tx">🌐 {tx[i]}</p>}
            {m.role === 'tutor' && (
              <div className="bubble-actions">
                <button className="ghost mini" aria-label="Ouvir" onClick={() => speak(m.text)}>🔊</button>
                <button
                  className="ghost mini"
                  onClick={() => translate(i, m.text)}
                  disabled={txBusy === i}
                >
                  {txBusy === i ? '…' : tx[i] ? 'ocultar' : '🌐 traduzir'}
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble tutor typing">Alex está digitando…</div>}
        <div ref={endRef} />
      </div>

      {err && <p className="error small">{err}</p>}

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
            aria-label="Mensagem para o tutor"
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={busy}
          />
          <button className="primary" onClick={() => send()} disabled={busy || !draft.trim()}>
            Enviar
          </button>
        </div>
      )}
    </section>
  );
}
