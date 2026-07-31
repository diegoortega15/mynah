import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import DayBanner from './DayBanner.jsx';
import { useToday, useRefreshDay } from './queries.js';
import type { User, WritingFeedback, Writing as WritingEntry } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PROMPTS = [
  'Escreva um e-mail curto pedindo um update de projeto.',
  'Resuma em 3 frases o que você ouviu/estudou hoje.',
  'Escreva uma mensagem discordando educadamente de uma ideia.',
  'Descreva seu trabalho em 3 frases.',
];

export default function Writing({ user }: { user: User }) {
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<WritingFeedback | null>(null);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<WritingEntry[]>([]);
  const { data: today } = useToday(user.id);
  const refreshDay = useRefreshDay(user.id);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.writingHistory(user.id));
    } catch {
      /* histórico é opcional */
    }
  }, [user.id]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setErr('');
    setFb(null);
    try {
      const res = await api.correctWriting(user.id, { prompt, text });
      setFb(res.feedback);
      loadHistory();
      api.markProgress(user.id, { block: 'write' }).then(refreshDay).catch(() => {});
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="writing">
      <h1>✍️ Escrita</h1>
      <DayBanner
        block={today?.blocks?.write}
        doneText="Escrita de hoje feita"
        pendingText="Ainda não escreveu hoje — escreva um texto e corrija com a IA."
      />

      <section className="card">
        <span className="muted small" id="wr-theme">Tema (opcional)</span>
        <div className="chips" role="group" aria-labelledby="wr-theme">
          {PROMPTS.map((p) => (
            <button key={p} className={`chip ${prompt === p ? 'sel' : ''}`} onClick={() => setPrompt(p)}>
              {p.length > 34 ? p.slice(0, 32) + '…' : p}
            </button>
          ))}
        </div>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva em inglês aqui…"
        />
        <div className="row end">
          <span className="muted small">{text.trim().split(/\s+/).filter(Boolean).length} palavras</span>
          <button className="primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Corrigindo…' : 'Corrigir com IA'}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      {fb && (
        <section className="card feedback">
          <h2>Correção</h2>
          {fb.comment && <p className="comment">💬 {fb.comment}</p>}

          <h3>Texto corrigido</h3>
          <p className="corrected">{fb.corrected}</p>

          {fb.errors?.length > 0 && (
            <>
              <h3>Erros ({fb.errors.length})</h3>
              <ul className="errors">
                {fb.errors.map((e, i) => (
                  <li key={i}>
                    <span className="wrong">{e.original}</span> →{' '}
                    <span className="right">{e.correction}</span>
                    <div className="muted small">{e.explanation}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {fb.rewrite && (
            <>
              <h3>Versão mais natural</h3>
              <p className="rewrite">{fb.rewrite}</p>
            </>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2>Histórico</h2>
          <ul className="hist">
            {history.map((h) => (
              <li key={h.id}>
                <span className="muted small">{h.created_at}</span>
                <p>{h.user_text.slice(0, 80)}{h.user_text.length > 80 ? '…' : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
