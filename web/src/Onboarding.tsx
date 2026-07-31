import { useState, type FormEvent } from 'react';
import { api } from './api.js';
import type { User } from './types';

const LEVELS = ['Básico', 'Intermediário', 'Avançado'];

export default function Onboarding({
  onCreated,
  onCancel,
}: {
  onCreated: (u: User) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('Intermediário');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const u = await api.createUser({ name: name.trim(), level });
      onCreated(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card form" onSubmit={submit}>
        <h1>Criar perfil</h1>
        <p className="muted">Seu plano de 90 dias começa hoje.</p>

        <label>Nome</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome"
        />

        <label>Nível de inglês</label>
        <div className="chips">
          {LEVELS.map((l) => (
            <button
              type="button"
              key={l}
              className={`chip ${level === l ? 'sel' : ''}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>

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
