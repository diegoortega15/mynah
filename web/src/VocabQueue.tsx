import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import type { LoadDay, PausedCard } from './types';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The next two weeks of review load.
 *
 * Cards created in one batch move as a herd — a real deck had 9 cards on one
 * Thursday and nothing for the 18 days around it. Seeing that coming lets the
 * learner pull work forward instead of being ambushed by it.
 */
export function LoadChart({ uid }: { uid: number }) {
  const [days, setDays] = useState<LoadDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .reviewLoad(uid)
      .then((d) => alive && setDays(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!days || days.every((d) => d.count === 0)) return null;
  const max = Math.max(...days.map((d) => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <section className="card">
      <h2>Próximos 14 dias</h2>
      <p className="muted small">
        {total} revisão(ões) à frente. Um dia cheio dá para aliviar adiantando na véspera.
      </p>
      <ul className="load-chart">
        {days.map((d, i) => (
          <li key={d.date} title={`${d.count} card(s) em ${d.date}`}>
            <span className="load-bar" style={{ height: `${(d.count / max) * 100}%` }} />
            <span className="load-n">{d.count || ''}</span>
            <span className="load-d muted small">{i === 0 ? 'hoje' : d.date.slice(8)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Cards that left the queue. Showing them matters as much as removing them:
 * a card that vanishes silently is indistinguishable from a bug, and the
 * learner is the only one who can decide whether a leech should be rewritten,
 * deleted, or given another go.
 */
export function PausedCards({ uid, onChange }: { uid: number; onChange?: () => void }) {
  const [cards, setCards] = useState<PausedCard[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api
      .pausedCards(uid)
      .then(setCards)
      .catch(() => {});
  }, [uid]);
  useEffect(load, [load]);

  if (!cards.length) return null;
  const leeches = cards.filter((c) => c.paused_reason === 'leech');
  const mastered = cards.filter((c) => c.paused_reason === 'mastered');

  async function act(card: PausedCard, action: 'resume' | 'delete') {
    setBusy(card.card_id);
    setErr('');
    try {
      if (action === 'resume') await api.resumeCard(card.card_id, uid);
      else await api.deleteCard(card.card_id, uid);
      load();
      onChange?.();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const row = (c: PausedCard) => (
    <li key={c.card_id} className="paused-row">
      <div>
        <p className="en" lang="en">
          {c.text_en}
        </p>
        <p className="muted small">
          {c.translation_pt} · {c.deck_name}
          {c.paused_reason === 'leech'
            ? ` · errado ${c.lapses}×`
            : ` · intervalo de ${c.interval_days} dias`}
        </p>
      </div>
      <div className="row">
        <button className="ghost mini" disabled={busy === c.card_id} onClick={() => act(c, 'resume')}>
          {busy === c.card_id ? '…' : 'Voltar à fila'}
        </button>
        <button
          className="ghost mini del"
          title="Excluir definitivamente"
          disabled={busy === c.card_id}
          onClick={() => act(c, 'delete')}
        >
          🗑
        </button>
      </div>
    </li>
  );

  return (
    <details className="card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        📤 Fora da fila <span className="muted small">({cards.length})</span>
      </summary>

      {leeches.length > 0 && (
        <>
          <h3>😖 Problemáticos ({leeches.length})</h3>
          <p className="muted small">
            Você errou estes muitos vezes. Errar sempre o mesmo card costuma dizer que ele está mal
            escrito, junta duas ideias, ou está acima do seu nível — insistir gasta sua hora no
            único item que não está ensinando nada. Reescrever (excluir e salvar de novo, mais
            curto) resolve mais que repetir.
          </p>
          <ul className="paused-list">{leeches.map(row)}</ul>
        </>
      )}

      {mastered.length > 0 && (
        <>
          <h3>🎓 Dominados ({mastered.length})</h3>
          <p className="muted small">
            Passaram de 60 dias de intervalo com resposta confiante — mais do que resta do plano.
            Saíram da rotação para a fila ficar só com o que ainda ensina. Pode trazer de volta
            quando quiser.
          </p>
          <ul className="paused-list">{mastered.map(row)}</ul>
        </>
      )}

      {err && <p className="error small">{err}</p>}
    </details>
  );
}
