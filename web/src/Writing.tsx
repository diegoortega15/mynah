import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import DayBanner from './DayBanner.jsx';
import HelpTip from './HelpTip.jsx';
import { useToday, useRefreshDay } from './queries.js';
import { looksPortuguese } from './langCheck.js';
import type { User, WritingFeedback, Writing as WritingEntry } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const fmtWhen = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
};

// Prompt pool: varied GENRES on purpose — an email, an opinion, a complaint
// and a story force different structures and tenses. The 🎲 picks from here
// (local, instant, no AI call). Writing free is also fine — theme is optional.
const PROMPTS = [
  'Escreva um e-mail curto pedindo um update de projeto.',
  'Resuma em 3 frases o que você ouviu/estudou hoje.',
  'Escreva uma mensagem discordando educadamente de uma ideia.',
  'Descreva seu trabalho em 3 frases.',
  'Escreva um e-mail se desculpando por um atraso e propondo nova data.',
  'Dê sua opinião: trabalho remoto ou presencial? Justifique.',
  'Conte algo interessante que aconteceu com você esta semana.',
  'Escreva um feedback construtivo para um colega de equipe.',
  'Descreva um problema técnico que você resolveu recentemente.',
  'Escreva uma mensagem de follow-up depois de uma reunião.',
  'Explique um conceito da sua área para alguém leigo.',
  'Escreva uma reclamação educada sobre um serviço ruim.',
  'Descreva seus planos para o próximo fim de semana.',
  'Escreva um convite para um colega almoçar e conversar sobre um projeto.',
  'Conte sobre um filme ou série que você viu — vale a pena?',
  'Escreva um pedido de ajuda para o suporte de uma ferramenta que falhou.',
];
const SHOWN_CHIPS = 4;

// The AI correction (comment, corrected text, errors, natural rewrite).
// Reused by the live result and by each expanded history entry.
function WritingCorrection({ fb }: { fb: WritingFeedback }) {
  return (
    <>
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
    </>
  );
}

export default function Writing({ user }: { user: User }) {
  const draftKey = `fluencylab.writingDraft.${user.id}`;
  const [prompt, setPrompt] = useState('');
  // Draft survives navigation — losing 10 minutes of writing to a tab switch hurts.
  const [text, setText] = useState(() => localStorage.getItem(draftKey) || '');
  const [busy, setBusy] = useState(false);
  const [fb, setFb] = useState<WritingFeedback | null>(null);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<WritingEntry[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: today } = useToday(user.id);
  const refreshDay = useRefreshDay(user.id);

  useEffect(() => {
    if (text) localStorage.setItem(draftKey, text);
    else localStorage.removeItem(draftKey);
  }, [text, draftKey]);

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
    // This box practices ENGLISH output — catch Portuguese before spending an AI call.
    if (looksPortuguese(text)) {
      setErr(
        '✍️ Este espaço é para escrever EM INGLÊS. Escreva sua ideia em inglês mesmo com erros — a correção existe exatamente pra isso. 😉'
      );
      return;
    }
    setBusy(true);
    setErr('');
    setFb(null);
    try {
      const res = await api.correctWriting(user.id, { prompt, text });
      setFb(res.feedback);
      setText(''); // corrected → the draft served its purpose
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
      <h1>✍️ Escrita <HelpTip topic="writing" /></h1>
      <DayBanner
        block={today?.blocks?.write}
        doneText="Escrita de hoje feita"
        pendingText="Ainda não escreveu hoje — escreva um texto e corrija com a IA."
      />

      <section className="card">
        <span className="muted small" id="wr-theme">
          Tema (opcional — ajuda contra a página em branco e varia o tipo de texto)
        </span>
        <div className="row gen">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Sobre o que escrever? (ou deixe vazio e escreva livre)"
            aria-labelledby="wr-theme"
          />
          <button
            className="ghost"
            title="Tema aleatório"
            aria-label="Sortear um tema"
            onClick={() => {
              // Random prompt ≠ the current one (local pool, no AI call).
              const pool = PROMPTS.filter((p) => p !== prompt);
              setPrompt(pool[Math.floor(Math.random() * pool.length)]);
            }}
          >
            🎲
          </button>
        </div>
        <div className="chips" role="group" aria-labelledby="wr-theme">
          {PROMPTS.slice(0, SHOWN_CHIPS).map((p) => (
            <button
              key={p}
              className={`chip ${prompt === p ? 'sel' : ''}`}
              onClick={() => setPrompt(prompt === p ? '' : p)}
            >
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
          <span className="muted small">
            {text.trim().split(/\s+/).filter(Boolean).length} palavras
          </span>
          <button className="primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? 'Corrigindo…' : 'Corrigir com IA'}
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      {fb && (
        <section className="card feedback">
          <h2>Correção</h2>
          <WritingCorrection fb={fb} />
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h2>Histórico</h2>
          <p className="muted small">
            Toque num item para ver o texto original completo e a correção da IA.
          </p>
          <ul className="rec-list">
            {history.map((h) => {
              const open = openId === h.id;
              const preview =
                h.user_text.length > 60 ? h.user_text.slice(0, 60) + '…' : h.user_text;
              return (
                <li key={h.id} className={`rec-item ${open ? 'open' : ''}`}>
                  <div className="rec-head">
                    <button
                      className="rec-toggle"
                      onClick={() => setOpenId(open ? null : h.id)}
                      aria-expanded={open}
                    >
                      <span className="chev">{open ? '▾' : '▸'}</span>
                      <span className="rec-when">{fmtWhen(h.created_at)}</span>
                      <span className="rec-theme">{open ? h.prompt || 'Texto livre' : preview}</span>
                    </button>
                  </div>
                  {open && (
                    <div className="rec-body feedback">
                      {h.prompt && <p className="muted small">🎯 {h.prompt}</p>}
                      <h3>Seu texto</h3>
                      <p className="your-text" lang="en">
                        {h.user_text}
                      </p>
                      {h.feedback ? (
                        <WritingCorrection fb={h.feedback} />
                      ) : (
                        <p className="muted small">Sem correção salva para este texto.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
