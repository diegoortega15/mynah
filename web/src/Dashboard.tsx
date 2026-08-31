import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import HelpTip from './HelpTip.jsx';
import { useStats, useToday } from './queries.js';
import type { User, BlockKey, UserErrorsSummary, LevelHint } from './types';

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
  const [aiDown, setAiDown] = useState(false);
  const [errBank, setErrBank] = useState<UserErrorsSummary | null>(null);
  const [hint, setHint] = useState<LevelHint | null>(null);
  const [hintOff, setHintOff] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getErrors(user.id)
      .then((e) => alive && setErrBank(e))
      .catch(() => {});
    // What the day-to-day quizzes say about the level, which may disagree with
    // what the profile claims. Suggestion only — nothing changes by itself.
    api
      .levelHint(user.id)
      .then((r) => alive && setHint(r.hint))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id]);

  // Health-check the AI once per browser session (in the background) so the
  // user learns about a missing/broken provider HERE — not as a cryptic error
  // on their first "Gerar".
  useEffect(() => {
    if (sessionStorage.getItem('mynah.aiHealth') === 'ok') return;
    let alive = true;
    api
      .testConfig({})
      .then(() => {
        sessionStorage.setItem('mynah.aiHealth', 'ok');
        if (alive) setAiDown(false);
      })
      .catch(() => {
        if (alive) setAiDown(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const doneCount = day?.doneCount ?? 0;
  const complete = day?.complete ?? false;

  return (
    <div className="dash">
      {hint && !hintOff && (
        <div className={`level-note ${hint.direction === 'up' ? 'harder' : 'easier'} row between`}>
          <span>
            🎯 {hint.msg}{' '}
            <Link to="/settings">Ajustar no Perfil →</Link>
          </span>
          <button className="ghost mini" title="Dispensar" onClick={() => setHintOff(true)}>
            ✕
          </button>
        </div>
      )}
      {aiDown && (
        <div className="ai-banner">
          ⚠️ <strong>A IA não está respondendo.</strong> Os exercícios gerados (packs, diálogos,
          correções, tutor) não vão funcionar até configurar.{' '}
          <Link to="/settings">Abrir configurações →</Link>
          <span className="muted small"> (Revisar cards e ouvir diálogos salvos funcionam normalmente.)</span>
        </div>
      )}
      <section className="hero">
        <div>
          <h1>
            Olá, {user.name} {user.avatar} <HelpTip topic="dashboard" />
          </h1>
          <p className="muted">
            Dia <strong>{user.day}/90</strong> · Fase {user.phase.n} — {user.phase.name}
            {user.skippedDays > 0 && (
              <span className="muted small elapsed-note">
                {' '}· {user.elapsedDays} dias desde o início
              </span>
            )}
          </p>
        </div>
        <div
          className="streak-badge"
          title="Dias seguidos concluindo os 4 blocos. Cada semana completa ganha 1 🧊, que protege o streak num dia perdido."
        >
          🔥 <strong>{user.streak}</strong>
          <span className="muted small">streak</span>
          {user.freezes > 0 && (
            <span className="muted small" aria-label={`${user.freezes} proteções de streak`}>
              🧊 ×{user.freezes}
            </span>
          )}
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
          <button className="block extra" onClick={() => navigate('/reading')}>
            <span className="step star">★</span>
            <span className="bicon">📖</span>
            <span className="btitle">Ler</span>
            <span className="muted small">extra</span>
            <span className="bnote">Leitura no seu nível — não conta bloco, vale ouro</span>
          </button>
        </div>
      </section>

      {errBank && errBank.top.length > 0 && (
        <section className="card">
          <h2>🎯 Seus erros recorrentes</h2>
          <p className="muted small">
            Últimos 30 dias, vindos das correções de ✍️ escrita e 🗣️ fala (tutor, roleplay,
            gravações). O corretor e o tutor já prestam atenção extra neles.
          </p>
          <div className="chips">
            {errBank.top.map((t) => (
              <span key={t.category} className="chip">
                {t.category} · {t.count}×
              </span>
            ))}
          </div>
          {errBank.recent.length > 0 && (
            <details className="tx-details">
              <summary className="muted small">Ver exemplos recentes</summary>
              <ul className="errors">
                {errBank.recent.map((e) => (
                  <li key={e.id}>
                    <span title={e.source === 'writing' ? 'Da escrita' : 'Da fala'}>
                      {e.source === 'writing' ? '✍️' : '🗣️'}
                    </span>{' '}
                    <span className="wrong">{e.original}</span> →{' '}
                    <span className="right">{e.correction}</span>
                    <div className="muted small">
                      {e.category ? `[${e.category}] ` : ''}
                      {e.explanation}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {user.nextMilestone && (
        <section className="milestone">
          🎯 Próximo marco: <strong>Dia {user.nextMilestone.day}</strong> —{' '}
          {user.nextMilestone.label}
        </section>
      )}
    </div>
  );
}
