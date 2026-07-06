import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Download, Heart, LockKeyhole, Moon, Sparkles, SunMedium } from 'lucide-react';
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

const STORAGE_KEY = 'nina-ivf-journal-v1';

const feelings: { id: Feeling; label: string; tone: string }[] = [
  { id: 'soft', label: 'Soft', tone: 'Gentle, protected, moving slowly' },
  { id: 'hopeful', label: 'Hopeful', tone: 'Open to possibility today' },
  { id: 'heavy', label: 'Heavy', tone: 'Carrying a lot, needs care' },
  { id: 'anxious', label: 'Anxious', tone: 'Needs grounding and reassurance' },
  { id: 'grateful', label: 'Grateful', tone: 'Noticing small lights' },
  { id: 'tender', label: 'Tender', tone: 'Sensitive, intimate, honest' },
];

const phases = ['Stimulation', 'Monitoring', 'Trigger', 'Retrieval', 'Fertilisation', 'Transfer', 'Two-week wait', 'Rest day'];

const prompts = [
  'What did my body ask for today?',
  'What feeling did I try to hide?',
  'What tiny moment made this day easier?',
  'What would I say to Nina if she were my best friend?',
];

const affirmations = [
  'One day at a time is still progress.',
  'My body is not a project. It is my home.',
  'Hope can be quiet and still be real.',
  'I am allowed to be both scared and strong.',
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const selectedFeeling = feelings.find((item) => item.id === entry.feeling) ?? feelings[0];
  const completedDays = useMemo(() => new Set(entries.map((item) => item.date)).size, [entries]);
  const averageEnergy = useMemo(() => {
    if (!entries.length) return 0;
    return Math.round((entries.reduce((sum, item) => sum + Number(item.energy), 0) / entries.length) * 10) / 10;
  }, [entries]);

  const saveEntry = () => {
    setEntries((current) => {
      const withoutSameDate = current.filter((item) => item.date !== entry.date);
      return [entry, ...withoutSameDate].sort((a, b) => b.date.localeCompare(a.date));
    });
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
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> Nina's IVF companion</span>
          <h1>A softer place to hold every day, every feeling, every hopeful step.</h1>
          <p>
            Private day-by-day journaling for treatment notes, emotional check-ins, gratitude, and letters to the future.
          </p>
          <div className="hero-actions">
            <button onClick={startNewDay} className="primary-button">New day</button>
            <button onClick={exportJournal} className="ghost-button"><Download size={16} /> Export</button>
          </div>
        </div>
        <div className="moon-card" aria-label="privacy promise">
          <LockKeyhole size={22} />
          <strong>Private by design</strong>
          <span>Entries stay on this device for now. No account. No cloud. No pressure.</span>
        </div>
      </section>

      <section className="stats-grid">
        <article><CalendarDays /><strong>{completedDays}</strong><span>journaled days</span></article>
        <article><Heart /><strong>{entries.length}</strong><span>saved reflections</span></article>
        <article><SunMedium /><strong>{averageEnergy || '—'}</strong><span>avg energy</span></article>
      </section>

      <section className="workspace">
        <form className="journal-card" onSubmit={(event) => { event.preventDefault(); saveEntry(); }}>
          <div className="section-heading">
            <span>Today's page</span>
            <h2>How is Nina, really?</h2>
          </div>

          <div className="two-columns">
            <label>Date<input type="date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} /></label>
            <label>Cycle / treatment day<input placeholder="Day 7, transfer +2..." value={entry.cycleDay} onChange={(event) => setEntry({ ...entry, cycleDay: event.target.value })} /></label>
          </div>

          <label>Phase<select value={entry.phase} onChange={(event) => setEntry({ ...entry, phase: event.target.value })}>{phases.map((phase) => <option key={phase}>{phase}</option>)}</select></label>

          <fieldset className="feeling-grid">
            <legend>Feeling today</legend>
            {feelings.map((feeling) => (
              <button key={feeling.id} type="button" className={entry.feeling === feeling.id ? 'feeling active' : 'feeling'} onClick={() => setEntry({ ...entry, feeling: feeling.id })}>
                {feeling.label}
              </button>
            ))}
          </fieldset>

          <label>Energy: {entry.energy}/10<input type="range" min="1" max="10" value={entry.energy} onChange={(event) => setEntry({ ...entry, energy: Number(event.target.value) })} /></label>
          <label>Body notes<textarea placeholder="Symptoms, appointments, medication, sleep, food, tenderness..." value={entry.bodyNotes} onChange={(event) => setEntry({ ...entry, bodyNotes: event.target.value })} /></label>
          <label>Heart notes<textarea placeholder="What felt fragile, beautiful, frustrating, or brave today?" value={entry.heartNotes} onChange={(event) => setEntry({ ...entry, heartNotes: event.target.value })} /></label>
          <label>One small gratitude<input placeholder="A warm drink, a kind message, a calm minute..." value={entry.gratitude} onChange={(event) => setEntry({ ...entry, gratitude: event.target.value })} /></label>
          <label>Private letter<textarea placeholder="Dear future me..." value={entry.privateLetter} onChange={(event) => setEntry({ ...entry, privateLetter: event.target.value })} /></label>

          <button className="primary-button wide" type="submit">Save today's page</button>
        </form>

        <aside className="side-panel">
          <div className="quote-card">
            <Moon />
            <span>{selectedFeeling.tone}</span>
            <strong>{affirmations[entries.length % affirmations.length]}</strong>
          </div>
          <div className="prompt-card">
            <span>Gentle prompt</span>
            <p>{prompts[Number(entry.date.slice(-1)) % prompts.length]}</p>
          </div>
          <div className="timeline-card">
            <span>Recent pages</span>
            {entries.length === 0 ? <p>No entries yet. Start with today.</p> : entries.slice(0, 6).map((item) => (
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
