import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  HeartPulse,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  SunMedium,
} from 'lucide-react';
import './styles.css';

type Feeling = 'soft' | 'hopeful' | 'heavy' | 'anxious' | 'grateful' | 'tender';

type JournalEntry = {
  id: string;
  date: string;
  cycleDay: string;
  phase: string;
  feeling: Feeling;
  energy: number;
  bodyNotes: string;
  heartNotes: string;
  gratitude: string;
  privateLetter: string;
};

type ProtocolStep = {
  title: string;
  description: string;
  status: 'done' | 'active' | 'next';
};

const STORAGE_KEY = 'nina-ivf-journal-v1';

const feelings: { id: Feeling; label: string; tone: string; color: string }[] = [
  { id: 'soft', label: 'Soft', tone: 'Gentle, protected, moving slowly', color: '#f6b7c6' },
  { id: 'hopeful', label: 'Hopeful', tone: 'Open to possibility today', color: '#9e7cff' },
  { id: 'heavy', label: 'Heavy', tone: 'Carrying a lot, needs care', color: '#7487b7' },
  { id: 'anxious', label: 'Anxious', tone: 'Needs grounding and reassurance', color: '#ef8f64' },
  { id: 'grateful', label: 'Grateful', tone: 'Noticing small lights', color: '#57c687' },
  { id: 'tender', label: 'Tender', tone: 'Sensitive, intimate, honest', color: '#d868a7' },
];

const phases = [
  'Stimulation',
  'Monitoring',
  'Trigger',
  'Retrieval',
  'Fertilisation',
  'Transfer',
  'Two-week wait',
  'Rest day',
];

const protocol: ProtocolStep[] = [
  { title: 'Morning body scan', description: 'Symptoms, sleep, medication notes.', status: 'done' },
  { title: 'Emotional check-in', description: 'Name the feeling before the day carries it.', status: 'active' },
  { title: 'Evening letter', description: 'A private page for what could not be said aloud.', status: 'next' },
];

const prompts = [
  'What does my body need me to stop apologising for?',
  'Where did hope show up quietly today?',
  'What would feel nourishing in the next hour?',
  'If today had one gentle truth, what would it be?',
  'What did I survive that deserves to be named?',
];

const affirmations = [
  'You are allowed to be held by softness and science at the same time.',
  'Your body is not failing. It is communicating.',
  'Hope can be quiet and still be real.',
  'You do not have to make this journey look easy.',
  'One honest page is enough for today.',
];

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyEntry = (): JournalEntry => ({
  id: crypto.randomUUID(),
  date: todayISO(),
  cycleDay: '',
  phase: 'Stimulation',
  feeling: 'soft',
  energy: 5,
  bodyNotes: '',
  heartNotes: '',
  gratitude: '',
  privateLetter: '',
});

function loadEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>(loadEntries);
  const [entry, setEntry] = useState<JournalEntry>(() => entries[0] ?? emptyEntry());
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const selectedFeeling = feelings.find((item) => item.id === entry.feeling) ?? feelings[0];
  const completedDays = useMemo(() => new Set(entries.map((item) => item.date)).size, [entries]);
  const averageEnergy = useMemo(() => {
    if (!entries.length) return 0;
    return Math.round((entries.reduce((sum, item) => sum + Number(item.energy), 0) / entries.length) * 10) / 10;
  }, [entries]);
  const currentPhaseIndex = Math.max(0, phases.indexOf(entry.phase));
  const progress = Math.round(((currentPhaseIndex + 1) / phases.length) * 100);
  const emotionalStreak = Math.min(completedDays, 14);
  const prompt = prompts[Number(entry.date.replace(/-/g, '').slice(-2)) % prompts.length];

  const saveEntry = () => {
    setEntries((current) => {
      const withoutSameDate = current.filter((item) => item.date !== entry.date);
      return [entry, ...withoutSameDate].sort((a, b) => b.date.localeCompare(a.date));
    });
    setSavedPulse(true);
    window.setTimeout(() => setSavedPulse(false), 1600);
  };

  const startNewDay = () => setEntry(emptyEntry());

  const exportJournal = () => {
    const payload = JSON.stringify(entries, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nina-ivf-journal-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <nav className="topbar" aria-label="Nina app navigation">
        <div className="brand-mark"><span>N</span> Nina</div>
        <div className="nav-links"><a href="#journal">Journal</a><a href="#care">Care plan</a><a href="#insights">Insights</a></div>
        <button className="nav-cta"><LockKeyhole size={15} /> Private vault</button>
      </nav>

      <section className="hero-section">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> IVF companion for the days between answers</span>
          <h1><span>Clinical clarity.</span><span>Emotional</span><span>softness.</span><span>A private world</span><span>for Nina.</span></h1>
          <p>
            A premium journaling companion for IVF: track treatment days, symptoms, feelings, letters, and the tiny signals that matter.
          </p>
          <div className="hero-actions">
            <button onClick={startNewDay} className="primary-button">Start today <ChevronRight size={17} /></button>
            <button onClick={exportJournal} className="secondary-button"><Download size={16} /> Export journal</button>
          </div>
          <div className="trust-row">
            <span><ShieldCheck size={15} /> Local-first privacy</span>
            <span><Stethoscope size={15} /> Appointment-ready notes</span>
            <span><Moon size={15} /> Designed for tender days</span>
          </div>
        </div>
        <div className="phone-stage" aria-label="premium product preview">
          <div className="phone-frame">
            <div className="phone-status"><span>Today</span><strong>{entry.phase}</strong></div>
            <div className="portrait-card"><img src="/nina-sun.png" alt="Nina in warm sunlight" /></div>
            <div className="mini-insight">
              <span style={{ backgroundColor: selectedFeeling.color }} />
              <div><strong>{selectedFeeling.label}</strong><small>{selectedFeeling.tone}</small></div>
            </div>
            <div className="progress-chip"><SunMedium size={16} /> {progress}% through this mapped journey</div>
          </div>
        </div>
      </section>

      <section className="metrics-strip" id="insights">
        <article><CalendarDays /><strong>{completedDays}</strong><span>journaled days</span></article>
        <article><HeartPulse /><strong>{entries.length}</strong><span>private reflections</span></article>
        <article><Activity /><strong>{averageEnergy || '—'}</strong><span>average energy</span></article>
        <article><CheckCircle2 /><strong>{emotionalStreak}/14</strong><span>care consistency</span></article>
      </section>

      <section className="command-grid">
        <aside className="care-plan" id="care">
          <div className="panel-heading">
            <span>Care protocol</span>
            <h2>Today’s gentle operating system</h2>
          </div>
          <div className="journey-meter" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
            <div><strong>{progress}%</strong><span>{entry.phase}</span></div>
          </div>
          <div className="protocol-list">
            {protocol.map((step) => (
              <div className={`protocol-step ${step.status}`} key={step.title}>
                <span />
                <div><strong>{step.title}</strong><p>{step.description}</p></div>
              </div>
            ))}
          </div>
          <div className="premium-note">
            <Bell size={18} />
            <p><strong>Commercial-ready idea:</strong> reminders, partner updates, PDF doctor export, encrypted cloud sync, and premium guided journals.</p>
          </div>
        </aside>

        <form className="journal-panel" id="journal" onSubmit={(event) => { event.preventDefault(); saveEntry(); }}>
          <div className="panel-heading split-heading">
            <div><span>Daily journal</span><h2>How is Nina, really?</h2></div>
            {savedPulse && <small className="saved-pill"><CheckCircle2 size={14} /> Saved</small>}
          </div>

          <div className="form-grid two">
            <label>Date<input type="date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} /></label>
            <label>Treatment day<input placeholder="Day 7, transfer +2..." value={entry.cycleDay} onChange={(event) => setEntry({ ...entry, cycleDay: event.target.value })} /></label>
          </div>

          <label>Journey phase<select value={entry.phase} onChange={(event) => setEntry({ ...entry, phase: event.target.value })}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select></label>

          <fieldset className="feeling-grid">
            <legend>Emotional weather</legend>
            {feelings.map((feeling) => (
              <button key={feeling.id} type="button" className={entry.feeling === feeling.id ? 'feeling active' : 'feeling'} onClick={() => setEntry({ ...entry, feeling: feeling.id })}>
                <span style={{ backgroundColor: feeling.color }} /> {feeling.label}
              </button>
            ))}
          </fieldset>

          <label className="range-label">Energy: {entry.energy}/10<input type="range" min="1" max="10" value={entry.energy} onChange={(event) => setEntry({ ...entry, energy: Number(event.target.value) })} /></label>

          <div className="prompt-banner"><Sparkles size={16} /><span>{prompt}</span></div>
          <label>Body notes<textarea placeholder="Symptoms, appointments, medication, sleep, food, tenderness..." value={entry.bodyNotes} onChange={(event) => setEntry({ ...entry, bodyNotes: event.target.value })} /></label>
          <label>Heart notes<textarea placeholder="What felt fragile, beautiful, frustrating, or brave today?" value={entry.heartNotes} onChange={(event) => setEntry({ ...entry, heartNotes: event.target.value })} /></label>
          <label>One small gratitude<input placeholder="A warm drink, a kind message, a calm minute..." value={entry.gratitude} onChange={(event) => setEntry({ ...entry, gratitude: event.target.value })} /></label>
          <label>Private letter<textarea placeholder="Dear future me..." value={entry.privateLetter} onChange={(event) => setEntry({ ...entry, privateLetter: event.target.value })} /></label>

          <button className="primary-button wide" type="submit">Save today’s page</button>
        </form>

        <aside className="memory-panel">
          <div className="quote-card">
            <Moon />
            <span>{selectedFeeling.tone}</span>
            <strong>{affirmations[entries.length % affirmations.length]}</strong>
          </div>
          <div className="timeline-card">
            <span>Recent pages</span>
            {entries.length === 0 ? <p>No entries yet. Start with today.</p> : entries.slice(0, 7).map((item) => (
              <button key={item.id} onClick={() => setEntry(item)}>
                <strong>{item.date}</strong>
                <small>{item.phase} · {item.feeling} · energy {item.energy}/10</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
