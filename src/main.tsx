import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Activity, NotebookPen, CalendarDays, Pill, FlaskConical, Bot, LogOut } from 'lucide-react';
import * as api from './api';
import type { User } from './types';
import { Dashboard, Monitoring, Journal, Appointments, Meds, Records, Agent } from './views';
import { EASE, Reveal } from './ui';
import './styles.css';

type Tab = 'today' | 'monitoring' | 'journal' | 'appointments' | 'meds' | 'records' | 'agent';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'today', icon: <LayoutDashboard size={16} /> },
  { id: 'monitoring', label: 'monitoring', icon: <Activity size={16} /> },
  { id: 'journal', label: 'journal', icon: <NotebookPen size={16} /> },
  { id: 'appointments', label: 'appts', icon: <CalendarDays size={16} /> },
  { id: 'meds', label: 'meds', icon: <Pill size={16} /> },
  { id: 'records', label: 'labs', icon: <FlaskConical size={16} /> },
  { id: 'agent', label: 'dr. sherpa', icon: <Bot size={16} /> },
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
    <div className="grid min-h-screen place-items-center bg-sand p-6">
      <Reveal className="grid w-full max-w-[360px] justify-items-center gap-2 rounded-2xl bg-white p-10 text-center card-inset">
        <img src="/icon.svg" alt="nina" className="h-12 w-12 rounded-xl" />
        <h1 className="mt-4 text-2xl font-light tracking-tight text-espresso">nina</h1>
        <p className="mb-4 text-sm text-taupe-500">your private IVF companion.</p>
        <form onSubmit={submit} className="grid w-full gap-2.5">
          <input
            type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="passcode" autoFocus
            className="min-h-[46px] w-full rounded-xl px-4 text-center text-sm text-espresso card-inset focus:shadow-[inset_0_0_0_1.5px_theme(colors.terracotta.400)]"
          />
          <button
            className="min-h-[46px] w-full rounded-xl bg-espresso text-sm font-medium text-white transition-opacity disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'checking…' : 'enter'}
          </button>
          {err && <small className="text-terracotta-500">wrong passcode</small>}
        </form>
      </Reveal>
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
    <div className="mx-auto min-h-screen w-full max-w-[880px] bg-sand px-4 pb-16 pt-6 sm:px-6">
      <nav className="mb-4 flex items-center justify-between gap-3 pb-4">
        <div className="inline-flex items-center gap-2.5 text-[15px] font-medium tracking-tight text-espresso">
          <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" /> nina
        </div>
        <div className="flex gap-0.5 rounded-full bg-white p-0.5 card-inset">
          {(['Ryan', 'Nina', 'Both'] as User[]).map((u) => (
            <button
              key={u}
              onClick={() => setUser(u)}
              className={`relative z-10 min-h-[34px] rounded-full px-3.5 text-xs font-medium transition-colors duration-300 ${
                user === u ? 'text-white' : 'text-taupe-500 hover:text-espresso'
              }`}
            >
              {user === u && (
                <motion.span layoutId="userPill" className="absolute inset-0 -z-10 rounded-full bg-espresso" transition={{ duration: 0.4, ease: EASE }} />
              )}
              {u === 'Both' ? 'shared' : u.toLowerCase()}
            </button>
          ))}
        </div>
        <button onClick={logout} aria-label="log out" className="grid h-9 w-9 place-items-center rounded-full text-taupe-500 transition-colors hover:bg-white hover:text-espresso">
          <LogOut size={16} />
        </button>
      </nav>

      <div className="no-scrollbar relative mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 card-inset">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative z-10 flex min-h-[42px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium transition-colors duration-300 ${
              tab === t.id ? 'text-white' : 'text-taupe-500 hover:text-espresso'
            }`}
          >
            {tab === t.id && (
              <motion.div layoutId="activeTab" className="absolute inset-0 -z-10 rounded-xl bg-espresso" transition={{ duration: 0.5, ease: EASE }} />
            )}
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {tab === 'today' && <Dashboard user={user} />}
          {tab === 'monitoring' && <Monitoring />}
          {tab === 'journal' && <Journal user={user} />}
          {tab === 'appointments' && <Appointments />}
          {tab === 'meds' && <Meds />}
          {tab === 'records' && <Records />}
          {tab === 'agent' && <Agent user={user} />}
        </motion.main>
      </AnimatePresence>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// Register the offline service worker in production (installable PWA).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
