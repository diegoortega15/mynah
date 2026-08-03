import { useEffect, useState } from 'react';
import { api } from './api.js';
import HelpTip from './HelpTip.jsx';
import type { User, HistoryDay, HistoryDetail, BlockKey } from './types';

const BLOCK_ICON: Record<BlockKey, string> = { listen: '🎧', vocab: '🗂️', speak: '🗣️', write: '✍️' };
const BLOCK_NAME: Record<BlockKey, string> = {
  listen: 'Ouvir',
  vocab: 'Vocabulário',
  speak: 'Fala',
  write: 'Escrita',
};
const BLOCK_KEYS: BlockKey[] = ['listen', 'vocab', 'speak', 'write'];

const fmt = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD local
const prettyDay = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export default function History({ user }: { user: User }) {
  const [days, setDays] = useState<Record<string, HistoryDay> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);

  useEffect(() => {
    api
      .history(user.id)
      .then((list) => {
        const map: Record<string, HistoryDay> = {};
        for (const d of list) map[d.date] = d;
        setDays(map);
      })
      .catch(() => setDays({}));
  }, [user.id]);

  function selectDay(date: string) {
    setSelected(date);
    setDetail(null);
    api.historyDay(user.id, date).then(setDetail).catch(() => {});
  }

  if (!days) return <p className="muted">Carregando…</p>;

  // Build a heatmap of the last 13 weeks (columns = weeks, rows = Sun..Sat).
  const WEEKS = 13;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const cols = [];
  const cur = new Date(start);
  while (cur <= today) {
    const col = [];
    for (let wd = 0; wd < 7; wd++) {
      const future = cur > today;
      col.push({ date: fmt(cur), future, data: days[fmt(cur)] });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
  }

  const completed = Object.values(days).filter((d) => d.complete).length;
  const recent = Object.values(days).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

  return (
    <div className="history">
      <h1>📅 Histórico <HelpTip topic="history" /></h1>
      <p className="muted small">
        {completed} dia(s) concluído(s) · toque num quadradinho ou num dia para ver os detalhes.
      </p>

      <div className="heatmap-wrap">
        <div className="heatmap">
          {cols.map((col, ci) => (
            <div className="hm-col" key={ci}>
              {col.map((cell, ri) =>
                cell.future ? (
                  <span key={ri} className="hm-cell blank" />
                ) : (
                  <button
                    key={ri}
                    className={`hm-cell lvl${cell.data ? cell.data.doneCount : 0} ${selected === cell.date ? 'sel' : ''}`}
                    title={`${cell.date}: ${cell.data ? cell.data.doneCount : 0}/4 blocos`}
                    onClick={() => selectDay(cell.date)}
                  />
                )
              )}
            </div>
          ))}
        </div>
        <div className="hm-legend">
          <span className="muted small">menos</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`hm-cell lvl${l}`} />
          ))}
          <span className="muted small">completo</span>
        </div>
      </div>

      {selected && (
        <section className="card day-detail">
          <div className="row between">
            <h2 style={{ textTransform: 'capitalize' }}>{prettyDay(selected)}</h2>
            <button className="ghost mini" onClick={() => { setSelected(null); setDetail(null); }}>✕</button>
          </div>
          {!detail ? (
            <p className="muted small">Carregando…</p>
          ) : (
            <>
              <div className="detail-blocks">
                {BLOCK_KEYS.map((k) => (
                  <div key={k} className={`db-item ${detail.blocks[k]?.done ? 'done' : ''}`}>
                    <span>{detail.blocks[k]?.done ? '✅' : '⬜'} {BLOCK_ICON[k]} {BLOCK_NAME[k]}</span>
                    {detail.blocks[k]?.info && <span className="muted small">{detail.blocks[k].info}</span>}
                  </div>
                ))}
              </div>
              <ul className="detail-activity">
                <li>🗂️ {detail.activity.cardsReviewed} cards revisados</li>
                <li>✍️ {detail.activity.writings} escrita(s) corrigida(s)</li>
                <li>🗣️ {detail.activity.speaking} prática(s) de fala</li>
                <li>
                  🎧 {detail.activity.dialogues.length} diálogo(s)
                  {detail.activity.dialogues.length > 0 && `: ${detail.activity.dialogues.join(', ')}`}
                </li>
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Últimos dias</h2>
        {recent.length === 0 && <p className="muted">Ainda sem histórico. Faça algum bloco hoje! 💪</p>}
        <ul className="hist-days">
          {recent.map((d) => (
            <li key={d.date}>
              <button className="linklike" onClick={() => selectDay(d.date)}>
                {new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </button>
              <span className="day-blocks">
                {BLOCK_KEYS.map((k) => (
                  <span key={k} className={d.blocks[k] ? 'on' : 'off'} title={BLOCK_NAME[k]}>
                    {BLOCK_ICON[k]}
                  </span>
                ))}
              </span>
              {d.complete ? (
                <span className="badge">completo</span>
              ) : (
                <span className="muted small">{d.doneCount}/4</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
