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
  Sparkles,
  Trash2,
} from 'lucide-react';
import './styles.css';

type Feeling = 'soft' | 'hopeful' | 'heavy' | 'anxious' | 'grateful' | 'tender';
type CycleDayKind = 'period' | 'fertile' | 'ovulation' | 'implantation' | 'test' | 'quiet';

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

type CycleProfile = {
  periodStart: string;
  cycleLength: number;
  lutealLength: number;
};

type CycleDay = {
  iso: string;
  day: number;
  label: string;
  kind: CycleDayKind;
};

const STORAGE_KEY = 'nina-ivf-journal-v1';
const CYCLE_STORAGE_KEY = 'nina-cycle-profile-v1';

const feelings: { id: Feeling; label: string; tone: string; color: string }[] = [
  { id: 'soft', label: 'soft', tone: 'gentle, protected, moving slowly', color: '#b9b2f2' },
  { id: 'hopeful', label: 'hopeful', tone: 'open to possibility today', color: '#3a1fe6' },
  { id: 'heavy', label: 'heavy', tone: 'carrying a lot, needs care', color: '#6d78c9' },
  { id: 'anxious', label: 'anxious', tone: 'needs grounding and reassurance', color: '#8f7bff' },
  { id: 'grateful', label: 'grateful', tone: 'noticing small lights', color: '#5b8def' },
  { id: 'tender', label: 'tender', tone: 'sensitive, intimate, honest', color: '#a07bf0' },
];

const phases = [
  'stimulation',
  'monitoring',
  'trigger',
  'retrieval',
  'fertilisation',
  'transfer',
  'two-week wait',
  'rest day',
];

const protocol: ProtocolStep[] = [
  { title: 'morning body scan', description: 'symptoms, sleep, medication notes.', status: 'done' },
  { title: 'cycle intelligence', description: 'period, fertile window, ovulation and IVF milestones.', status: 'active' },
  { title: 'evening letter', description: 'a private page for what could not be said aloud.', status: 'next' },
];

const prompts = [
  'what does my body need me to stop apologising for?',
  'where did hope show up quietly today?',
  'what would feel nourishing in the next hour?',
  'if today had one gentle truth, what would it be?',
  'what did i survive that deserves to be named?',
];

const affirmations = [
  'you are allowed to be held by softness and science at the same time.',
  'your body is not failing. it is communicating.',
  'hope can be quiet and still be real.',
  'you do not have to make this journey look easy.',
  'one honest page is enough for today.',
];

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (start: string, end: string) =>
  Math.floor((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000);
const compactDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit' })
    .toLowerCase()
    .replace(/\//g, '.');

// ---- year garden -------------------------------------------------------------
const YEAR = new Date().getFullYear();
const YEAR_START = `${YEAR}-01-01`;
const YEAR_DAYS = 365;

// small hand-drawn line doodles that "grow" on journaled days
const doodlePaths = [
  // flower
  'M12 21v-6 M12 15c-3 0-4-2-4-3s2-1 4 1c2-2 4-2 4-1s-1 3-4 3z M12 9a2 2 0 100-4 2 2 0 000 4z M9 6l1 2 M15 6l-1 2 M12 4v2',
  // sprout
  'M12 21v-8 M12 13c-4 0-5-4-5-4s4-1 5 4z M12 13c3 0 4-3 4-3s-3-1-4 3z',
  // mushroom
  'M9 21h6 M11 15v6 M13 15v6 M6 13c0-4 3-6 6-6s6 2 6 6z M10 10v1 M14 11v1',
  // tulip
  'M12 21v-7 M8 8c0 4 2 6 4 6s4-2 4-6c-1 2-3 2-4 0-1 2-3 2-4 0z',
  // wheat
  'M12 21V8 M12 12c-3 0-3-3-3-3s3 0 3 3z M12 12c3 0 3-3 3-3s-3 0-3 3z M12 8c-2.5 0-2.5-3-2.5-3s2.5 0 2.5 3z M12 8c2.5 0 2.5-3 2.5-3s-2.5 0-2.5 3z',
  // clover
  'M12 21v-6 M12 15c-2 2-5 1-5-1s3-3 5 1 M12 15c2 2 5 1 5-1s-3-3-5 1 M12 15c0-3-2-5 0-7 2 2 0 4 0 7z',
];

function Doodle({ index, size = 22 }: { index: number; size?: number }) {
  const d = doodlePaths[index % doodlePaths.length];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const emptyEntry = (): JournalEntry => ({
  id: uuid(),
  date: todayISO(),
  cycleDay: '',
  phase: 'stimulation',
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

function loadCycleProfile(): CycleProfile {
  try {
    const raw = localStorage.getItem(CYCLE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Keep defaults if local storage is unavailable.
  }
  return { periodStart: todayISO(), cycleLength: 28, lutealLength: 14 };
}

function buildCycleDays(profile: CycleProfile): CycleDay[] {
  const ovulationDay = Math.max(8, profile.cycleLength - profile.lutealLength);
  return Array.from({ length: profile.cycleLength }, (_, index) => {
    const day = index + 1;
    let kind: CycleDayKind = 'quiet';
    if (day <= 5) kind = 'period';
    if (day >= ovulationDay - 5 && day <= ovulationDay + 1) kind = 'fertile';
    if (day === ovulationDay) kind = 'ovulation';
    if (day === ovulationDay + 7) kind = 'implantation';
    if (day === profile.cycleLength) kind = 'test';
    return { iso: addDays(profile.periodStart, index), day, label: compactDate(addDays(profile.periodStart, index)), kind };
  });
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>(loadEntries);
  const [entry, setEntry] = useState<JournalEntry>(() => entries[0] ?? emptyEntry());
  const [cycleProfile, setCycleProfile] = useState<CycleProfile>(loadCycleProfile);
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(cycleProfile));
  }, [cycleProfile]);

  const selectedFeeling = feelings.find((item) => item.id === entry.feeling) ?? feelings[0];
  const completedDays = useMemo(() => new Set(entries.map((item) => item.date)).size, [entries]);
  const currentPhaseIndex = Math.max(0, phases.indexOf(entry.phase));
  const progress = Math.round(((currentPhaseIndex + 1) / phases.length) * 100);
  const emotionalStreak = Math.min(completedDays, 14);
  const prompt = prompts[Number(entry.date.replace(/-/g, '').slice(-2)) % prompts.length];
  const cycleDays = useMemo(() => buildCycleDays(cycleProfile), [cycleProfile]);
  const cycleOffset = Math.max(0, daysBetween(cycleProfile.periodStart, entry.date));
  const cycleDayNumber = (cycleOffset % cycleProfile.cycleLength) + 1;
  const ovulationDay = Math.max(8, cycleProfile.cycleLength - cycleProfile.lutealLength);
  const nextOvulationDate = addDays(cycleProfile.periodStart, ovulationDay - 1);
  const selectedCycleDay = cycleDays.find((day) => day.day === cycleDayNumber) ?? cycleDays[0];
  const cycleMessage =
    selectedCycleDay.kind === 'ovulation'
      ? 'ovulation signal day: let the app feel alive, not clinical.'
      : selectedCycleDay.kind === 'fertile'
        ? 'fertile window: soft reminders, hydration, calm body notes.'
        : selectedCycleDay.kind === 'implantation'
          ? 'implantation watch: symptoms without spiralling.'
          : selectedCycleDay.kind === 'test'
            ? 'test horizon: protect the heart before the result.'
            : 'quiet tracking day: keep the streak gentle and useful.';

  // map each journaled entry to a day-of-year cell in the garden
  const gardenDays = useMemo(() => {
    const map = new Map<number, JournalEntry>();
    for (const item of entries) {
      const idx = daysBetween(YEAR_START, item.date);
      if (idx >= 0 && idx < YEAR_DAYS) map.set(idx, item);
    }
    return map;
  }, [entries]);
  const grownCount = gardenDays.size;
  const isEditing = entries.some((item) => item.date === entry.date);

  const saveEntry = () => {
    setEntries((current) => {
      const withoutSameDate = current.filter((item) => item.date !== entry.date);
      return [entry, ...withoutSameDate].sort((a, b) => b.date.localeCompare(a.date));
    });
    setSavedPulse(true);
    window.setTimeout(() => setSavedPulse(false), 1600);
  };

  const deleteEntry = () => {
    setEntries((current) => current.filter((item) => item.date !== entry.date));
    setEntry({ ...emptyEntry() });
  };

  const startNewDay = () => {
    setEntry({ ...emptyEntry(), cycleDay: `cycle day ${cycleDayNumber}` });
    scrollTo('journal');
  };

  const openDay = (iso: string) => {
    const existing = entries.find((item) => item.date === iso);
    setEntry(existing ?? { ...emptyEntry(), date: iso, cycleDay: `cycle day ${(Math.max(0, daysBetween(cycleProfile.periodStart, iso)) % cycleProfile.cycleLength) + 1}` });
    scrollTo('journal');
  };

  const exportJournal = () => {
    const payload = JSON.stringify({ cycleProfile, entries }, null, 2);
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
      <nav className="topbar" aria-label="nina app navigation">
        <div className="brand-mark">
          <img src="/app-icon.jpg" alt="nina" />
          nina
        </div>
        <div className="nav-links">
          <a href="#garden">garden</a>
          <a href="#journal">journal</a>
          <a href="#cycle">cycle</a>
          <a href="#care">care</a>
        </div>
        <button className="nav-cta" onClick={() => scrollTo('journal')}>
          <LockKeyhole size={15} /> private vault
        </button>
      </nav>

      <section className="hero-section">
        <span className="eyebrow">
          <Sparkles size={15} /> ivf companion for the days between answers
        </span>
        <div className="hero-flower">
          <Doodle index={0} size={54} />
        </div>
        <h1>
          plant a memory <em>every day</em>,<br />
          watch your year grow.
        </h1>
        <p>
          a private fertility journal: log the heart, map the cycle, anticipate ovulation — and see every honest page
          bloom into a garden of the year you survived.
        </p>
        <div className="hero-actions">
          <button onClick={startNewDay} className="primary-button">
            start today <ChevronRight size={17} />
          </button>
          <button onClick={exportJournal} className="ghost-button">
            <Download size={16} /> export journal
          </button>
        </div>
        <div className="trust-row">
          <span>local-first privacy</span>
          <span>· cycle calendar</span>
          <span>· designed for tender days</span>
        </div>
      </section>

      <section className="garden" id="garden" aria-label="your year in memories">
        <div className="garden-head">
          <span className="year-pill">{YEAR}</span>
          <span className="garden-count">
            <strong>{grownCount}</strong>/{YEAR_DAYS} days of growth
          </span>
        </div>
        <div className="garden-grid" role="grid">
          {Array.from({ length: YEAR_DAYS }, (_, i) => {
            const grown = gardenDays.get(i);
            const iso = addDays(YEAR_START, i);
            return (
              <button
                key={i}
                className={grown ? 'cell grown' : 'cell'}
                title={grown ? `${iso} · ${grown.feeling}` : iso}
                onClick={() => openDay(iso)}
              >
                {grown ? <Doodle index={i} size={20} /> : <i className="dot" />}
              </button>
            );
          })}
        </div>
        <p className="garden-note">
          every day you journal plants something. tap any dot to open that day.
        </p>
      </section>

      <section className="metrics-strip" id="insights">
        <article>
          <CalendarDays />
          <strong>{completedDays}</strong>
          <span>journaled days</span>
        </article>
        <article>
          <HeartPulse />
          <strong>{entries.length}</strong>
          <span>private reflections</span>
        </article>
        <article>
          <Activity />
          <strong>cd{cycleDayNumber}</strong>
          <span>cycle day</span>
        </article>
        <article>
          <CheckCircle2 />
          <strong>{emotionalStreak}/14</strong>
          <span>care consistency</span>
        </article>
      </section>

      <section className="cycle-lab" id="cycle">
        <div className="cycle-lab-copy">
          <span className="eyebrow">
            <CalendarDays size={15} /> cycle intelligence
          </span>
          <h2>not just a calendar — a living map of what you may feel next.</h2>
          <p>{cycleMessage}</p>
          <p className="cycle-next">next ovulation · {compactDate(nextOvulationDate)}</p>
          <div className="cycle-controls">
            <label>
              period start
              <input
                type="date"
                value={cycleProfile.periodStart}
                onChange={(event) => setCycleProfile({ ...cycleProfile, periodStart: event.target.value })}
              />
            </label>
            <label>
              cycle length
              <input
                type="number"
                min="21"
                max="40"
                value={cycleProfile.cycleLength}
                onChange={(event) => setCycleProfile({ ...cycleProfile, cycleLength: Number(event.target.value) })}
              />
            </label>
            <label>
              luteal days
              <input
                type="number"
                min="10"
                max="17"
                value={cycleProfile.lutealLength}
                onChange={(event) => setCycleProfile({ ...cycleProfile, lutealLength: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
        <div className="cycle-side">
          <div className="cycle-calendar" aria-label="cycle calendar">
            {cycleDays.map((day) => (
              <button
                key={day.iso}
                className={`cycle-day ${day.kind} ${day.day === cycleDayNumber ? 'today' : ''}`}
                onClick={() => setEntry({ ...entry, date: day.iso, cycleDay: `cycle day ${day.day}` })}
              >
                <span>{day.day}</span>
                <small>{day.label}</small>
              </button>
            ))}
          </div>
          <div className="cycle-legend">
            <span>
              <i className="period-dot" /> period
            </span>
            <span>
              <i className="fertile-dot" /> fertile
            </span>
            <span>
              <i className="ovulation-dot" /> ovulation
            </span>
            <span>
              <i className="implantation-dot" /> implantation
            </span>
          </div>
        </div>
      </section>

      <section className="command-grid">
        <aside className="care-plan" id="care">
          <div className="panel-heading">
            <span>care protocol</span>
            <h2>today's gentle operating system</h2>
          </div>
          <div className="journey-meter" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
            <div>
              <strong>{progress}%</strong>
              <span>{entry.phase}</span>
            </div>
          </div>
          <div className="protocol-list">
            {protocol.map((step) => (
              <div className={`protocol-step ${step.status}`} key={step.title}>
                <span />
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="premium-note">
            <Bell size={17} />
            <p>
              coming next: cycle-aware reminders, partner updates, pdf doctor export, encrypted sync, guided journals.
            </p>
          </div>
        </aside>

        <form
          className="journal-panel"
          id="journal"
          onSubmit={(event) => {
            event.preventDefault();
            saveEntry();
          }}
        >
          <div className="journal-card-head">
            <span className="journal-date">
              <Doodle index={1} size={18} /> {longDate(entry.date)}
            </span>
            <span className="journal-counter">
              {Math.min(grownCount + (isEditing ? 0 : 1), YEAR_DAYS)}/{YEAR_DAYS}
            </span>
          </div>

          <div className="prompt-line">how was your day? 🌷</div>

          <div className="form-grid two">
            <label>
              date
              <input type="date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} />
            </label>
            <label>
              treatment day
              <input
                placeholder="day 7, transfer +2..."
                value={entry.cycleDay}
                onChange={(event) => setEntry({ ...entry, cycleDay: event.target.value })}
              />
            </label>
          </div>

          <label>
            journey phase
            <select value={entry.phase} onChange={(event) => setEntry({ ...entry, phase: event.target.value })}>
              {phases.map((phase) => (
                <option key={phase}>{phase}</option>
              ))}
            </select>
          </label>

          <fieldset className="feeling-grid">
            <legend>emotional weather</legend>
            {feelings.map((feeling) => (
              <button
                key={feeling.id}
                type="button"
                className={entry.feeling === feeling.id ? 'feeling active' : 'feeling'}
                onClick={() => setEntry({ ...entry, feeling: feeling.id })}
              >
                <span style={{ backgroundColor: feeling.color }} /> {feeling.label}
              </button>
            ))}
          </fieldset>

          <label className="range-label">
            energy: {entry.energy}/10
            <input
              type="range"
              min="1"
              max="10"
              value={entry.energy}
              onChange={(event) => setEntry({ ...entry, energy: Number(event.target.value) })}
            />
          </label>

          <div className="prompt-banner">
            <Sparkles size={15} />
            <span>{prompt}</span>
          </div>
          <label>
            body notes
            <textarea
              placeholder="symptoms, appointments, medication, sleep, food, tenderness..."
              value={entry.bodyNotes}
              onChange={(event) => setEntry({ ...entry, bodyNotes: event.target.value })}
            />
          </label>
          <label>
            heart notes
            <textarea
              placeholder="what felt fragile, beautiful, frustrating, or brave today?"
              value={entry.heartNotes}
              onChange={(event) => setEntry({ ...entry, heartNotes: event.target.value })}
            />
          </label>
          <label>
            one small gratitude
            <input
              placeholder="a warm drink, a kind message, a calm minute..."
              value={entry.gratitude}
              onChange={(event) => setEntry({ ...entry, gratitude: event.target.value })}
            />
          </label>
          <label>
            private letter
            <textarea
              placeholder="dear future me..."
              value={entry.privateLetter}
              onChange={(event) => setEntry({ ...entry, privateLetter: event.target.value })}
            />
          </label>

          <div className="journal-actions">
            <button className="primary-button wide" type="submit">
              {isEditing ? 'update this page' : "save today's page"}
              {savedPulse && <CheckCircle2 size={16} />}
            </button>
            {isEditing && (
              <button type="button" className="delete-button" onClick={deleteEntry} aria-label="delete this entry">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </form>

        <aside className="memory-panel">
          <div className="quote-card">
            <Doodle index={3} size={26} />
            <span>{selectedFeeling.tone}</span>
            <strong>{affirmations[entries.length % affirmations.length]}</strong>
          </div>
          <div className="timeline-card">
            <span>recent pages</span>
            {entries.length === 0 ? (
              <p>no entries yet. start with today.</p>
            ) : (
              entries.slice(0, 8).map((item) => (
                <button key={item.id} onClick={() => openDay(item.date)}>
                  <strong>{item.date}</strong>
                  <small>
                    {item.phase} · {item.feeling} · energy {item.energy}/10
                  </small>
                </button>
              ))
            )}
          </div>
        </aside>
      </section>

      <footer className="letter">
        <div className="hero-flower">
          <Doodle index={0} size={40} />
        </div>
        <p>hey friend</p>
        <p>
          nina is a daily reminder that this journey is hard, and that every honest page you plant today becomes the
          garden you look back on tomorrow.
        </p>
        <p className="letter-accent">every day matters</p>
        <p className="signature">love, nina</p>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
