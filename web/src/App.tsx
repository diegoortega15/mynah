import { useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import type { User } from './types';
import ProfileSelect from './ProfileSelect.jsx';
import Onboarding from './Onboarding.jsx';
import Dashboard from './Dashboard.jsx';
import Vocab from './Vocab.jsx';
import Writing from './Writing.jsx';
import Listening from './Listening.jsx';
import Speaking from './features/speaking/Speaking.jsx';
import Settings from './Settings.jsx';
import Help from './Help.jsx';
import History from './History.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

const LS_KEY = 'fluencylab.userId';

const NAV = [
  { label: 'Início', icon: '🏠', path: '/' },
  { label: 'Ouvir', icon: '🎧', path: '/listening' },
  { label: 'Vocabulário', icon: '🗂️', path: '/vocab' },
  { label: 'Fala', icon: '🗣️', path: '/speaking' },
  { label: 'Escrita', icon: '✍️', path: '/writing' },
  { label: 'Histórico', icon: '📅', path: '/history' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem(LS_KEY);
    if (!id) return setBooting(false);
    api
      .getUser(id)
      .then((u) => setUser(u))
      .catch(() => localStorage.removeItem(LS_KEY))
      .finally(() => setBooting(false));
  }, []);

  function chooseUser(u: User) {
    localStorage.setItem(LS_KEY, String(u.id));
    setUser(u);
    navigate('/');
  }
  function logout() {
    localStorage.removeItem(LS_KEY);
    setUser(null);
    setOnboarding(false);
    navigate('/');
  }
  async function refreshUser() {
    if (user) setUser(await api.getUser(user.id));
  }

  if (booting) return <div className="center muted">Carregando…</div>;

  if (!user) {
    if (onboarding)
      return <Onboarding onCreated={chooseUser} onCancel={() => setOnboarding(false)} />;
    return <ProfileSelect onSelect={chooseUser} onNew={() => setOnboarding(true)} />;
  }

  const navItem = (to: string, icon: string, label: string, end = false) => (
    <NavLink key={to} to={to} end={end} className="side-item" title={label}>
      <span className="side-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="side-label">{label}</span>
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="side-icon" aria-hidden="true">
            🐦
          </span>
          <span className="side-label brand-label">Mynah</span>
        </div>
        <nav className="side-nav" aria-label="Navegação principal">
          {NAV.map((n) => navItem(n.path, n.icon, n.label, n.path === '/'))}
        </nav>
        <div className="side-bottom">
          {navItem('/help', '❓', 'Ajuda')}
          {navItem('/settings', user.avatar, user.name)}
        </div>
      </aside>

      <main className="main">
        <div className="content">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Dashboard user={user} />} />
              <Route path="/listening" element={<Listening user={user} />} />
              <Route path="/vocab" element={<Vocab user={user} onProgress={refreshUser} />} />
              <Route path="/speaking" element={<Speaking user={user} />} />
              <Route path="/writing" element={<Writing user={user} />} />
              <Route path="/history" element={<History user={user} />} />
              <Route
                path="/settings"
                element={
                  <Settings user={user} onUpdated={setUser} onLogout={logout} onDeleted={logout} />
                }
              />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
