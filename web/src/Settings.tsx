import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import type { User, PlacementRow } from './types';
import { getThemePref, setThemePref, type ThemePref } from './theme.js';
import HelpTip from './HelpTip.jsx';
import AiSettings from './AiSettings.jsx';
import VoiceSettings from './VoiceSettings.jsx';
import Placement from './Placement.jsx';
import { fmtWhen } from './format.js';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'auto', label: '🌗 Auto (sistema)' },
  { value: 'light', label: '☀️ Claro' },
  { value: 'dark', label: '🌙 Escuro' },
];

const DEFAULT_TARGETS = { listen: 1, vocab: 20, speak: 2, write: 1 };
const TARGET_FIELDS = [
  { key: 'listen' as const, label: '🎧 Diálogos/vídeos', min: 1, max: 5 },
  { key: 'vocab' as const, label: '🗂️ Cards', min: 5, max: 100 },
  { key: 'speak' as const, label: '🗣️ Práticas de fala', min: 1, max: 10 },
  { key: 'write' as const, label: '✍️ Textos', min: 1, max: 5 },
];

import { LEVELS } from './levels.js';
const FOCUS_PRESETS = [
  'trabalho, carreira e tecnologia',
  'viagens e situações do dia a dia',
  'escola, amigos e hobbies',
  'faculdade e textos acadêmicos',
  'filmes, séries e cultura pop',
];
const AVOID_PRESETS = ['violência', 'namoro e romance', 'bebida e drogas', 'política', 'religião'];
const AVATARS = ['🧑', '👩', '👨', '🧕', '👧', '🦸', '🐨', '🦊', '🐼', '🦉', '🐯', '🐧'];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ProfileStats {
  cards: number;
  reviews: number;
  writings: number;
  dialogues: number;
  speaking: number;
  levelTarget?: string; // CEFR the AI is currently generating for
}

export default function Settings({
  user,
  onUpdated,
  onLogout,
  onDeleted,
}: {
  user: User;
  onUpdated: (u: User) => void;
  onLogout: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [level, setLevel] = useState(user.level);
  const [avatar, setAvatar] = useState(user.avatar);
  const [startDate, setStartDate] = useState(user.start_date);
  const [age, setAge] = useState(user.age == null ? '' : String(user.age));
  const [focus, setFocus] = useState(user.focus ?? '');
  const [avoid, setAvoid] = useState(user.avoid_topics ?? '');
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [targets, setTargets] = useState({ ...DEFAULT_TARGETS, ...(user.targets ?? {}) });
  const [targetsMsg, setTargetsMsg] = useState('');
  const [targetsBusy, setTargetsBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastPlacement, setLastPlacement] = useState<PlacementRow | null>(null);

  const loadPlacements = useCallback(() => {
    api
      .listPlacements(user.id)
      .then((rows) => setLastPlacement(rows[0] ?? null))
      .catch(() => {});
  }, [user.id]);

  useEffect(() => {
    api.profileStats(user.id).then(setStats).catch(() => {});
    loadPlacements();
  }, [user.id, loadPlacements]);

  // The test writes the level straight to the profile, so pull it back in.
  async function afterPlacement() {
    setTesting(false);
    loadPlacements();
    try {
      const fresh = await api.getUser(user.id);
      setLevel(fresh.level);
      onUpdated(fresh);
    } catch {
      /* o nível continua o que estava na tela */
    }
  }

  if (testing) {
    return <Placement userId={user.id} onApply={afterPlacement} onClose={afterPlacement} />;
  }

  const dirty =
    name !== user.name ||
    level !== user.level ||
    avatar !== user.avatar ||
    startDate !== user.start_date ||
    age !== (user.age == null ? '' : String(user.age)) ||
    focus !== (user.focus ?? '') ||
    avoid !== (user.avoid_topics ?? '');

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const updated = await api.updateUser(user.id, {
        name,
        level,
        avatar,
        start_date: startDate,
        age: age.trim() === '' ? null : Number(age),
        focus,
        avoid_topics: avoid,
      });
      onUpdated(updated);
      setMsg('✅ Perfil salvo.');
    } catch (e) {
      setMsg('❌ ' + errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await api.deleteUser(user.id);
      onDeleted();
    } catch (e) {
      setMsg('❌ ' + errMsg(e));
      setBusy(false);
    }
  }

  return (
    <div className="settings">
      <h1>⚙️ Perfil <HelpTip topic="profile" /></h1>

      <section className="card">
        <h2>Dados</h2>

        <span className="field-label" id="set-avatar">Avatar</span>
        <div className="avatar-grid" role="group" aria-labelledby="set-avatar">
          {AVATARS.map((a) => (
            <button key={a} className={`av ${avatar === a ? 'sel' : ''}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>

        <label htmlFor="set-name">Nome</label>
        <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />

        <span className="field-label" id="set-level">Nível de inglês (CEFR)</span>
        <div className="level-grid" role="group" aria-labelledby="set-level">
          {LEVELS.map((l) => (
            <button
              key={l.code}
              className={`level-opt ${level === l.code ? 'sel' : ''}`}
              onClick={() => setLevel(l.code)}
            >
              <span className="lv-code">{l.code}</span>
              <span className="lv-name">{l.name}</span>
              <span className="lv-hint muted small">{l.hint}</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          Material muito difícil? <strong>Baixe um nível</strong> — o conteúdo gerado passa a usar
          frases e vocabulário mais simples na hora.
          {stats?.levelTarget && (
            <>
              {' '}Alvo atual do conteúdo: <strong>{stats.levelTarget}</strong> (sobe sozinho
              conforme você evolui, a partir do nível escolhido).
            </>
          )}
        </p>
        <div className="row gen">
          <button className="ghost" onClick={() => setTesting(true)}>
            🎯 Descobrir meu nível (teste de 8 min)
          </button>
          {lastPlacement && (
            <span className="muted small">
              Último teste: <strong>{lastPlacement.result_cefr}</strong> em{' '}
              {fmtWhen(lastPlacement.created_at)}
            </span>
          )}
        </div>

        <h2>Sobre o conteúdo gerado</h2>
        <p className="muted small">
          Estes três campos entram em <strong>todas</strong> as chamadas de IA: diálogos, textos,
          cards, tutor, roleplay e correções.
        </p>

        <label htmlFor="set-age">Idade</label>
        <div className="row">
          <input
            id="set-age"
            type="number"
            min={3}
            max={120}
            value={age}
            placeholder="opcional"
            onChange={(e) => setAge(e.target.value)}
            style={{ maxWidth: 120 }}
          />
          {Number(age) > 0 && Number(age) < 18 && (
            <span className="muted small">
              Menor de 18: o app já bloqueia sozinho temas adultos (violência, romance, bebida,
              drogas, jogo), mesmo sem você listar nada abaixo.
            </span>
          )}
        </div>

        <label htmlFor="set-focus">Foco do conteúdo</label>
        <input
          id="set-focus"
          value={focus}
          placeholder="trabalho, carreira e tecnologia (padrão)"
          onChange={(e) => setFocus(e.target.value)}
        />
        <div className="chips">
          {FOCUS_PRESETS.map((f) => (
            <button key={f} className={`chip ${focus === f ? 'sel' : ''}`} onClick={() => setFocus(f)}>
              {f}
            </button>
          ))}
        </div>

        <label htmlFor="set-avoid">Temas a evitar</label>
        <input
          id="set-avoid"
          value={avoid}
          placeholder="separe por vírgula — ex: violência, política"
          onChange={(e) => setAvoid(e.target.value)}
        />
        <div className="chips">
          {AVOID_PRESETS.map((a) => (
            <button
              key={a}
              className="chip"
              onClick={() =>
                setAvoid((v) => (v.toLowerCase().includes(a) ? v : [v, a].filter(Boolean).join(', ')))
              }
            >
              + {a}
            </button>
          ))}
        </div>
        <p className="muted small">
          ⚠️ Isso é uma <strong>instrução</strong> para a IA, não um filtro garantido: reduz muito a
          chance de aparecer o que você listou, mas não elimina. E não alcança o YouTube — lá o vídeo
          é escolhido por quem está usando.
        </p>
        <label htmlFor="set-start">Início do plano (Dia 1)</label>
        <div className="row">
          <input
            id="set-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <button
            className="ghost"
            onClick={() => setStartDate(new Date().toLocaleDateString('en-CA'))}
          >
            Recomeçar hoje
          </button>
        </div>
        <span className="muted small">
          Você está no dia {user.day}/90 · Fase {user.phase.n}.
          {user.skippedDays > 0 && (
            <>
              {' '}O plano conta <strong>dias estudados</strong> ({user.studiedDays} até agora), não
              dias de calendário — já se passaram {user.elapsedDays} dias desde o início. Pular não
              te empurra para um conteúdo que você ainda não construiu.
            </>
          )}
        </span>

        <div className="row end">
          {msg && <span className="small">{msg}</span>}
          <button className="primary" onClick={save} disabled={busy || !dirty || !name.trim()}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>🎯 Metas diárias</h2>
        <p className="muted small">
          O padrão segue o plano de 1h/dia. Numa fase corrida, reduza — constância vale mais que
          volume. O dia conclui (e o streak conta) ao bater as 4 metas.
        </p>
        <div className="targets-grid">
          {TARGET_FIELDS.map((f) => (
            <label key={f.key} className="target-field">
              {f.label}
              <input
                type="number"
                min={f.min}
                max={f.max}
                value={targets[f.key]}
                onChange={(e) =>
                  setTargets((t) => ({ ...t, [f.key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
        </div>
        <div className="row end">
          {targetsMsg && <span className="small">{targetsMsg}</span>}
          <button
            className="primary"
            disabled={targetsBusy}
            onClick={async () => {
              if (targetsBusy) return;
              setTargetsBusy(true);
              setTargetsMsg('');
              const clamped = Object.fromEntries(
                TARGET_FIELDS.map((f) => [
                  f.key,
                  Math.max(f.min, Math.min(f.max, Math.round(targets[f.key]) || f.min)),
                ])
              ) as typeof targets;
              setTargets(clamped);
              try {
                const updated = await api.updateUser(user.id, { targets: clamped });
                onUpdated(updated);
                setTargetsMsg('✅ Metas salvas.');
              } catch (e) {
                setTargetsMsg('❌ ' + errMsg(e));
              } finally {
                setTargetsBusy(false);
              }
            }}
          >
            {targetsBusy ? 'Salvando…' : 'Salvar metas'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>🎨 Aparência</h2>
        <span className="field-label" id="set-theme">Tema</span>
        <div className="chips" role="group" aria-labelledby="set-theme">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.value}
              className={`chip ${theme === t.value ? 'sel' : ''}`}
              onClick={() => {
                setTheme(t.value);
                setThemePref(t.value);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <VoiceSettings />

      <AiSettings />

      <section className="card">
        <h2>Seu progresso</h2>
        <div className="stat-grid">
          <Stat n={user.streak} label="streak 🔥" />
          <Stat n={user.longest_streak} label="melhor streak" />
          <Stat n={stats?.cards ?? '—'} label="cards" />
          <Stat n={stats?.reviews ?? '—'} label="revisões" />
          <Stat n={stats?.writings ?? '—'} label="escritas" />
          <Stat n={stats?.dialogues ?? '—'} label="diálogos" />
          <Stat n={stats?.speaking ?? '—'} label="falas" />
        </div>
      </section>

      <section className="card danger-zone">
        <h2>Conta</h2>
        <div className="row between">
          <div>
            <strong>Trocar de perfil</strong>
            <p className="muted small">Volta pra tela de seleção.</p>
          </div>
          <button className="ghost" onClick={onLogout}>Trocar</button>
        </div>
        <div className="row between">
          <div>
            <strong className="danger">Excluir perfil</strong>
            <p className="muted small">Apaga todos os dados deste perfil. Não dá pra desfazer.</p>
          </div>
          {confirmDel ? (
            <div className="row">
              <button className="ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
              <button className="danger-btn" onClick={del} disabled={busy}>Confirmar exclusão</button>
            </div>
          ) : (
            <button className="danger-btn" onClick={() => setConfirmDel(true)}>Excluir</button>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{n}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}
