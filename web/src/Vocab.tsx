import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from './api.js';
import { fmtFuture } from './format.js';
import { useSpeech } from './useSpeech.js';
import HelpTip from './HelpTip.jsx';
import { useStats, useToday, useRefreshDay } from './queries.js';
import type { User, Deck, DeckCard, ReviewCard, Rating } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const SUGGESTED = ['Reuniões', 'E-mails profissionais', 'Apresentações', 'Negociação', 'Entrevista de emprego', 'Small talk'];

interface ReviewState {
  queue: ReviewCard[];
  /** true = estudando adiantado (cards que ainda não venceram). */
  ahead?: boolean;
  done: number;
}

// --- Review modes: interleaved retrieval practice ---------------------------
// Pure recognition (read EN → recall PT) is the weakest form of practice.
// Repeat cards rotate through cloze (produce the missing word), PT→EN
// (produce the sentence) and listening (understand by ear) — retrieval in
// multiple directions is what the SLA literature calls for.
type ReviewMode = 'read' | 'cloze' | 'produce' | 'listen';

const MODE_INFO: Record<ReviewMode, { label: string; hint: string }> = {
  read: { label: '🇬🇧→🇧🇷 Traduza', hint: 'Leia e lembre o significado' },
  cloze: { label: '✂️ Complete a lacuna', hint: 'Qual palavra está faltando?' },
  produce: { label: '🇧🇷→🇬🇧 Fale em inglês', hint: 'Como você diria isso em inglês? Fale em voz alta.' },
  listen: { label: '👂 Só de ouvido', hint: 'Ouça e entenda — sem ler.' },
};

// What each button MEANS, not how the card feels. The old labels invited the
// wrong choice: someone who could not remember a card pressed "Difícil"
// (which still pushes the card weeks away) instead of "De novo". In one real
// session 30 of 50 cards were rated "hard" and none came back for over a week.
const RATINGS = [
  { key: 'again' as const, label: '❌ Errei', why: 'Não lembrei / errei' },
  { key: 'hard' as const, label: '😓 Custou', why: 'Acertei, mas com esforço' },
  { key: 'good' as const, label: '🙂 Bom', why: 'Lembrei sem drama' },
  { key: 'easy' as const, label: '😎 Fácil', why: 'Imediato, sem pensar' },
];

/** "volta amanhã" / "volta em 12 dias" — o intervalo já em português. */
function whenBack(days: number): string {
  if (days <= 0) return 'volta ainda hoje';
  if (days === 1) return 'volta amanhã';
  if (days < 30) return `volta em ${days} dias`;
  const m = Math.round(days / 30);
  return m === 1 ? 'volta em cerca de 1 mês' : `volta em cerca de ${m} meses`;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'that', 'this', 'you', 'i', 'we', 'they', 'he', 'she',
  'my', 'your', 'me', 'with', 'as', 'do', 'did', 'does', 'have', 'has', 'had', 'can',
  'could', 'would', 'should', 'will', 'not', 'about', 'what', 'when', 'how',
]);

// Deterministic cloze target: the longest content word (no AI call needed).
function clozeWord(text: string): string | null {
  const words = text.replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = words.filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}

function maskWord(text: string, word: string): string {
  return text.replace(word, '_'.repeat(Math.max(4, word.length)));
}

// First exposure is always recognition; repeats rotate deterministically.
function modeFor(card: ReviewCard, ttsOk: boolean): ReviewMode {
  if (card.reps === 0) return 'read';
  const pool: ReviewMode[] = ['read', 'cloze', 'produce'];
  if (ttsOk) pool.push('listen');
  const m = pool[(card.card_id + card.reps) % pool.length];
  // Cloze needs a maskable word; fall back to recognition.
  if (m === 'cloze' && !clozeWord(card.text_en)) return 'read';
  return m;
}

export default function Vocab({ user, onProgress }: { user: User; onProgress?: () => void }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [theme, setTheme] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [session, setSession] = useState<ReviewState | null>(null); // review mode
  const [starting, setStarting] = useState(false);
  const { data: stats } = useStats(user.id);
  const { data: todayData } = useToday(user.id);
  // Daily vocab target comes from the server (configurable per profile).
  const vocabTarget = todayData?.targets?.vocab ?? 20;
  const refreshDay = useRefreshDay(user.id);

  const loadDecks = useCallback(async () => {
    try {
      setDecks(await api.listDecks(user.id));
    } catch {
      setMsg('❌ Não consegui carregar os baralhos. O servidor está rodando?');
    }
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

  // `ahead` estuda o que ainda não venceu. O FSRS deixa dias vazios de
  // propósito, e mandar quem quer estudar "voltar depois" mata o hábito que o
  // app inteiro existe para construir. Custo: revisar cedo dá menos informação
  // ao agendador, então é escolha explícita e nunca o padrão.
  async function startReview(ahead = false) {
    if (starting) return;
    setStarting(true);
    try {
      const cards = await api.getReview(user.id, ahead);
      if (!cards.length) {
        setMsg(
          ahead
            ? 'Você não tem nenhum card ainda. Gere um pack acima. 🎉'
            : 'Nada vencendo agora — dá para adiantar os próximos ou gerar um pack.'
        );
        return;
      }
      setSession({ queue: cards, done: 0, ahead });
    } catch {
      setMsg('❌ Não consegui iniciar a revisão. Verifique a conexão e tente de novo.');
    } finally {
      setStarting(false);
    }
  }

  if (session) {
    return (
      <ReviewSession
        uid={user.id}
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
        <h1>Vocabulário <HelpTip topic="vocab" /></h1>
        {stats?.due === 0 && stats.total > 0 ? (
          <button
            className="primary"
            onClick={() => startReview(true)}
            disabled={starting}
            title="Revisa cards que ainda não venceram. Mantém o hábito, mas dá menos informação ao agendador do que esperar o dia certo."
          >
            {starting ? 'Carregando…' : '⏩ Adiantar próximos'}
          </button>
        ) : (
          <button className="primary" onClick={() => startReview()} disabled={starting}>
            {starting ? 'Carregando…' : '▶ Revisar agora'}
          </button>
        )}
      </div>

      {stats && (
        <div
          className={`vocab-status ${stats.due === 0 || stats.reviewedToday >= vocabTarget ? 'done' : ''}`}
        >
          {stats.due > 0 && stats.reviewedToday < vocabTarget ? (
            `📚 ${stats.due} card(s) vencendo hoje · ${stats.reviewedToday}/${vocabTarget} já feitos.`
          ) : stats.reviewedToday > 0 ? (
            `✅ Revisão de hoje concluída — ${stats.reviewedToday} card(s) revisados.`
          ) : (
            // Sem nada agendado E sem nada revisado: dizer "concluída" seria
            // mentira, e "volte depois" sem data foi exatamente o que gerou a
            // dúvida "por que não tenho cards?".
            <>
              💤 <strong>Nada vencendo hoje</strong> — o agendador só traz cada card no dia certo.
              {stats.nextDue && (
                <> Os próximos <strong>{stats.nextCount} card(s)</strong> voltam{' '}
                  <strong>{fmtFuture(stats.nextDue)}</strong>.</>
              )}
            </>
          )}
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
              uid={user.id}
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
  uid,
  session,
  setSession,
  onDone,
}: {
  uid: number;
  session: ReviewState;
  setSession: Dispatch<SetStateAction<ReviewState | null>>;
  onDone: () => void;
}) {
  const { speak, ttsSupported } = useSpeech();
  const [revealed, setRevealed] = useState(false);
  const [rateErr, setRateErr] = useState('');
  const [rating, setRating] = useState(false);
  const card = session.queue[0];

  useEffect(() => {
    setRevealed(false);
    if (!card || !ttsSupported) return;
    // Auto-play only when hearing the sentence doesn't give the answer away:
    // 'read' (audio reinforces) and 'listen' (audio IS the exercise).
    const m = modeFor(card, ttsSupported);
    if (m === 'read' || m === 'listen') speak(card.text_en);
    // Only re-run when the card itself changes — not on every render (which would
    // retrigger the audio). `speak`/`ttsSupported` are intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.card_id]);

  if (!card) return null;

  const mode = modeFor(card, ttsSupported);
  const masked = mode === 'cloze' ? maskWord(card.text_en, clozeWord(card.text_en) ?? '') : null;
  const audioAllowed = mode === 'read' || mode === 'listen' || revealed;

  async function rate(r: Rating) {
    if (rating) return; // ignore double-taps while the request is in flight
    setRating(true);
    setRateErr('');
    try {
      await api.submitReview(card.card_id, r, uid);
    } catch {
      // Don't advance the queue on failure — the card stays, the user retries.
      setRateErr('❌ Não consegui salvar a avaliação. Tente de novo.');
      setRating(false);
      return;
    }
    setRating(false);
    const rest = session.queue.slice(1);
    // 'again' → requeue at the end of this session
    const queue = r === 'again' ? [...rest, card] : rest;
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
        <div className="row between">
          <span className="muted small">{card.deck_name}</span>
          <span className="mode-chip">{MODE_INFO[mode].label}</span>
        </div>

        {mode === 'read' && <p className="front" lang="en">{card.text_en}</p>}
        {mode === 'cloze' && <p className="front" lang="en">{revealed ? card.text_en : masked}</p>}
        {mode === 'produce' && (
          <p className="front" lang="pt-BR">{card.translation_pt}</p>
        )}
        {mode === 'listen' && !revealed && <p className="front listen-front">👂 …</p>}
        {mode === 'listen' && revealed && <p className="front" lang="en">{card.text_en}</p>}

        {audioAllowed && (
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
        )}

        {revealed ? (
          <div className="back">
            {mode === 'produce' ? (
              <p className="pt" lang="en">{card.text_en}</p>
            ) : (
              <p className="pt">{card.translation_pt}</p>
            )}
            {card.context && <p className="ctx" lang="en">“{card.context}”</p>}
          </div>
        ) : (
          <p className="muted small tap">{MODE_INFO[mode].hint} — toque para revelar</p>
        )}
      </div>

      {session.ahead && (
        <p className="muted small">
          ⏩ Estudando adiantado: estes cards ainda não venceram. Responda com sinceridade — o
          agendador usa isso para recalcular as próximas datas.
        </p>
      )}

      {rateErr && <p className="error small">{rateErr}</p>}

      {revealed ? (
        <div className="rate-row">
          {RATINGS.map((r) => {
            const days = card.preview?.[r.key];
            return (
              <button
                key={r.key}
                className={`r ${r.key}`}
                disabled={rating}
                // Tooltip: o que o botão quer dizer E quando o card volta.
                title={days === undefined ? r.why : `${r.why} — ${whenBack(days)}`}
                onClick={() => rate(r.key)}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      ) : (
        <button className="primary wide" onClick={() => setRevealed(true)}>
          Mostrar resposta
        </button>
      )}
    </div>
  );
}

function DeckItem({ uid, deck, onChanged }: { uid: number; deck: Deck; onChanged: () => void }) {
  const { playOne } = useSpeech();
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmCard, setConfirmCard] = useState<number | null>(null); // card armed for deletion
  const [deleting, setDeleting] = useState(false); // any delete in flight

  async function toggle() {
    if (!open && cards === null) {
      try {
        setCards(await api.deckCards(deck.id, uid));
      } catch {
        setCards([]);
      }
    }
    setOpen((o) => !o);
  }
  async function removeCard(id: number) {
    if (deleting) return;
    setDeleting(true);
    setConfirmCard(null);
    try {
      await api.deleteCard(id, uid);
      setCards((cs) => (cs ?? []).filter((c) => c.card_id !== id));
      onChanged();
    } catch {
      /* deixa o card na lista; o usuário tenta de novo */
    } finally {
      setDeleting(false);
    }
  }
  async function removeDeck() {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteDeck(deck.id, uid);
      onChanged();
    } catch {
      setConfirmDel(false);
    } finally {
      setDeleting(false);
    }
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
                  {confirmCard === c.card_id ? (
                    <>
                      <button className="ghost mini" title="Cancelar" onClick={() => setConfirmCard(null)}>✕</button>
                      <button className="danger-btn mini" title="Confirmar exclusão" disabled={deleting} onClick={() => removeCard(c.card_id)}>
                        {deleting ? '…' : 'Excluir?'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="ghost mini" title="Ouvir" onClick={() => playOne(c.text_en)}>🔊</button>
                      <button className="ghost mini del" title="Excluir card" onClick={() => setConfirmCard(c.card_id)}>🗑</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {cards && cards.length > 0 && (
            <div className="row end">
              {confirmDel ? (
                <>
                  <button className="ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
                  <button className="danger-btn" disabled={deleting} onClick={removeDeck}>
                    {deleting ? 'Excluindo…' : 'Confirmar exclusão do baralho'}
                  </button>
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
