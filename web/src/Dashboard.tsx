import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStats, useToday } from './queries.js';
import type { User, BlockKey } from './types';

interface Block {
  key: BlockKey;
  icon: string;
  title: string;
  min: number;
  path: string;
  hint: string;
}

const BLOCKS: Block[] = [
  { key: 'listen', icon: '🎧', title: 'Ouvir', min: 20, path: '/listening', hint: 'Ouça um diálogo até o fim' },
  { key: 'vocab', icon: '🗂️', title: 'Vocabulário', min: 15, path: '/vocab', hint: 'Revise 20 cards do dia' },
  { key: 'speak', icon: '🗣️', title: 'Fala', min: 15, path: '/speaking', hint: 'Shadowing ou tutor' },
  { key: 'write', icon: '✍️', title: 'Escrita', min: 10, path: '/writing', hint: 'Escreva e corrija' },
];

export default function Dashboard({ user }: { user: User }) {
  const navigate = useNavigate();
  const { data: stats } = useStats(user.id);
  const { data: day } = useToday(user.id);
  const [openHelp, setOpenHelp] = useState(() => localStorage.getItem('fluencylab.dashHelp') !== '0');

  const doneCount = day?.doneCount ?? 0;
  const complete = day?.complete ?? false;

  return (
    <div className="dash">
      <section className="hero">
        <div>
          <h1>
            Olá, {user.name} {user.avatar}
          </h1>
          <p className="muted">
            Dia <strong>{user.day}/90</strong> · Fase {user.phase.n} — {user.phase.name}
          </p>
        </div>
        <div className="streak-badge" title="Dias seguidos concluindo os 4 blocos">
          🔥 <strong>{user.streak}</strong>
          <span className="muted small">streak</span>
        </div>
      </section>

      <details
        className="card help-topic dash-help"
        open={openHelp}
        onToggle={(e) => {
          setOpenHelp(e.currentTarget.open);
          localStorage.setItem('fluencylab.dashHelp', e.currentTarget.open ? '1' : '0');
        }}
      >
        <summary>
          <span className="hicon">👋</span> Como funciona (novo por aqui?)
        </summary>
        <p className="help-intro">
          Um plano de 90 dias para destravar o inglês, com ~1h por dia. Constância vence
          intensidade — 1h todo dia rende mais que 7h de uma vez.
        </p>
        <ul>
          <li>
            <strong>Sua rotina (4 blocos, nesta ordem):</strong> 🎧 Ouvir → 🗂️ Vocabulário → 🗣️
            Fala → ✍️ Escrita. Faça de cima pra baixo aqui no Início.
          </li>
          <li>
            <strong>Tudo se conecta:</strong> o que você ouve, você salva com “+ card”, e ele volta
            na revisão, na conversa com o tutor e na escrita.
          </li>
          <li>
            <strong>O dia conclui</strong> quando você faz os 4 blocos (o checklist “Sua hora de
            hoje” logo abaixo) — é isso que mantém seu streak 🔥.
          </li>
          <li>
            <strong>Guia completo:</strong> abra o menu <strong>Ajuda (❓)</strong> — tem o plano de
            90 dias e o passo a passo de cada função.
          </li>
        </ul>
      </details>

      <section className="focus-card">
        <span className="label">Foco sugerido de hoje</span>
        <p>{user.todayFocus}</p>
        <span className="muted small">Sugestão do plano — sinta-se livre pra trocar.</span>
      </section>

      <section className="blocks">
        <div className="row between">
          <h2>Sua hora de hoje</h2>
          <span className={`day-progress ${complete ? 'ok' : ''}`}>{doneCount}/4 blocos</span>
        </div>

        {complete ? (
          <div className="day-complete">🎉 Dia concluído! Mandou bem — até amanhã.</div>
        ) : (
          <p className="muted small">
            Siga a ordem <strong>1 → 4</strong>: o que você <em>ouve</em> vira card, conversa e
            texto. O dia conclui com os 4 blocos — pode parar e voltar, o progresso fica salvo.
          </p>
        )}

        <div className="block-grid">
          {BLOCKS.map((b, i) => {
            const st = day?.blocks?.[b.key];
            const done = !!st?.done;
            return (
              <button
                key={b.key}
                className={`block ${done ? 'done' : ''}`}
                onClick={() => navigate(b.path)}
              >
                <span className="step">{i + 1}</span>
                <span className="bicon">
                  {b.icon} {done && <span className="check">✅</span>}
                </span>
                <span className="btitle">{b.title}</span>
                <span className="muted small">{b.min} min</span>
                <span className="bnote">
                  {st?.info
                    ? st.info
                    : done
                    ? 'Feito hoje'
                    : b.title === 'Vocabulário' && stats
                    ? `${stats.due} cards pra revisar`
                    : b.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {user.nextMilestone && (
        <section className="milestone">
          🎯 Próximo marco: <strong>Dia {user.nextMilestone.day}</strong> —{' '}
          {user.nextMilestone.label}
        </section>
      )}
    </div>
  );
}
