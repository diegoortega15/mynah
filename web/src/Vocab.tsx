import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from './api.js';
import { useSpeech } from './useSpeech.js';
import { useStats, useRefreshDay } from './queries.js';
import type { User, Deck, DeckCard, ReviewCard, Rating } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const SUGGESTED = ['Reuniões', 'E-mails profissionais', 'Apresentações', 'Negociação', 'Entrevista de emprego', 'Small talk'];

interface ReviewState {
  queue: ReviewCard[];
  done: number;
}

export default function Vocab({ user, onProgress }: { user: User; onProgress?: () => void }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [session, setSession] = useState<ReviewState | null>(null); // review mode
  const { data: stats } = useStats(user.id);
  const refreshDay = useRefreshDay(user.id);

  const loadDecks = useCallback(async () => {
    setDecks(await api.listDecks(user.id));
  }, [user.id]);
  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  async function generate(t?: string) {
    const th = (t ?? theme).trim();
    if (!th) return;
    setBusy(true);
    setMsg('Gerando pack com o Claude… (uns segundos)');
    try {
      const res = await api.generatePack(user.id, { theme: th });
      setMsg(`✅ ${res.added} frases adicionadas em "${th}".`);
      setTheme('');
      await loadDecks();
      refreshDay();
    } catch (e) {
      setMsg('❌ ' + errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function startReview() {
    const cards = await api.getReview(user.id);
    if (!cards.length) {
      setMsg('Nada pra revisar agora. Gere um pack ou volte depois. 🎉');
      return;
    }
    setSession({ queue: cards, done: 0 });
  }

  if (session) {
    return (
      <ReviewSession
        session={session}
        setSession={setSession}
        onDone={() => {
          // The vocab block is auto-marked on the backend as you review
          // (target: 20 cards/day), so we just refresh here.
          setSession(null);
          onProgress?.();
          loadDecks();
          refreshDay();
        }}
      />
    );
  }

  const totalCards = decks.reduce((s, d) => s + d.card_count, 0);

  return (
    <div className="vocab">
      <div className="vocab-head">
        <h1>Vocabulário</h1>
        <button className="primary" onClick={startReview}>
          ▶ Revisar agora
        </button>
      </div>

      {stats && (
        <div className={`vocab-status ${stats.due === 0 || stats.reviewedToday >= 20 ? 'done' : ''}`}>
          {stats.due === 0 || stats.reviewedToday >= 20
            ? `✅ Revisão de hoje concluída — ${stats.reviewedToday} card(s) revisados hoje. Os próximos voltam nos dias certos.`
            : `📚 ${stats.due} card(s) vencendo hoje · ${stats.reviewedToday}/20 já feitos.`}
        </div>
      )}

      <section className="card">
        <h2>Gerar um pack</h2>
        <p className="muted small">
          O Claude cria frases inteiras em contexto (nunca palavras soltas), no seu nível.
        </p>
        <div className="row gen">
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Tema (ex: reuniões, follow-up de e-mail…)"
            onKeyDown={(e) => e.key === 'Enter' && generate()}
          />
          <button className="primary" onClick={() => generate()} disabled={busy || !theme.trim()}>
            {busy ? 'Gerando…' : 'Gerar'}
          </button>
        </div>
        <div className="chips">
          {SUGGESTED.map((s) => (
            <button key={s} className="chip" disabled={busy} onClick={() => generate(s)}>
              {s}
            </button>
          ))}
        </div>
        {msg && <p className="msg">{msg}</p>}
      </section>

      <section className="card">
        <h2>Seus baralhos · {totalCards} cards</h2>
        <p className="muted small">
          Sua <strong>biblioteca permanente</strong>: os cards ficam guardados e voltam na revisão
          nos dias certos (repetição espaçada) — você <strong>não precisa apagar</strong>. Toque num
          baralho para ver os cards; exclua só o que salvou sem querer.
        </p>
        {decks.length === 0 && <p className="muted">Nenhum baralho ainda. Gere um pack acima.</p>}
        <div className="deck-mgr">
          {decks.map((d) => (
            <DeckItem
              key={d.id}
              deck={d}
              onChanged={() => {
                loadDecks();
                onProgress?.();
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReviewSession({
  session,
  setSession,
  onDone,
}: {
  session: ReviewState;
  setSession: Dispatch<SetStateAction<ReviewState | null>>;
  onDone: () => void;
}) {
  const { speak, ttsSupported } = useSpeech();
  const [revealed, setRevealed] = useState(false);
  const card = session.queue[0];

  useEffect(() => {
    setRevealed(false);
    if (card && ttsSupported) speak(card.text_en);
    // Only re-run when the card itself changes — not on every render (which would
    // retrigger the audio). `speak`/`ttsSupported` are intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.card_id]);

  if (!card) return null;

  async function rate(rating: Rating) {
    await api.submitReview(card.card_id, rating);
    const rest = session.queue.slice(1);
    // 'again' → requeue at the end of this session
    const queue = rating === 'again' ? [...rest, card] : rest;
    if (queue.length === 0) return onDone();
    setSession({ queue, done: session.done + 1 });
  }

  const remaining = session.queue.length;

  return (
    <div className="review">
      <div className="review-top">
        <button className="ghost" onClick={onDone}>
          ✕ Encerrar
        </button>
        <span className="muted">{remaining} na fila · {session.done} feitos</span>
      </div>

      <div
        className="flashcard"
        role="button"
        tabIndex={revealed ? -1 : 0}
        aria-label={revealed ? undefined : 'Revelar tradução'}
        onClick={() => setRevealed(true)}
        onKeyDown={(e) => {
          if (!revealed && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setRevealed(true);
          }
        }}
      >
        <span className="muted small">{card.deck_name}</span>
        <p className="front" lang="en">{card.text_en}</p>
        <button
          className="ghost play"
          aria-label="Ouvir a frase"
          onClick={(e) => {
            e.stopPropagation();
            speak(card.text_en);
          }}
        >
          🔊 Ouvir
        </button>

        {revealed ? (
          <div className="back">
            <p className="pt">{card.translation_pt}</p>
            {card.context && <p className="ctx" lang="en">“{card.context}”</p>}
          </div>
        ) : (
          <p className="muted small tap">toque (ou Enter) para revelar</p>
        )}
      </div>

      {revealed ? (
        <div className="rate-row">
          <button className="r again" onClick={() => rate('again')}>De novo</button>
          <button className="r hard" onClick={() => rate('hard')}>Difícil</button>
          <button className="r good" onClick={() => rate('good')}>Bom</button>
          <button className="r easy" onClick={() => rate('easy')}>Fácil</button>
        </div>
      ) : (
        <button className="primary wide" onClick={() => setRevealed(true)}>
          Mostrar resposta
        </button>
      )}
    </div>
  );
}

function DeckItem({ deck, onChanged }: { deck: Deck; onChanged: () => void }) {
  const { playOne } = useSpeech();
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function toggle() {
    if (!open && cards === null) setCards(await api.deckCards(deck.id));
    setOpen((o) => !o);
  }
  async function removeCard(id: number) {
    await api.deleteCard(id);
    setCards((cs) => (cs ?? []).filter((c) => c.card_id !== id));
    onChanged();
  }
  async function removeDeck() {
    await api.deleteDeck(deck.id);
    onChanged();
  }

  return (
    <div className="deck-item">
      <button className="deck-head" onClick={toggle}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <span className="deck-name">{deck.name}</span>
        <span className="muted small">{deck.card_count} cards</span>
      </button>

      {open && (
        <div className="deck-body">
          {cards === null && <p className="muted small">Carregando…</p>}
          {cards && cards.length === 0 && <p className="muted small">Sem cards neste baralho.</p>}
          <ul className="card-list">
            {cards?.map((c) => (
              <li key={c.card_id}>
                <div className="cl-text">
                  <span className="cl-en">{c.text_en}</span>
                  <span className="muted small">{c.translation_pt}</span>
                </div>
                <div className="cl-act">
                  <button className="ghost mini" title="Ouvir" onClick={() => playOne(c.text_en)}>🔊</button>
                  <button className="ghost mini del" title="Excluir card" onClick={() => removeCard(c.card_id)}>🗑</button>
                </div>
              </li>
            ))}
          </ul>
          {cards && cards.length > 0 && (
            <div className="row end">
              {confirmDel ? (
                <>
                  <button className="ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
                  <button className="danger-btn" onClick={removeDeck}>Confirmar exclusão do baralho</button>
                </>
              ) : (
                <button className="danger-btn" onClick={() => setConfirmDel(true)}>Excluir baralho inteiro</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
