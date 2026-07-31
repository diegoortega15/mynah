import { useEffect, useState } from 'react';
import { api } from './api.js';
import type { User } from './types';
import AiSettings from './AiSettings.jsx';
import VoiceSettings from './VoiceSettings.jsx';

const LEVELS = ['Básico', 'Intermediário', 'Avançado'];
const AVATARS = ['🧑', '👩', '👨', '🧕', '👧', '🦸', '🐨', '🦊', '🐼', '🦉', '🐯', '🐧'];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface ProfileStats {
  cards: number;
  reviews: number;
  writings: number;
  dialogues: number;
  speaking: number;
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
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    api.profileStats(user.id).then(setStats).catch(() => {});
  }, [user.id]);

  const dirty =
    name !== user.name || level !== user.level || avatar !== user.avatar || startDate !== user.start_date;

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const updated = await api.updateUser(user.id, { name, level, avatar, start_date: startDate });
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
      <h1>⚙️ Perfil</h1>

      <section className="card">
        <h2>Dados</h2>

        <label>Avatar</label>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button key={a} className={`av ${avatar === a ? 'sel' : ''}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>

        <label>Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />

        <label>Nível</label>
        <div className="chips">
          {LEVELS.map((l) => (
            <button key={l} className={`chip ${level === l ? 'sel' : ''}`} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>

        <label>Início do plano (Dia 1)</label>
        <div className="row">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <button
            className="ghost"
            onClick={() => setStartDate(new Date().toLocaleDateString('en-CA'))}
          >
            Recomeçar hoje
          </button>
        </div>
        <span className="muted small">Você está no dia {user.day}/90 · Fase {user.phase.n}.</span>

        <div className="row end">
          {msg && <span className="small">{msg}</span>}
          <button className="primary" onClick={save} disabled={busy || !dirty || !name.trim()}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
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
