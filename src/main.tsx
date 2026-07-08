import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LayoutDashboard, Activity, NotebookPen, CalendarDays, Pill, Bot, LogOut } from 'lucide-react';
import * as api from './api';
import type { User } from './types';
import { Dashboard, Monitoring, Journal, Appointments, Meds, Agent } from './views';
import './styles.css';

type Tab = 'today' | 'monitoring' | 'journal' | 'appointments' | 'meds' | 'agent';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'today', icon: <LayoutDashboard size={17} /> },
  { id: 'monitoring', label: 'monitoring', icon: <Activity size={17} /> },
  { id: 'journal', label: 'journal', icon: <NotebookPen size={17} /> },
  { id: 'appointments', label: 'appts', icon: <CalendarDays size={17} /> },
  { id: 'meds', label: 'meds', icon: <Pill size={17} /> },
  { id: 'agent', label: 'dr. sherpa', icon: <Bot size={17} /> },
];

function Gate({ onIn }: { onIn: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(false);
    const ok = await api.login(pass);
    setBusy(false);
    if (ok) onIn();
    else setErr(true);
  };
  return (
    <div className="gate">
      <div className="gate-card">
        <img src="/nina-icon.svg" alt="nina" />
        <h1>nina</h1>
        <p>your private IVF companion.</p>
        <form onSubmit={submit}>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="passcode" autoFocus />
          <button className="primary-button wide" disabled={busy}>{busy ? 'checking…' : 'enter'}</button>
          {err && <small className="bad">wrong passcode</small>}
        </form>
      </div>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(Boolean(api.getPass()));
  const [user, setUser] = useState<User>('Nina');
  const [tab, setTab] = useState<Tab>('today');

  if (!authed) return <Gate onIn={() => setAuthed(true)} />;

  const logout = () => { api.clearPass(); setAuthed(false); };

  return (
    <div className="app">
      <nav className="topbar">
        <div className="brand-mark"><img src="/nina-icon.svg" alt="" /> nina</div>
        <div className="user-switch">
          {(['Ryan', 'Nina', 'Both'] as User[]).map((u) => (
            <button key={u} className={user === u ? 'active' : ''} onClick={() => setUser(u)}>
              {u === 'Both' ? 'shared' : u.toLowerCase()}
            </button>
          ))}
        </div>
        <button className="logout" onClick={logout} aria-label="log out"><LogOut size={16} /></button>
      </nav>

      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>

      <main className="content">
        {tab === 'today' && <Dashboard user={user} />}
        {tab === 'monitoring' && <Monitoring />}
        {tab === 'journal' && <Journal user={user} />}
        {tab === 'appointments' && <Appointments />}
        {tab === 'meds' && <Meds />}
        {tab === 'agent' && <Agent user={user} />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
