import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, CalendarRange, Activity, NotebookPen, CalendarDays, Pill, FlaskConical, Bot, LogOut } from 'lucide-react';
import * as api from './api';
import type { User } from './types';
import { Dashboard, Calendar, Monitoring, Journal, Appointments, Meds, Records, Agent } from './views';
import { EASE, Reveal } from './ui';
import './styles.css';

type Tab = 'today' | 'calendar' | 'monitoring' | 'journal' | 'appointments' | 'meds' | 'records' | 'agent';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'today', icon: <LayoutDashboard size={16} /> },
  { id: 'calendar', label: 'calendar', icon: <CalendarRange size={16} /> },
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
  // Nu-grammar gate: a full-bleed fuchsia world, the painting floating in it,
  // huge friendly type, one bold white pill. The card-on-sand version is gone.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE, delay },
  });
  return (
    <div
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden p-6"
      style={{ background: 'linear-gradient(160deg, #8E2C86 0%, #B93AAC 55%, #C74BA6 100%)' }}
    >
      <div className="hero-blob hero-blob-a -right-20 top-[-10%] h-[420px] w-[420px]" style={{ background: 'rgba(254,119,254,0.4)' }} />
      <div className="hero-blob hero-blob-b bottom-[-12%] left-[-10%] h-[460px] w-[460px]" style={{ background: 'rgba(119,221,119,0.3)' }} />
      <div className="relative w-full max-w-[360px]">
        <motion.div
          {...rise(0.05)}
          className="mx-auto w-[82%] overflow-hidden rounded-[28px] shadow-2xl shadow-[#5e1758]/50"
          style={{ rotate: -3 }}
        >
          <motion.video
            src="/hummingbird-loop.mp4" poster="/hummingbird-poster.jpg"
            autoPlay muted loop playsInline
            aria-label="Nina's watercolor hummingbird, wings beating"
            className="w-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
        <motion.h1 {...rise(0.18)} className="mt-8 text-[40px] font-light leading-[1.05] tracking-tight text-white">
          your journey,
          <br />
          <span className="text-[#A9EDB1]">together.</span>
        </motion.h1>
        <motion.form {...rise(0.3)} onSubmit={submit} className="mt-8 grid w-full gap-3">
          <input
            type="password" inputMode="numeric" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="passcode" autoFocus
            className="min-h-[50px] w-full rounded-full border border-white/30 bg-white/15 px-4 text-center text-base text-white placeholder:text-white/60 backdrop-blur-sm focus:border-white/70 focus:outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="min-h-[50px] w-full rounded-full bg-white text-[15px] font-semibold text-terracotta-600 shadow-lg shadow-[#5e1758]/30 transition-opacity disabled:opacity-60"
            disabled={busy}
          >
            {busy ? 'checking…' : 'enter'}
          </motion.button>
          {err && <small className="text-center font-medium text-[#A9EDB1]" role="alert">wrong passcode — try again</small>}
        </motion.form>
      </div>
    </div>
  );
}

// Each member gets their own quiet accent — Nina raspberry, Ryan sage, shared
// stays espresso. Colors come from Nina's hummingbird painting.
const USER_PILL: Record<User, string> = { Nina: 'bg-raspberry-500', Ryan: 'bg-sage-600', Both: 'bg-espresso' };
const MEMBER_KEY = 'ivf-member';

function App() {
  const [authed, setAuthed] = useState(Boolean(api.getPass()));
  const [user, setUserState] = useState<User>(() => {
    try {
      const m = localStorage.getItem(MEMBER_KEY);
      return m === 'Ryan' || m === 'Nina' || m === 'Both' ? (m as User) : 'Nina';
    } catch { return 'Nina'; }
  });
  const setUser = (u: User) => {
    setUserState(u);
    try { localStorage.setItem(MEMBER_KEY, u); } catch { /* ignore */ }
  };
  const [tab, setTab] = useState<Tab>('today');

  if (!authed) return <Gate onIn={() => setAuthed(true)} />;

  const logout = () => { api.clearPass(); setAuthed(false); };

  return (
    <div className="mx-auto min-h-screen w-full max-w-[880px] bg-sand px-4 pb-16 pt-6 sm:px-6">
      <nav className="mb-4 flex items-center justify-between gap-3 pb-4">
        <div className="inline-flex items-center gap-2.5 text-[15px] font-medium tracking-tight text-espresso">
          <img src="/icon-192.png" alt="" className="h-7 w-7 rounded-lg" /> nina
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
                <motion.span layoutId="userPill" className={`absolute inset-0 -z-10 rounded-full ${USER_PILL[u]}`} transition={{ duration: 0.4, ease: EASE }} />
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
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          {tab === 'today' && <Dashboard user={user} />}
          {tab === 'calendar' && <Calendar />}
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
