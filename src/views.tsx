import React, { useState, useRef, useEffect } from 'react';
import {
  Activity, CalendarDays, HeartPulse, Pill, Bot, Send, RefreshCw, AlertTriangle, Syringe, FlaskConical,
} from 'lucide-react';
import * as api from './api';
import type { User, JournalRow, MonitoringRow, AppointmentRow, MedicationRow } from './types';
import { Doodle, useAsync, todayISO, dISO, compact, longDate, daysUntil } from './ui';

// Stable facts from the "IVF Journey — Ryan & Nina" hub (rarely change).
const HUB = {
  phase: 'Insurance / Approval — retrieval cycle authorized',
  clinic: 'Stanford · Dr. Amin Milki',
  patient: 'Nina Noe-Chapuis',
  start: '2026-07-05',
  authExpires: '2026-12-06',
  risks: [
    'PGT-A genetics lab must be in-network (separate bill, HMO = 100% if out-of-network)',
    'Anesthesiologist must be in-network',
    'Meds: Tier 4, need Network Specialty Pharmacy + preauth before start',
    'Authorization expires Dec 6, 2026 — retrieval + freeze must finish by then',
  ],
};

const FEELINGS: { name: string; color: string }[] = [
  { name: 'Hopeful', color: '#e18a3a' },
  { name: 'Grateful', color: '#3f7d5a' },
  { name: 'Soft', color: '#8fbf6f' },
  { name: 'Tender', color: '#e6a15a' },
  { name: 'Anxious', color: '#c26f21' },
  { name: 'Heavy', color: '#6f8a72' },
];
const MOODS = ['Good', 'Okay', 'Tough'];

const QUOTES = [
  'One gentle step at a time is all today asks of you.',
  'Hope is a discipline. Keep choosing it.',
  'Your body is doing quiet, extraordinary work right now.',
  'Rest is part of the plan, not a break from it.',
  'You are not behind. You are in the middle of becoming.',
  'Whatever today holds, you are holding it together.',
  'Be as kind to yourself as you would be to someone you love.',
  'Every scan, every shot, every day; it all counts.',
  'Courage is showing up for the next appointment.',
  'The garden does not rush, and still it blooms.',
  'Breathe. You have made it through every hard day so far.',
  'Two people, one hope, one steady day at a time.',
  'Tenderness is strength. Let yourself feel it all.',
  'This chapter is hard, and you are still writing it.',
  'Whatever the numbers say today, you are more than a number.',
];
function QuoteOfDay() {
  const start = new Date(new Date().getFullYear(), 0, 0).getTime();
  const i = Math.floor((Date.now() - start) / 86400000) % QUOTES.length;
  return (
    <section className="quote-card">
      <span className="quote-mark">&ldquo;</span>
      <p>{QUOTES[i]}</p>
      <span className="quote-sub">a note for today</span>
    </section>
  );
}

function Loading() {
  return <div className="loading"><RefreshCw size={16} className="spin" /> loading…</div>;
}
function ErrorNote({ error }: { error: string }) {
  const needsSetup = /unauthorized|not configured|notion \d/i.test(error);
  return (
    <div className="err-note">
      <AlertTriangle size={16} />
      <div>
        <strong>{needsSetup ? 'not connected to Notion yet' : 'could not load'}</strong>
        <p>{needsSetup ? 'add NOTION_TOKEN + share the IVF page with the integration (see SETUP.md).' : error}</p>
      </div>
    </div>
  );
}

// ---- Dashboard --------------------------------------------------------------
export function Dashboard({ user }: { user: User }) {
  const appts = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const mon = useAsync(() => api.listDb('monitoring', 'Date', 'desc'), []);
  const authLeft = daysUntil(HUB.authExpires);
  const nextAppt = (appts.data as AppointmentRow[] | null)?.find((a) => (dISO(a.Date) || '9999') >= todayISO());
  const latest = (mon.data as MonitoringRow[] | null)?.[0];

  return (
    <div className="view">
      <section className="hero-card">
        <span className="eyebrow"><Activity size={15} /> current phase</span>
        <h1>{HUB.phase}</h1>
        <div className="hero-facts">
          <span>{HUB.clinic}</span>
          <span>· patient {HUB.patient}</span>
          <span>· planned start {compact(HUB.start)}</span>
        </div>
      </section>

      <QuoteOfDay />

      <div className="stat-row">
        <article><CalendarDays /><strong>{compact(HUB.start)}</strong><span>cycle start</span></article>
        <article className={authLeft != null && authLeft < 45 ? 'warn' : ''}>
          <AlertTriangle /><strong>{authLeft}d</strong><span>auth expires {compact(HUB.authExpires)}</span>
        </article>
        <article><HeartPulse /><strong>{latest?.['Lead Follicle (mm)'] ?? '—'}</strong><span>lead follicle mm</span></article>
        <article><FlaskConical /><strong>{latest?.E2 ?? '—'}</strong><span>latest E2</span></article>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>next appointment</h2>
          {appts.loading ? <Loading /> : appts.error ? <ErrorNote error={appts.error} /> : nextAppt ? (
            <div className="appt-next">
              <strong>{nextAppt.Appointment}</strong>
              <p>{longDate(nextAppt.Date)} · {nextAppt.Provider} · {nextAppt.Clinic}</p>
              {nextAppt.Prep && <p className="muted">prep: {nextAppt.Prep}</p>}
            </div>
          ) : <p className="muted">nothing upcoming.</p>}
        </section>

        <section className="card risk-card">
          <h2><AlertTriangle size={16} /> top risks</h2>
          <ul>{HUB.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}

// ---- Monitoring (clinic entry) ---------------------------------------------
const MON_NUM = ['Cycle Day', 'E2', 'LH', 'P4', 'Lining (mm)', 'Lead Follicle (mm)', 'Follicles Left', 'Follicles Right'] as const;
export function Monitoring() {
  const { data, error, loading, reload } = useAsync(() => api.listDb('monitoring', 'Date', 'desc'), []);
  const rows = (data as MonitoringRow[] | null) || [];
  const [form, setForm] = useState<Record<string, any>>({ Date: todayISO(), Scan: 'scan' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fields: Record<string, any> = { Scan: form.Scan || `scan ${form.Date}`, Date: form.Date };
      for (const k of MON_NUM) if (form[k] !== undefined && form[k] !== '') fields[k] = Number(form[k]);
      if (form.Notes) fields.Notes = form.Notes;
      await api.createRow('monitoring', fields);
      setForm({ Date: todayISO(), Scan: 'scan' });
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view">
      <section className="card">
        <span className="eyebrow"><Syringe size={15} /> add today's scan</span>
        <form className="mon-form" onSubmit={save}>
          <label>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} /></label>
          {MON_NUM.map((k) => (
            <label key={k}>{k.toLowerCase()}<input type="number" step="any" value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></label>
          ))}
          <label className="wide-field">notes<input value={form.Notes ?? ''} onChange={(e) => set('Notes', e.target.value)} placeholder="how the scan went…" /></label>
          <button className="primary-button wide" disabled={saving}>{saving ? 'saving…' : 'log scan'}</button>
        </form>
      </section>

      <section className="card">
        <h2>monitoring log</h2>
        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="muted">no scans yet.</p> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>date</th><th>CD</th><th>E2</th><th>LH</th><th>P4</th><th>lining</th><th>lead</th><th>foll L/R</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{compact(r.Date)}</td><td>{r['Cycle Day'] ?? '—'}</td><td>{r.E2 ?? '—'}</td>
                    <td>{r.LH ?? '—'}</td><td>{r.P4 ?? '—'}</td><td>{r['Lining (mm)'] ?? '—'}</td>
                    <td>{r['Lead Follicle (mm)'] ?? '—'}</td>
                    <td>{(r['Follicles Left'] ?? '—')}/{(r['Follicles Right'] ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Journal (+ year garden, per-user private) ------------------------------
const YEAR = new Date().getFullYear();
const YEAR_START = `${YEAR}-01-01`;
const YEAR_DAYS = 365;
function dayOfYear(iso?: string) {
  if (!iso) return -1;
  return Math.floor((new Date(`${dISO(iso)}T00:00:00`).getTime() - new Date(`${YEAR_START}T00:00:00`).getTime()) / 86400000);
}

export function Journal({ user }: { user: User }) {
  const { data, error, loading, reload } = useAsync(() => api.listDb('journal', 'Date', 'desc'), []);
  const all = (data as JournalRow[] | null) || [];
  // privacy: each person sees their own entries + shared ("Both"); never the other's.
  const mine = all.filter((r) => r.Author === user || r.Author === 'Both' || (!r.Author && user !== 'Both'));
  const visible = user === 'Both' ? all : mine;

  const [form, setForm] = useState<Record<string, any>>({ Date: todayISO(), Feeling: 'Soft', Mood: 'Okay' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const grown = new Map<number, JournalRow>();
  for (const r of visible) { const d = dayOfYear(r.Date); if (d >= 0 && d < YEAR_DAYS) grown.set(d, r); }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createRow('journal', {
        Entry: form.Entry || `${user}'s page · ${form.Date}`,
        Date: form.Date,
        Author: user === 'Both' ? 'Both' : user,
        Feeling: form.Feeling,
        Mood: form.Mood,
        Symptoms: form.Symptoms || '',
        Notes: form.Notes || '',
      });
      setForm({ Date: todayISO(), Feeling: 'Soft', Mood: 'Okay' });
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view">
      <section className="garden card">
        <div className="garden-head">
          <span className="year-pill">{YEAR}</span>
          <span className="garden-count"><strong>{grown.size}</strong>/{YEAR_DAYS} days planted</span>
        </div>
        <div className="garden-grid">
          {Array.from({ length: YEAR_DAYS }, (_, i) => {
            const g = grown.get(i);
            return <div key={i} className={g ? 'cell grown' : 'cell'} title={g ? `${dISO(g.Date)} · ${g.Feeling}` : ''}>{g ? <Doodle index={i} size={18} /> : <i className="dot" />}</div>;
          })}
        </div>
        <p className="garden-note">{user === 'Both' ? 'every journaled day — both of you — plants something.' : `${user}'s private garden. only you and shared "both" entries.`}</p>
      </section>

      <section className="card">
        <div className="journal-card-head">
          <span className="journal-date"><Doodle index={1} size={18} /> {longDate(form.Date)}</span>
          <span className="journal-counter">{user === 'Both' ? 'shared' : `${user}'s page`}</span>
        </div>
        <div className="prompt-line">how was your day? 🌷</div>
        <form className="journal-form" onSubmit={save}>
          <div className="form-grid two">
            <label>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} /></label>
            <label>title<input value={form.Entry ?? ''} onChange={(e) => set('Entry', e.target.value)} placeholder="a word for today…" /></label>
          </div>
          <fieldset className="feeling-grid">
            <legend>feeling</legend>
            {FEELINGS.map((f) => (
              <button key={f.name} type="button" className={form.Feeling === f.name ? 'feeling active' : 'feeling'} onClick={() => set('Feeling', f.name)}>
                <span style={{ backgroundColor: f.color }} /> {f.name.toLowerCase()}
              </button>
            ))}
          </fieldset>
          <fieldset className="feeling-grid three">
            <legend>mood</legend>
            {MOODS.map((m) => (
              <button key={m} type="button" className={form.Mood === m ? 'feeling active' : 'feeling'} onClick={() => set('Mood', m)}>{m.toLowerCase()}</button>
            ))}
          </fieldset>
          <label>symptoms / body<textarea value={form.Symptoms ?? ''} onChange={(e) => set('Symptoms', e.target.value)} placeholder="bloating, sleep, meds, tenderness…" /></label>
          <label>heart notes (private)<textarea value={form.Notes ?? ''} onChange={(e) => set('Notes', e.target.value)} placeholder="what felt fragile, beautiful, or brave today?" /></label>
          <button className="primary-button wide" disabled={saving}>{saving ? 'saving…' : 'save page'}</button>
        </form>
      </section>

      <section className="card">
        <h2>recent pages</h2>
        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : visible.length === 0 ? <p className="muted">no entries yet.</p> : (
          <div className="timeline">
            {visible.slice(0, 12).map((r) => (
              <div className="timeline-row" key={r.id}>
                <strong>{compact(r.Date)}</strong>
                <span>{r.Entry}</span>
                <small>{r.Author} · {r.Feeling} · {r.Mood}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Appointments -----------------------------------------------------------
export function Appointments() {
  const { data, error, loading, reload } = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const rows = (data as AppointmentRow[] | null) || [];
  const [form, setForm] = useState<Record<string, any>>({ Date: todayISO() });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Appointment) return;
    setSaving(true);
    try {
      await api.createRow('appointments', {
        Appointment: form.Appointment, Date: form.Date, Provider: form.Provider || '',
        Clinic: form.Clinic || '', Purpose: form.Purpose || '', Prep: form.Prep || '',
      });
      setForm({ Date: todayISO() });
      reload();
    } finally { setSaving(false); }
  };
  return (
    <div className="view">
      <section className="card">
        <span className="eyebrow"><CalendarDays size={15} /> add appointment</span>
        <form className="journal-form" onSubmit={save}>
          <div className="form-grid two">
            <label>what<input value={form.Appointment ?? ''} onChange={(e) => set('Appointment', e.target.value)} placeholder="baseline scan…" /></label>
            <label>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} /></label>
          </div>
          <div className="form-grid two">
            <label>provider<input value={form.Provider ?? ''} onChange={(e) => set('Provider', e.target.value)} /></label>
            <label>clinic<input value={form.Clinic ?? ''} onChange={(e) => set('Clinic', e.target.value)} /></label>
          </div>
          <label>prep<input value={form.Prep ?? ''} onChange={(e) => set('Prep', e.target.value)} /></label>
          <button className="primary-button wide" disabled={saving}>{saving ? 'saving…' : 'add'}</button>
        </form>
      </section>
      <section className="card">
        <h2>appointments</h2>
        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="muted">none yet.</p> : (
          <div className="timeline">
            {rows.map((r) => (
              <div className="appt-row" key={r.id}>
                <div className="appt-date"><strong>{compact(r.Date)}</strong><small>{new Date(`${dISO(r.Date)}T00:00:00`).getFullYear()}</small></div>
                <div>
                  <strong>{r.Appointment}</strong>
                  <p className="muted">{[r.Provider, r.Clinic].filter(Boolean).join(' · ')}</p>
                  {r.Prep && <p className="muted small">prep: {r.Prep}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Medications ------------------------------------------------------------
const INS_COLOR: Record<string, string> = { Covered: 'ok', 'Preauth needed': 'warn', 'Not covered': 'bad', Unknown: 'muted' };
export function Meds() {
  const { data, error, loading } = useAsync(() => api.listDb('medications'), []);
  const rows = (data as MedicationRow[] | null) || [];
  return (
    <div className="view">
      <section className="card">
        <span className="eyebrow"><Pill size={15} /> medications</span>
        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="muted">no meds logged yet.</p> : (
          <div className="med-list">
            {rows.map((r) => (
              <div className="med-row" key={r.id}>
                <div>
                  <strong>{r.Medication}</strong>
                  <p className="muted">{[r.Dose, r.Frequency, r.Purpose].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="med-meta">
                  {r['Insurance Status'] && <span className={`chip ${INS_COLOR[r['Insurance Status']] || 'muted'}`}>{r['Insurance Status'].toLowerCase()}</span>}
                  {r['Qty Left'] != null && <small>{r['Qty Left']} left</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Agent ------------------------------------------------------------------
export function Agent({ user }: { user: User }) {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ q: string; a?: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [thread]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    const idx = thread.length;
    setThread((t) => [...t, { q: question, status: 'Pending' }]);
    try {
      const { id } = await api.ask(question, user);
      // poll the Copilot Queue row until Mouha finishes
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const p = await api.pollAsk(id);
        setThread((t) => t.map((m, j) => (j === idx ? { ...m, status: p.status, a: p.answer } : m)));
        if (p.status === 'Done' || p.status === 'Error') break;
      }
    } catch (err: any) {
      setThread((t) => t.map((m, j) => (j === idx ? { ...m, status: 'Error', a: String(err.message || err) } : m)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <section className="card agent-card">
        <span className="eyebrow"><Bot size={15} /> ask Dr. Sherpa</span>
        <p className="muted">your IVF guide — answers questions, logs scans/appointments, and can send Slack. every action is recorded so you can see exactly what it did.</p>
        <div className="agent-thread">
          {thread.length === 0 && (
            <div className="agent-empty">
              <p>Ask anything about your cycle. Dr. Sherpa can answer, log a scan or appointment, and send a Slack note — every action is recorded.</p>
              <div className="agent-suggests">
                {['what is my next appointment?', 'log E2 420 and lead follicle 14 today', 'what does my semen analysis mean?'].map((s) => (
                  <button type="button" key={s} className="suggest-chip" onClick={() => setQ(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {thread.map((m, i) => (
            <div key={i} className="agent-turn">
              <div className="agent-q"><strong>{user.toLowerCase()}</strong> {m.q}</div>
              <div className="agent-a">
                {m.status === 'Done' ? <span>{m.a}</span>
                  : m.status === 'Error' ? <span className="bad">{m.a || 'error'}</span>
                  : <span className="muted"><RefreshCw size={13} className="spin" /> {m.status.toLowerCase()}…</span>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="agent-form" onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ask dr. sherpa…" />
          <button className="primary-button" disabled={busy}><Send size={16} /></button>
        </form>
      </section>
    </div>
  );
}
