import { useState, type FormEvent } from 'react';
import { api } from './api.js';
import { LEVELS } from './levels.js';
import Placement from './Placement.jsx';
import type { User } from './types';

export default function Onboarding({
  onCreated,
  onCancel,
}: {
  onCreated: (u: User) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('B1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<User | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      // The profile is created first; the test is offered right after, so the
      // self-declared level is a starting point rather than a final answer.
      setCreated(await api.createUser({ name: name.trim(), level }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  // Finish onboarding, re-reading the profile in case the test changed the level.
  async function finish(u: User) {
    try {
      onCreated(await api.getUser(u.id));
    } catch {
      onCreated(u);
    }
  }

  if (created) {
    return (
      <div className="center">
        <div className="onboard-placement">
          <Placement
            userId={created.id}
            onApply={() => finish(created)}
            onClose={() => finish(created)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="center">
      <form className="card form" onSubmit={submit}>
        <h1>Criar perfil</h1>
        <p className="muted">Seu plano de 90 dias começa hoje.</p>

        <label htmlFor="ob-name">Nome</label>
        <input
          id="ob-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
        />

        <span className="field-label" id="ob-level">Nível de inglês (CEFR)</span>
        <div className="level-grid" role="group" aria-labelledby="ob-level">
          {LEVELS.map((l) => (
            <button
              type="button"
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
          Na dúvida, escolha o <strong>mais baixo</strong>: material fácil demais você avança rápido;
          difícil demais desanima. <strong>Não sabe?</strong> Escolha qualquer um — logo depois de
          criar o perfil eu ofereço um teste de 8 minutos para descobrir, e dá pra mudar quando
          quiser no Perfil.
        </p>

        {error && <p className="error">{error}</p>}

        <div className="row">
          <button type="button" className="ghost" onClick={onCancel}>
            Voltar
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Criando…' : 'Começar'}
          </button>
        </div>
      </form>
    </div>
  );
}
