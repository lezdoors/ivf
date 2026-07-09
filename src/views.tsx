import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, CalendarDays, HeartPulse, Pill, Bot, Send, RefreshCw, AlertTriangle, Syringe, FlaskConical,
} from 'lucide-react';
import * as api from './api';
import type { User, JournalRow, MonitoringRow, AppointmentRow, MedicationRow, LabResultRow } from './types';
import { useAsync, todayISO, dISO, compact, longDate, daysUntil, Reveal, Card, Eyebrow, Sparkline } from './ui';

// Stable facts from the "IVF Journey — Ryan & Nina" hub (rarely change).
// Cycle milestones (Stanford estrogen-priming antagonist protocol). July is the
// OPK → ovulation → estrace-priming lead-up; the STIM cycle starts on Cycle Day 2
// of the next period (~early Aug). The August dates are estimates — they get
// updated once Nina calls in her real Cycle Day 1. Near-term dates (OPK, estrace)
// are from the care team + the couple's planning sheet.
const CYCLE = {
  opkStart: '2026-07-13', // begin OPK testing
  estraceStart: '2026-07-22', // estrogen priming (~5 days after the LH surge)
  baseline: '2026-08-01', // stim-cycle CD1–2 baseline ultrasound (tentative)
  stimStart: '2026-08-03', // CD2 — Follistim + Menopur begin (tentative)
  trigger: '2026-08-12', // possible hCG + Lupron (tentative)
  retrieval: '2026-08-14', // possible retrieval (tentative)
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000);
// Phase derives from today's date so the dashboard stays current without redeploys.
function cyclePhase(): string {
  const t = todayISO();
  if (t < CYCLE.opkStart) return `Pre-cycle — OPK testing begins ${compact(CYCLE.opkStart)}`;
  if (t < CYCLE.estraceStart) return 'OPK testing — watching for the LH surge';
  if (t < CYCLE.baseline) return `Estrogen priming (estrace) — stim cycle ~${compact(CYCLE.stimStart)}`;
  if (t < CYCLE.stimStart) return 'Baseline — stimulation begins on Cycle Day 2';
  if (t < CYCLE.trigger) return `Stimulation · day ${daysBetween(t, CYCLE.stimStart) + 1} of stims`;
  if (t < CYCLE.retrieval) return `Trigger window — retrieval ~${compact(CYCLE.retrieval)}`;
  if (t === CYCLE.retrieval) return 'Retrieval day';
  return 'Post-retrieval';
}

const HUB = {
  clinic: 'Stanford · Dr. Amin Milki',
  patient: 'Nina Noe-Chapuis',
  start: CYCLE.baseline, // stim cycle begins ~early Aug (baseline/CD1); tentative
  authExpires: '2026-12-06',
  risks: [
    'PGT-A genetics lab must be in-network (separate bill, HMO = 100% if out-of-network)',
    'Anesthesiologist must be in-network',
    'Meds: Tier 4, need Network Specialty Pharmacy + preauth before start',
    'Authorization expires Dec 6, 2026 — retrieval + freeze must finish by then',
  ],
};

const FEELINGS: { name: string; color: string }[] = [
  { name: 'Hopeful', color: '#B8735A' },
  { name: 'Grateful', color: '#C98868' },
  { name: 'Soft', color: '#A79E93' },
  { name: 'Tender', color: '#8B8178' },
  { name: 'Anxious', color: '#9C5D47' },
  { name: 'Heavy', color: '#6B6259' },
];
const MOODS = ['Good', 'Okay', 'Tough'];

const inputClass = 'w-full rounded-xl px-4 py-3 text-sm text-espresso card-inset transition-shadow focus:shadow-[inset_0_0_0_1.5px_theme(colors.terracotta.400)]';
const labelClass = 'grid gap-1.5 text-xs font-medium text-taupe-500';
const primaryButtonClass = 'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-espresso px-6 text-sm font-medium text-white transition-opacity disabled:opacity-50';

function Loading() {
  return <div className="flex items-center gap-2 text-sm text-taupe-500"><RefreshCw size={15} className="animate-spin" /> loading…</div>;
}
function ErrorNote({ error }: { error: string }) {
  const needsSetup = /unauthorized|not configured|notion \d/i.test(error);
  return (
    <div className="flex gap-3 rounded-xl bg-terracotta-50 p-4">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-terracotta-500" />
      <div>
        <strong className="block text-sm font-medium text-espresso">{needsSetup ? 'not connected to Notion yet' : 'could not load'}</strong>
        <p className="mt-1 text-sm text-taupe-600">{needsSetup ? 'add NOTION_TOKEN + share the IVF page with the integration (see SETUP.md).' : error}</p>
      </div>
    </div>
  );
}

// ---- Dashboard --------------------------------------------------------------
export function Dashboard({ user }: { user: User }) {
  const appts = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const mon = useAsync(() => api.listDb('monitoring', 'Date', 'desc'), []);
  const authLeft = daysUntil(HUB.authExpires);
  const authCritical = authLeft != null && authLeft < 45;
  const nextAppt = (appts.data as AppointmentRow[] | null)?.find((a) => (dISO(a.Date) || '9999') >= todayISO());
  const latest = (mon.data as MonitoringRow[] | null)?.[0];

  const stats = [
    { icon: CalendarDays, value: compact(HUB.start), label: 'cycle start', critical: false },
    { icon: AlertTriangle, value: `${authLeft}d`, label: `auth expires ${compact(HUB.authExpires)}`, critical: authCritical },
    { icon: HeartPulse, value: latest?.['Lead Follicle (mm)'] ?? '—', label: 'lead follicle mm', critical: false },
    { icon: FlaskConical, value: latest?.E2 ?? '—', label: 'latest E2', critical: false },
  ];

  return (
    <div className="grid gap-4 sm:gap-5">
      <Reveal>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-terracotta-500"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </span>
          <Eyebrow>current phase</Eyebrow>
        </div>
        <h1 className="text-2xl font-light leading-snug tracking-tight text-espresso sm:text-3xl">{cyclePhase()}</h1>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-taupe-500">
          <span>{HUB.clinic}</span>
          <span>· patient {HUB.patient}</span>
          <span>· planned start {compact(HUB.start)}</span>
        </div>
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={0.08 + i * 0.05}>
            <Card className="flex h-full flex-col gap-2">
              <s.icon size={16} className={s.critical ? 'text-terracotta-500' : 'text-taupe-400'} />
              <strong className={`text-2xl font-light leading-none tracking-tight ${s.critical ? 'text-terracotta-500' : 'text-espresso'}`}>{s.value}</strong>
              <span className="text-xs leading-snug text-taupe-500">{s.label}</span>
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Reveal delay={0.3}>
          <Card className="h-full">
            <Eyebrow className="mb-4">next appointment</Eyebrow>
            {appts.loading ? <Loading /> : appts.error ? <ErrorNote error={appts.error} /> : nextAppt ? (
              <div>
                <strong className="text-base font-medium text-espresso">{nextAppt.Appointment}</strong>
                <p className="mt-2 text-sm text-taupe-600">{longDate(nextAppt.Date)} · {nextAppt.Provider} · {nextAppt.Clinic}</p>
                {nextAppt.Prep && <p className="mt-1 text-sm text-taupe-500">prep: {nextAppt.Prep}</p>}
              </div>
            ) : <p className="text-sm text-taupe-500">nothing upcoming.</p>}
          </Card>
        </Reveal>

        <Reveal delay={0.36}>
          <Card className="h-full">
            <Eyebrow className="mb-4 flex items-center gap-2">
              <AlertTriangle size={13} className="text-terracotta-500" /> top risks
            </Eyebrow>
            <ul className="divide-y divide-line">
              {HUB.risks.map((r) => <li key={r} className="py-2.5 text-sm leading-relaxed text-taupe-600 first:pt-0 last:pb-0">{r}</li>)}
            </ul>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

// ---- Monitoring (clinic entry) ---------------------------------------------
const MON_NUM = ['Cycle Day', 'E2', 'LH', 'P4', 'Lining (mm)', 'Lead Follicle (mm)', 'Follicles Left', 'Follicles Right'] as const;

// A single metric's trend: latest value, delta vs previous, and a sparkline.
function MetricTrend({ label, unit, values, stroke, fill }: {
  label: string; unit: string; values: number[]; stroke?: string; fill?: string;
}) {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;
  const latest = clean[clean.length - 1];
  const prev = clean.length > 1 ? clean[clean.length - 2] : null;
  const delta = prev != null ? latest - prev : null;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <Eyebrow>{label}</Eyebrow>
        <div className="flex items-baseline gap-1.5">
          <strong className="text-xl font-light tracking-tight text-espresso">{latest}</strong>
          <span className="text-xs text-taupe-400">{unit}</span>
          {delta != null && delta !== 0 && (
            <span className={`ml-1 text-xs font-medium ${delta > 0 ? 'text-terracotta-500' : 'text-taupe-500'}`}>
              {delta > 0 ? '↑' : '↓'}{Math.abs(Number(delta.toFixed(1)))}
            </span>
          )}
        </div>
      </div>
      <Sparkline values={clean} stroke={stroke} fill={fill} />
    </div>
  );
}

export function Monitoring() {
  const { data, error, loading, reload } = useAsync(() => api.listDb('monitoring', 'Date', 'desc'), []);
  const rows = (data as MonitoringRow[] | null) || [];
  // chronological (oldest -> newest) for trend lines
  const chron = [...rows].reverse();
  const series = (k: keyof MonitoringRow) => chron.map((r) => Number(r[k])).filter((v) => !Number.isNaN(v));
  const hasTrend = rows.length >= 2;
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
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card>
          <Eyebrow className="mb-5 flex items-center gap-2"><Syringe size={13} /> add today's scan</Eyebrow>
          <form className="grid grid-cols-2 gap-3 sm:grid-cols-3" onSubmit={save}>
            <label className={labelClass}>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} className={inputClass} /></label>
            {MON_NUM.map((k) => (
              <label key={k} className={labelClass}>{k.toLowerCase()}<input type="number" step="any" value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={inputClass} /></label>
            ))}
            <label className={`${labelClass} col-span-2 sm:col-span-3`}>notes<input value={form.Notes ?? ''} onChange={(e) => set('Notes', e.target.value)} placeholder="how the scan went…" className={inputClass} /></label>
            <button className={`${primaryButtonClass} col-span-2 sm:col-span-3`} disabled={saving}>{saving ? 'saving…' : 'log scan'}</button>
          </form>
        </Card>
      </Reveal>

      {hasTrend && (
        <Reveal delay={0.08}>
          <Card>
            <Eyebrow className="mb-5 flex items-center gap-2"><Activity size={13} /> stim response</Eyebrow>
            <div className="grid gap-6 sm:grid-cols-2">
              <MetricTrend label="estradiol (E2)" unit="pg/mL" values={series('E2')} stroke="#B8735A" fill="rgba(184,115,90,0.10)" />
              <MetricTrend label="lead follicle" unit="mm" values={series('Lead Follicle (mm)')} stroke="#2C2A29" fill="rgba(44,42,41,0.06)" />
              <MetricTrend label="lining" unit="mm" values={series('Lining (mm)')} stroke="#8B8178" fill="rgba(139,129,120,0.08)" />
              <MetricTrend label="progesterone (P4)" unit="ng/mL" values={series('P4')} stroke="#9C5D47" fill="rgba(156,93,71,0.08)" />
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.1}>
        <Card>
          <Eyebrow className="mb-5">monitoring log</Eyebrow>
          {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="text-sm text-taupe-500">no scans yet.</p> : (
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-[0.1em] text-taupe-500">
                    <th className="pb-3 pr-3">date</th><th className="pb-3 pr-3">CD</th><th className="pb-3 pr-3">E2</th><th className="pb-3 pr-3">LH</th>
                    <th className="pb-3 pr-3">P4</th><th className="pb-3 pr-3">lining</th><th className="pb-3 pr-3">lead</th><th className="pb-3">foll L/R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="text-espresso">
                      <td className="py-3 pr-3">{compact(r.Date)}</td><td className="py-3 pr-3">{r['Cycle Day'] ?? '—'}</td><td className="py-3 pr-3">{r.E2 ?? '—'}</td>
                      <td className="py-3 pr-3">{r.LH ?? '—'}</td><td className="py-3 pr-3">{r.P4 ?? '—'}</td><td className="py-3 pr-3">{r['Lining (mm)'] ?? '—'}</td>
                      <td className="py-3 pr-3">{r['Lead Follicle (mm)'] ?? '—'}</td>
                      <td className="py-3">{(r['Follicles Left'] ?? '—')}/{(r['Follicles Right'] ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>
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
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-full bg-sand px-3 py-1 text-xs font-medium text-espresso card-inset">{YEAR}</span>
            <span className="text-sm text-taupe-500"><strong className="font-medium text-espresso">{grown.size}</strong>/{YEAR_DAYS} days planted</span>
          </div>
          <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(21,minmax(0,1fr))]">
            {Array.from({ length: YEAR_DAYS }, (_, i) => {
              const g = grown.get(i);
              return (
                <div
                  key={i}
                  title={g ? `${dISO(g.Date)} · ${g.Feeling}` : ''}
                  className={`aspect-square rounded-[3px] ${g ? 'bg-terracotta-400' : 'bg-sand card-inset'}`}
                />
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-taupe-500">{user === 'Both' ? 'every journaled day — both of you — plants something.' : `${user}'s private garden. only you and shared "both" entries.`}</p>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-espresso">{longDate(form.Date)}</span>
            <span className="text-xs text-taupe-500">{user === 'Both' ? 'shared' : `${user}'s page`}</span>
          </div>
          <div className="mb-5 text-sm text-taupe-500">how was your day?</div>
          <form className="grid gap-4" onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} className={inputClass} /></label>
              <label className={labelClass}>title<input value={form.Entry ?? ''} onChange={(e) => set('Entry', e.target.value)} placeholder="a word for today…" className={inputClass} /></label>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-xs font-medium text-taupe-500">feeling</legend>
              <div className="grid grid-cols-3 gap-2">
                {FEELINGS.map((f) => (
                  <button
                    key={f.name} type="button" onClick={() => set('Feeling', f.name)}
                    className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-2 text-xs font-medium transition-colors ${
                      form.Feeling === f.name ? 'bg-espresso text-white' : 'text-taupe-600 card-inset'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: f.color }} /> {f.name.toLowerCase()}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-xs font-medium text-taupe-500">mood</legend>
              <div className="grid grid-cols-3 gap-2">
                {MOODS.map((m) => (
                  <button
                    key={m} type="button" onClick={() => set('Mood', m)}
                    className={`inline-flex min-h-[40px] items-center justify-center rounded-xl px-2 text-xs font-medium transition-colors ${
                      form.Mood === m ? 'bg-espresso text-white' : 'text-taupe-600 card-inset'
                    }`}
                  >
                    {m.toLowerCase()}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className={labelClass}>symptoms / body<textarea value={form.Symptoms ?? ''} onChange={(e) => set('Symptoms', e.target.value)} placeholder="bloating, sleep, meds, tenderness…" className={`${inputClass} min-h-[84px] resize-y`} /></label>
            <label className={labelClass}>heart notes (private)<textarea value={form.Notes ?? ''} onChange={(e) => set('Notes', e.target.value)} placeholder="what felt fragile, beautiful, or brave today?" className={`${inputClass} min-h-[84px] resize-y`} /></label>
            <button className={`${primaryButtonClass} w-full`} disabled={saving}>{saving ? 'saving…' : 'save page'}</button>
          </form>
        </Card>
      </Reveal>

      <Reveal delay={0.16}>
        <Card>
          <Eyebrow className="mb-4">recent pages</Eyebrow>
          {loading ? <Loading /> : error ? <ErrorNote error={error} /> : visible.length === 0 ? <p className="text-sm text-taupe-500">no entries yet.</p> : (
            <div className="divide-y divide-line">
              {visible.slice(0, 12).map((r) => (
                <div className="grid grid-cols-[56px_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0" key={r.id}>
                  <strong className="text-sm font-medium text-espresso">{compact(r.Date)}</strong>
                  <div>
                    <span className="block text-sm text-espresso">{r.Entry}</span>
                    <small className="text-xs text-taupe-500">{r.Author} · {r.Feeling} · {r.Mood}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>
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
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card>
          <Eyebrow className="mb-5 flex items-center gap-2"><CalendarDays size={13} /> add appointment</Eyebrow>
          <form className="grid gap-3" onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>what<input value={form.Appointment ?? ''} onChange={(e) => set('Appointment', e.target.value)} placeholder="baseline scan…" className={inputClass} /></label>
              <label className={labelClass}>date<input type="date" value={form.Date} onChange={(e) => set('Date', e.target.value)} className={inputClass} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>provider<input value={form.Provider ?? ''} onChange={(e) => set('Provider', e.target.value)} className={inputClass} /></label>
              <label className={labelClass}>clinic<input value={form.Clinic ?? ''} onChange={(e) => set('Clinic', e.target.value)} className={inputClass} /></label>
            </div>
            <label className={labelClass}>prep<input value={form.Prep ?? ''} onChange={(e) => set('Prep', e.target.value)} className={inputClass} /></label>
            <button className={`${primaryButtonClass} w-full`} disabled={saving}>{saving ? 'saving…' : 'add'}</button>
          </form>
        </Card>
      </Reveal>
      <Reveal delay={0.1}>
        <Card>
          <Eyebrow className="mb-4">appointments</Eyebrow>
          {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="text-sm text-taupe-500">none yet.</p> : (
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div className="grid grid-cols-[56px_1fr] gap-4 py-4 first:pt-0 last:pb-0" key={r.id}>
                  <div className="text-center">
                    <strong className="block text-lg font-light text-espresso">{compact(r.Date)}</strong>
                    <small className="text-xs text-taupe-500">{new Date(`${dISO(r.Date)}T00:00:00`).getFullYear()}</small>
                  </div>
                  <div>
                    <strong className="text-sm font-medium text-espresso">{r.Appointment}</strong>
                    <p className="mt-1 text-sm text-taupe-500">{[r.Provider, r.Clinic].filter(Boolean).join(' · ')}</p>
                    {r.Purpose && <p className="mt-0.5 text-xs text-taupe-500">{r.Purpose}</p>}
                    {r.Prep && <p className="mt-0.5 text-xs text-taupe-500">prep: {r.Prep}</p>}
                    {r.Results && <p className="mt-1.5 rounded-lg bg-sand px-3 py-2 text-xs leading-relaxed text-taupe-600 card-inset">{r.Results}</p>}
                    {r['Follow-up'] && <p className="mt-1 text-xs text-taupe-500">follow-up: {r['Follow-up']}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}

// ---- Medications ------------------------------------------------------------
const INS_COLOR: Record<string, string> = {
  Covered: 'text-taupe-500', 'Preauth needed': 'text-terracotta-500', 'Not covered': 'text-terracotta-600', Unknown: 'text-taupe-400',
};
const INS_OPTIONS = ['Covered', 'Preauth needed', 'Not covered', 'Unknown'];
export function Meds() {
  const { data, error, loading, reload } = useAsync(() => api.listDb('medications'), []);
  const rows = (data as MedicationRow[] | null) || [];
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.Medication) return;
    setSaving(true);
    try {
      await api.createRow('medications', {
        Medication: form.Medication, Dose: form.Dose || '', Frequency: form.Frequency || '',
        Purpose: form.Purpose || '', 'Insurance Status': form['Insurance Status'] || 'Unknown',
        ...(form['Qty Left'] !== undefined && form['Qty Left'] !== '' ? { 'Qty Left': Number(form['Qty Left']) } : {}),
      });
      setForm({});
      reload();
    } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card>
          <Eyebrow className="mb-5 flex items-center gap-2"><Pill size={13} /> add medication</Eyebrow>
          <form className="grid gap-3" onSubmit={save}>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>medication<input value={form.Medication ?? ''} onChange={(e) => set('Medication', e.target.value)} placeholder="Gonal-F…" className={inputClass} /></label>
              <label className={labelClass}>dose<input value={form.Dose ?? ''} onChange={(e) => set('Dose', e.target.value)} placeholder="225 IU" className={inputClass} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>frequency<input value={form.Frequency ?? ''} onChange={(e) => set('Frequency', e.target.value)} placeholder="nightly" className={inputClass} /></label>
              <label className={labelClass}>purpose<input value={form.Purpose ?? ''} onChange={(e) => set('Purpose', e.target.value)} placeholder="stimulation" className={inputClass} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>insurance
                <select value={form['Insurance Status'] ?? 'Unknown'} onChange={(e) => set('Insurance Status', e.target.value)} className={inputClass}>
                  {INS_OPTIONS.map((o) => <option key={o} value={o}>{o.toLowerCase()}</option>)}
                </select>
              </label>
              <label className={labelClass}>qty left<input type="number" step="any" value={form['Qty Left'] ?? ''} onChange={(e) => set('Qty Left', e.target.value)} className={inputClass} /></label>
            </div>
            <button className={`${primaryButtonClass} w-full`} disabled={saving}>{saving ? 'saving…' : 'add medication'}</button>
          </form>
        </Card>
      </Reveal>
      <Reveal delay={0.1}>
        <Card>
          <Eyebrow className="mb-4 flex items-center gap-2"><Pill size={13} /> medications</Eyebrow>
          {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? <p className="text-sm text-taupe-500">no meds logged yet.</p> : (
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0" key={r.id}>
                  <div>
                    <strong className="text-sm font-medium text-espresso">{r.Medication}</strong>
                    <p className="mt-1 text-sm text-taupe-500">{[r.Dose, r.Frequency, r.Purpose].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="grid justify-items-end gap-1">
                    {r['Insurance Status'] && <span className={`text-xs font-medium ${INS_COLOR[r['Insurance Status']] || 'text-taupe-400'}`}>{r['Insurance Status'].toLowerCase()}</span>}
                    {r['Qty Left'] != null && <small className="text-xs text-taupe-400">{r['Qty Left']} left</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}

// ---- Records (lab results) --------------------------------------------------
// A row whose Value is null/undefined is treated as a narrative summary line.
function isSummary(r: LabResultRow) {
  return r.Value == null || Number.isNaN(Number(r.Value));
}
export function Records() {
  const { data, error, loading } = useAsync(() => api.listDb('labResults', 'Date', 'desc'), []);
  const rows = (data as LabResultRow[] | null) || [];
  // group by date, newest first (listDb already sorts desc)
  const groups: { date?: string; rows: LabResultRow[] }[] = [];
  for (const r of rows) {
    const key = dISO(r.Date);
    const g = groups.find((x) => dISO(x.date) === key);
    if (g) g.rows.push(r); else groups.push({ date: r.Date, rows: [r] });
  }
  return (
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card>
          <Eyebrow className="mb-1 flex items-center gap-2"><FlaskConical size={13} /> lab results</Eyebrow>
          <p className="text-sm text-taupe-500">bloodwork, semen analysis, genetics — pulled from your records.</p>
        </Card>
      </Reveal>

      {loading ? <Reveal delay={0.06}><Card><Loading /></Card></Reveal>
        : error ? <Reveal delay={0.06}><Card><ErrorNote error={error} /></Card></Reveal>
        : rows.length === 0 ? <Reveal delay={0.06}><Card><p className="text-sm text-taupe-500">no lab results yet.</p></Card></Reveal>
        : groups.map((g, gi) => (
          <Reveal key={g.date || gi} delay={0.06 + gi * 0.05}>
            <Card>
              <div className="mb-4 flex items-baseline justify-between">
                <Eyebrow>{longDate(g.date)}</Eyebrow>
                <span className="text-xs text-taupe-400">{g.rows.filter((r) => !isSummary(r)).length} results</span>
              </div>
              <div className="divide-y divide-line">
                {g.rows.map((r) => isSummary(r) ? (
                  <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                    <strong className="text-sm font-medium text-espresso">{r.Test}</strong>
                    {r.Notes && <p className="mt-1 text-sm leading-relaxed text-taupe-600">{r.Notes}</p>}
                  </div>
                ) : (
                  <div key={r.id} className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-3 first:pt-0 last:pb-0">
                    <div>
                      <span className="text-sm text-espresso">{r.Test}</span>
                      {(r['Reference Range'] || r.Notes) && (
                        <p className="mt-0.5 text-xs text-taupe-400">
                          {r['Reference Range'] ? `ref ${r['Reference Range']}` : ''}
                          {r['Reference Range'] && r.Notes ? ' · ' : ''}
                          {r.Notes || ''}
                        </p>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-right">
                      <strong className="text-lg font-light tracking-tight text-espresso">{r.Value}</strong>
                      {r.Units && <span className="ml-1 text-xs text-taupe-400">{r.Units}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Reveal>
        ))}
    </div>
  );
}

// ---- Agent ------------------------------------------------------------------
export function Agent({ user }: { user: User }) {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ q: string; a?: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);

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
    <div className="grid gap-3 sm:gap-4">
      <Reveal>
        <Card className="grid gap-4">
          <div>
            <Eyebrow className="mb-3 flex items-center gap-2"><Bot size={13} /> ask Dr. Sherpa</Eyebrow>
            <p className="text-sm text-taupe-500">your IVF guide — answers questions, logs scans/appointments, and can send Slack. every action is recorded so you can see exactly what it did.</p>
          </div>
          <div className="grid min-h-[100px] gap-3">
            {thread.length === 0 && <p className="text-xs text-taupe-400">try: "what's my next appointment?" · "log E2 420 lead follicle 14 today" · "remind us on slack about the semen analysis"</p>}
            {thread.map((m, i) => (
              <div key={i} className="grid gap-1.5">
                <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-sand px-4 py-2.5 text-sm text-espresso card-inset">
                  <strong className="mr-1.5 font-medium text-taupe-500">{user.toLowerCase()}</strong> {m.q}
                </div>
                <div className="w-fit max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm leading-relaxed text-espresso card-inset">
                  {m.status === 'Done' ? <span>{m.a}</span>
                    : m.status === 'Error' ? <span className="text-terracotta-500">{m.a || 'error'}</span>
                    : <span className="inline-flex items-center gap-1.5 text-taupe-500"><RefreshCw size={13} className="animate-spin" /> {m.status.toLowerCase()}…</span>}
                </div>
              </div>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={submit}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ask dr. sherpa…" className={`${inputClass} flex-1 rounded-full`} />
            <button className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-espresso text-white transition-opacity disabled:opacity-50" disabled={busy}><Send size={16} /></button>
          </form>
        </Card>
      </Reveal>
    </div>
  );
}

// ---- Calendar ---------------------------------------------------------------
// A month view of the whole cycle. The medication bars, phase milestones and
// cycle-day badges are DERIVED from the CYCLE dates above, so the calendar
// stays correct if those shift (e.g. when Nina calls in her real Cycle Day 1);
// live appointments from Notion are overlaid on top. August dates are estimates.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const JULY_CD1 = '2026-07-05'; // first day of the current cycle (menses)

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

type EvKind = 'appt' | 'med' | 'est' | 'call';
type Ev = { kind: EvKind; label: string };

const KIND_ORDER: Record<EvKind, number> = { call: 0, appt: 1, med: 2, est: 3 };
const CHIP: Record<EvKind, string> = {
  appt: 'border-espresso bg-espresso/[0.06] text-espresso',
  med: 'border-terracotta-500 bg-terracotta-50 text-terracotta-600',
  est: 'border-taupe-400 border-dashed bg-taupe-400/10 text-taupe-600',
  call: 'border-terracotta-600 bg-terracotta-100 text-terracotta-600 font-semibold',
};
const LEGEND: { kind: EvKind; label: string }[] = [
  { kind: 'appt', label: 'Appointment' },
  { kind: 'med', label: 'Medication' },
  { kind: 'est', label: 'Estimate' },
  { kind: 'call', label: 'Call the clinic' },
];

const GLOSSARY: [string, string][] = [
  ['OPK', 'Ovulation predictor kit — a pee stick that catches the hormone spike before ovulation.'],
  ['LH surge', 'The hormone spike right before ovulation; the OPK is looking for it.'],
  ['Estrace', 'Estrogen pills ("priming") so the eggs all start growing at an even size.'],
  ['Baseline U/S', 'The first scan of the stim cycle — must be clear (no cysts) to start the shots.'],
  ['Follistim / Menopur', 'Nightly injectable hormones that grow a batch of eggs.'],
  ['Ganirelix', 'A morning shot that stops the eggs releasing too early.'],
  ['Trigger', 'The final shot (hCG + Lupron) that ripens the eggs. Retrieval is ~36h later.'],
  ['Retrieval', 'The short procedure, under sedation, to collect the eggs.'],
];

// cycle-day badge: current cycle in July, stim cycle in August (CD1 = stimStart − 1)
function cdFor(iso: string): number | null {
  const augCD1 = addDays(CYCLE.stimStart, -1);
  for (const c1 of [JULY_CD1, augCD1]) {
    if (iso >= c1) {
      const cd = daysBetween(iso, c1) + 1;
      if (cd >= 1 && cd <= 16) return cd;
    }
  }
  return null;
}

function buildEvents(appts: AppointmentRow[]): Record<string, Ev[]> {
  const ev: Record<string, Ev[]> = {};
  const add = (iso: string, e: Ev) => { (ev[iso] ||= []).push(e); };
  const range = (from: string, toExcl: string, e: Ev) => {
    for (let d = from; d < toExcl; d = addDays(d, 1)) add(d, e);
  };
  // medication bars (derived from the protocol windows)
  range(CYCLE.estraceStart, CYCLE.baseline, { kind: 'med', label: 'Estrace' });
  range(CYCLE.stimStart, CYCLE.trigger, { kind: 'med', label: 'Follistim + Menopur (pm)' });
  range(addDays(CYCLE.stimStart, 4), CYCLE.trigger, { kind: 'med', label: 'Ganirelix (am)' });
  // estimated milestones
  add(addDays(CYCLE.estraceStart, -5), { kind: 'est', label: 'Likely LH surge (+OPK)' });
  add(addDays(CYCLE.estraceStart, -3), { kind: 'est', label: 'Peak ovulation' });
  add(CYCLE.baseline, { kind: 'call', label: 'Period likely → call to book baseline' });
  add(addDays(CYCLE.stimStart, 3), { kind: 'est', label: 'Last day for exercise / intercourse' });
  add(CYCLE.trigger, { kind: 'est', label: 'Possible trigger — hCG + Lupron' });
  add(addDays(CYCLE.trigger, 1), { kind: 'est', label: 'No sex within 48h of retrieval' });
  // overlay live appointments
  appts.forEach((a) => {
    const d = dISO(a.Date);
    if (!d) return;
    const label = a.Appointment || 'appointment';
    add(d, { kind: /\bcall\b|period/i.test(label) ? 'call' : 'appt', label });
  });
  // sort each day's chips by kind priority
  Object.values(ev).forEach((list) => list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
  return ev;
}

function Chip({ kind, label }: Ev) {
  return <span className={`mt-0.5 block break-words rounded-sm border-l-2 px-1 py-0.5 text-[9.5px] leading-tight ${CHIP[kind]}`}>{label}</span>;
}

function MonthGrid({ y, m, events, today }: { y: number; m: number; events: Record<string, Ev[]>; today: string }) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (day: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const subtitle = m === new Date(`${CYCLE.stimStart}T00:00:00`).getMonth() ? 'the real deal' : 'getting lined up';
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-lg font-light tracking-tight text-espresso">{MONTH_NAMES[m]}</h3>
        <span className="text-xs text-taupe-500">— {subtitle}</span>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => <div key={i} className="text-center text-[10px] font-medium uppercase tracking-wide text-taupe-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className="min-h-[58px] rounded-md bg-sand/40" />;
          const d = iso(day);
          const cd = cdFor(d);
          const list = events[d] || [];
          const isToday = d === today;
          return (
            <div key={i} className={`min-h-[58px] rounded-md border p-1 ${isToday ? 'border-terracotta-400 bg-terracotta-50/40' : 'border-line bg-white'}`}>
              <div className="flex items-baseline justify-between">
                <span className={`text-[11px] font-semibold ${isToday ? 'text-terracotta-600' : 'text-espresso'}`}>{day}</span>
                {cd != null && <span className="text-[8.5px] font-medium text-taupe-400">CD{cd}</span>}
              </div>
              {list.map((e, j) => <Chip key={j} {...e} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Calendar() {
  const { data, loading } = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const appts = (data as AppointmentRow[] | null) || [];
  const today = todayISO();
  const events = buildEvents(appts);

  // months spanned by the cycle (OPK start → retrieval)
  const months: { y: number; m: number }[] = [];
  const first = new Date(`${CYCLE.opkStart}T00:00:00`);
  const last = new Date(`${CYCLE.retrieval}T00:00:00`);
  for (let c = new Date(first.getFullYear(), first.getMonth(), 1); c <= last; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
    months.push({ y: c.getFullYear(), m: c.getMonth() });
  }

  return (
    <div className="grid gap-6">
      <Reveal>
        <Card>
          <Eyebrow>the plain-english version</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-taupe-600">
            The goal is to grow a batch of eggs, then collect them.{' '}
            <span className="font-medium text-espresso">July</span> is lining Nina's body up — pee-stick tests to catch ovulation, then estrogen pills to even things out.{' '}
            <span className="font-medium text-espresso">August</span> is the real deal — nightly belly shots to grow the eggs, quick scans to watch them, one final trigger shot, then retrieval about two days later.
          </p>
          <p className="mt-3 rounded-xl bg-sand px-3.5 py-2.5 text-xs leading-relaxed text-taupe-600">
            Every August date is an <span className="font-medium text-terracotta-600">estimate</span> — the clinic sets the real dates from the scans once Nina's next period arrives. Call the coordinator (650-498-7911, opt 3/2) the day it starts.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {LEGEND.map((l) => (
              <span key={l.kind} className="inline-flex items-center gap-1.5 text-[11px] text-taupe-600">
                <span className={`inline-block h-3 w-3 rounded-sm border-l-2 ${CHIP[l.kind]}`} />{l.label}
              </span>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.05}>
        <Card>
          {loading && <div className="mb-3"><Loading /></div>}
          {months.map((mo) => <MonthGrid key={`${mo.y}-${mo.m}`} y={mo.y} m={mo.m} events={events} today={today} />)}
          <p className="text-[11px] leading-relaxed text-taupe-500">Prenatal vitamin (≥400mcg folic acid) daily throughout. CD = cycle day, counted from the first day of the period.</p>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card>
          <Eyebrow>what the words mean</Eyebrow>
          <dl className="mt-3 divide-y divide-line">
            {GLOSSARY.map(([term, def]) => (
              <div key={term} className="grid grid-cols-[104px_1fr] gap-3 py-2.5">
                <dt className="text-xs font-medium text-terracotta-600">{term}</dt>
                <dd className="text-xs leading-relaxed text-taupe-600">{def}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Reveal>
    </div>
  );
}
