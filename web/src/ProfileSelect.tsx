import { useEffect, useState } from 'react';
import { api } from './api.js';
import type { User } from './types';

export default function ProfileSelect({
  onSelect,
  onNew,
}: {
  onSelect: (u: User) => void;
  onNew: () => void;
}) {
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return (
    <div className="center">
      <div className="profiles">
        <h1>Quem vai estudar?</h1>
        <p className="muted">Escolha seu perfil</p>
        <div className="profile-grid">
          {users?.map((u) => (
            <button key={u.id} className="profile-card" onClick={() => onSelect(u)}>
              <span className="avatar">{u.avatar}</span>
              <span className="pname">{u.name}</span>
              <span className="muted small">
                Dia {u.day}/90 · 🔥 {u.streak}
              </span>
            </button>
          ))}
          <button className="profile-card add" onClick={onNew}>
            <span className="avatar">＋</span>
            <span className="pname">Novo perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
