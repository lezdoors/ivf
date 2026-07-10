import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, CalendarDays, HeartPulse, Pill, Bot, Send, RefreshCw, AlertTriangle, Syringe, FlaskConical,
} from 'lucide-react';
import * as api from './api';
import type { User, JournalRow, MonitoringRow, AppointmentRow, MedicationRow, LabResultRow } from './types';
import { useAsync, todayISO, dISO, compact, longDate, daysUntil, Reveal, Card, Eyebrow, Sparkline } from './ui';
import { computeCycle, diffDays, addDays } from './lib/cycle';
import type { CycleInput, CycleResult, Milestone, MilestoneKind } from './lib/cycle';
import { GLOSSARY, TERM_RE, lookupTerm } from './lib/glossary';

// The cycle timeline is COMPUTED (src/lib/cycle.ts) from a few editable inputs:
// last period Day 1 + cycle length, overridden by the real +OPK surge and the
// real next Cycle Day 1 once they're entered on the calendar tab. Nothing here
// hardcodes protocol dates — everything recomputes when the inputs change.
const CYCLE_INPUT_KEY = 'ivf-cycle-input';
const CYCLE_DEFAULTS: CycleInput = { cd1: '2026-07-05', cycleLength: 28 };
function loadCycleInput(): CycleInput {
  try {
    const raw = localStorage.getItem(CYCLE_INPUT_KEY);
    return raw ? { ...CYCLE_DEFAULTS, ...JSON.parse(raw) } : CYCLE_DEFAULTS;
  } catch {
    return CYCLE_DEFAULTS;
  }
}
function saveCycleInput(v: CycleInput) {
  try {
    localStorage.setItem(CYCLE_INPUT_KEY, JSON.stringify(v));
  } catch { /* private mode — inputs just won't persist */ }
}

// Phase derives from today's date so the dashboard stays current without redeploys.
function cyclePhase(r: CycleResult): string {
  const t = todayISO();
  if (t < r.opkStart) return `Pre-cycle — OPK testing begins ${compact(r.opkStart)}`;
  if (t < r.estraceStart) return 'OPK testing — watching for the LH surge';
  if (t < r.stimCd1) return `Estrogen priming (estrace) — stim cycle ~${compact(r.stimCd2)}`;
  if (t < r.stimCd2) return 'Baseline — stimulation begins on Cycle Day 2';
  if (t < r.triggerEstimate) return `Stimulation · day ${diffDays(t, r.stimCd2) + 1} of stims`;
  if (t < r.retrievalEstimate) return `Trigger window — retrieval ~${compact(r.retrievalEstimate)}`;
  if (t === r.retrievalEstimate) return 'Retrieval day';
  return 'Post-retrieval';
}

const HUB = {
  clinic: 'Stanford · Dr. Amin Milki',
  patient: 'Nina Noe-Chapuis',
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

// ---- Today checklist ----------------------------------------------------------
// The one question a companion must answer every morning: what do we do today?
// Items derive from the cycle engine (meds windows, OPK window) + today's
// appointments. Check state is device-local per day.
type TodayItem = { id: string; label: string; sub?: string };

function todayItems(r: CycleResult, appts: AppointmentRow[]): TodayItem[] {
  const t = todayISO();
  const items: TodayItem[] = [];
  if (!r.surgeIsActual && t >= r.opkStart && t <= r.estimatedSurge) {
    items.push({ id: 'opk', label: 'OPK test', sub: 'first morning pee — when it turns positive, enter the date on the calendar tab' });
  }
  if (t >= r.estraceStart && t < r.stimCd2) items.push({ id: 'estrace', label: 'Estrace', sub: 'estrogen priming — daily until the baseline scan' });
  if (t >= r.day5Ultrasound && t < r.triggerEstimate) items.push({ id: 'ganirelix', label: 'Ganirelix', sub: 'morning, same time each day' });
  if (t >= r.stimCd2 && t <= r.triggerEstimate) items.push({ id: 'stims', label: 'Follistim 300 + Menopur 150', sub: 'evening (PM), subcutaneous' });
  items.push({ id: 'prenatal', label: 'Prenatal vitamin', sub: '400mcg+ folic acid' });
  items.push({ id: 'coq10', label: 'CoQ10 400mg' });
  for (const a of appts) {
    if (dISO(a.Date) === t) items.push({ id: `appt-${a.id}`, label: a.Appointment || 'Appointment', sub: [a.Prep, a.Clinic].filter(Boolean).join(' · ') || 'appointment today' });
  }
  return items;
}

const checksKey = () => `ivf-checks-${todayISO()}`;
function loadChecks(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(checksKey()) || '{}'); } catch { return {}; }
}

function TodayChecklist({ r, appts }: { r: CycleResult; appts: AppointmentRow[] }) {
  const items = todayItems(r, appts);
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const toggle = (id: string) => setChecks((c) => {
    const next = { ...c, [id]: !c[id] };
    try { localStorage.setItem(checksKey(), JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const done = items.filter((i) => checks[i.id]).length;
  const allDone = items.length > 0 && done === items.length;
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <Eyebrow>today · {compact(todayISO())}</Eyebrow>
        <span className={`text-xs ${allDone ? 'font-medium text-sage-500' : 'text-taupe-500'}`}>{allDone ? 'all done — rest easy' : `${done} of ${items.length}`}</span>
      </div>
      <div className="divide-y divide-line">
        {items.map((i) => {
          const isDone = !!checks[i.id];
          return (
            <button
              key={i.id} type="button" onClick={() => toggle(i.id)} aria-pressed={isDone}
              className="flex w-full items-center gap-3.5 py-3 text-left first:pt-0 last:pb-0"
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ${isDone ? 'bg-sage-500' : 'bg-white card-inset'}`} aria-hidden>
                {isDone && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5 5 9l4.5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium transition-colors duration-150 ${isDone ? 'text-taupe-400' : 'text-espresso'}`}>{i.label}</span>
                {i.sub && <span className={`block text-xs leading-snug ${isDone ? 'text-taupe-400/70' : 'text-taupe-500'}`}>{i.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Reminders (web push) ------------------------------------------------------
// Loss-aversion framing, calm delivery: two digests a day (morning + evening),
// derived from the Notion rows. iOS needs the app installed first.
function RemindersCard({ user }: { user: User }) {
  const [state, setState] = useState<api.PushState | 'loading' | 'working'>('loading');
  React.useEffect(() => { api.pushState().then(setState); }, []);

  if (state === 'loading' || state === 'unsupported') return null;

  const enable = async () => {
    setState('working');
    try { setState(await api.enablePush(user)); } catch { setState('off'); }
  };
  const disable = async () => {
    setState('working');
    setState(await api.disablePush());
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <strong className="block text-sm font-medium text-espresso">
          {state === 'on' ? 'reminders are on for this device' : 'never miss a dose'}
        </strong>
        <p className="mt-0.5 text-xs leading-relaxed text-taupe-500">
          {state === 'needs-install' ? (
            <>first add the app to your home screen (share <span aria-hidden>→</span> "Add to Home Screen"), then come back here to turn on reminders.</>
          ) : state === 'denied' ? (
            <>notifications are blocked for this site — allow them in your browser settings, then try again.</>
          ) : state === 'on' ? (
            <>a gentle morning note (appointments, OPK) and an evening one (the shots). that's all — never more.</>
          ) : (
            <>two quiet notes a day: mornings for appointments &amp; OPK, evenings for the injections.</>
          )}
        </p>
      </div>
      {(state === 'off' || state === 'working') && (
        <button onClick={enable} disabled={state === 'working'} className={primaryButtonClass}>
          {state === 'working' ? 'setting up…' : 'turn on reminders'}
        </button>
      )}
      {state === 'on' && (
        <button onClick={disable} className="inline-flex min-h-[40px] items-center rounded-xl px-4 text-xs font-medium text-taupe-500 card-inset">
          turn off
        </button>
      )}
    </Card>
  );
}

// ---- Dashboard --------------------------------------------------------------
export function Dashboard({ user }: { user: User }) {
  const cycle = useMemo(() => computeCycle(loadCycleInput()), []);
  const appts = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const mon = useAsync(() => api.listDb('monitoring', 'Date', 'desc'), []);
  const apptRows = (appts.data as AppointmentRow[] | null) || [];
  const authLeft = daysUntil(HUB.authExpires);
  const authCritical = authLeft != null && authLeft < 45;
  const nextAppt = apptRows.find((a) => (dISO(a.Date) || '9999') >= todayISO());
  const latest = (mon.data as MonitoringRow[] | null)?.[0];
  const t = todayISO();
  const nextMilestone = cycle.milestones.find((m) => m.date > t);

  const stats = [
    { icon: CalendarDays, value: nextMilestone ? `${diffDays(nextMilestone.date, t)}d` : '—', label: nextMilestone ? `${nextMilestone.title.split('—')[0].trim().toLowerCase()} · ${compact(nextMilestone.date)}` : 'no upcoming milestone', critical: false },
    { icon: Syringe, value: compact(cycle.stimCd2), label: cycle.stimCd1IsActual ? 'stim start' : 'stim start (est.)', critical: false },
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
        <h1 className="text-2xl font-light leading-snug tracking-tight text-espresso sm:text-3xl">{cyclePhase(cycle)}</h1>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-taupe-500">
          <span>{HUB.clinic}</span>
          <span>· patient {HUB.patient}</span>
          <span>· planned start {compact(cycle.stimCd2)}</span>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <TodayChecklist r={cycle} appts={apptRows} />
      </Reveal>

      <Reveal delay={0.16}>
        <RemindersCard user={user} />
      </Reveal>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={0.18 + i * 0.05}>
            <Card className="flex h-full flex-col gap-2">
              <s.icon size={16} className={s.critical ? 'text-terracotta-500' : 'text-taupe-400'} />
              <strong className={`text-2xl font-light leading-none tracking-tight ${s.critical ? 'text-terracotta-500' : 'text-espresso'}`}>{s.value}</strong>
              <span className="text-xs leading-snug text-taupe-500">{s.label}</span>
            </Card>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.34}>
        <Card>
          <Eyebrow className="mb-4">next appointment</Eyebrow>
          {appts.loading ? <Loading /> : appts.error ? <ErrorNote error={appts.error} /> : nextAppt ? (
            <div>
              <strong className="text-base font-medium text-espresso">{nextAppt.Appointment}</strong>
              <p className="mt-2 text-sm text-taupe-600">{longDate(nextAppt.Date)} · {[nextAppt.Provider, nextAppt.Clinic].filter(Boolean).join(' · ')}</p>
              {nextAppt.Prep && <p className="mt-1 text-sm text-taupe-500">prep: {nextAppt.Prep}</p>}
            </div>
          ) : <p className="text-sm text-taupe-500">nothing upcoming.</p>}
        </Card>
      </Reveal>

      {/* Insurance/admin lives folded away — visible when it needs action, never
          ambient anxiety on a calm screen. */}
      <Reveal delay={0.4}>
        <details open={authCritical} className="group rounded-2xl bg-white p-6 card-inset sm:p-8">
          <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <Eyebrow className="flex items-center gap-2">
              {authCritical && <AlertTriangle size={13} className="text-terracotta-500" />} insurance &amp; admin
            </Eyebrow>
            <span className={`text-xs ${authCritical ? 'font-medium text-terracotta-500' : 'text-taupe-400'}`}>
              auth expires {compact(HUB.authExpires)} · {authLeft}d {authCritical ? '— act soon' : ''}
            </span>
          </summary>
          <ul className="mt-4 divide-y divide-line">
            {HUB.risks.map((r) => <li key={r} className="py-2.5 text-sm leading-relaxed text-taupe-600 first:pt-0 last:pb-0">{r}</li>)}
          </ul>
        </details>
      </Reveal>
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
          {loading ? <Loading /> : error ? <ErrorNote error={error} /> : rows.length === 0 ? (
            <p className="text-sm leading-relaxed text-taupe-500">
              nothing here yet — and that's right on schedule. scans begin at the baseline ultrasound (~{compact(computeCycle(loadCycleInput()).stimCd2)}); every one you log will trend here.
            </p>
          ) : (
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

// ---- Journal (+ the cycle garden, per-user private) ---------------------------
// The garden grows along the CYCLE, not the calendar year. One slot per cycle
// day; each journal entry grows a small watercolor bloom — raspberry for Nina,
// sage for Ryan, terracotta when shared. Empty days are soil, not deficits.
// Nina's hummingbird visits the newest bloom.
const BLOOM: Record<string, { petal: string; heart: string }> = {
  Nina: { petal: '#8B3348', heart: '#A44458' },
  Ryan: { petal: '#676536', heart: '#8A8A5E' },
  Both: { petal: '#B8735A', heart: '#C98868' },
};
const DAY_W = 26;
const G_H = 148;
const SOIL_Y = 106;

// NOTE: CSS `transform`/`animation` on an SVG element OVERRIDES its transform
// attribute — so positioning lives on an OUTER <g> and any animated styles go
// on an INNER <g>, never the same element.
function GardenBloom({ x, author, tall, delay }: { x: number; author: string; tall: number; delay: number }) {
  const c = BLOOM[author] || BLOOM.Both;
  const h = 26 + tall * 8; // stem height varies gently so the bed feels organic
  return (
    <g transform={`translate(${x},${SOIL_Y})`}>
      <g style={{ opacity: 0, animation: `bloomIn .5s cubic-bezier(.22,1,.36,1) ${delay}s forwards` }}>
        <path d={`M0,0 C0,${-h * 0.5} ${tall % 2 ? 2 : -2},${-h * 0.72} 0,${-h}`} stroke="#6B7050" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx={-5.5} cy={-h - 3.5} rx={6} ry={8.5} fill={c.petal} opacity=".5" transform={`rotate(-26 ${-5.5} ${-h - 3.5})`} />
        <ellipse cx={5.5} cy={-h - 3.5} rx={6} ry={8.5} fill={c.petal} opacity=".5" transform={`rotate(26 ${5.5} ${-h - 3.5})`} />
        <ellipse cx={0} cy={-h - 7} rx={6} ry={9.5} fill={c.heart} opacity=".82" />
      </g>
    </g>
  );
}

function Hummingbird({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x - 18},${y})`}>
      <g className="hb-float">
        <path d="M2 10 C6 4 14 2 20 6 C26 2 34 4 36 10 C30 8 26 9 22 12 C18 15 14 15 10 12 C7 10 4 10 2 10 Z" fill="#5E5A50" opacity=".85" />
        <path d="M20 6 C18 -2 24 -6 28 -4 C24 0 23 3 22 7 Z" fill="#8B8178" opacity=".8" />
        <path d="M2 10 L-7 12.5" stroke="#33241D" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="9" cy="8" r="1" fill="#33241D" />
      </g>
    </g>
  );
}

function CycleGarden({ entries, user }: { entries: JournalRow[]; user: User }) {
  const input = loadCycleInput();
  const r = useMemo(() => computeCycle(input), [input.cd1, input.cycleLength, input.actualSurge, input.actualStimCd1]);
  const scroller = React.useRef<HTMLDivElement>(null);
  const today = todayISO();
  const start = input.cd1;
  const end = addDays(r.retrievalEstimate, 4);
  const nDays = diffDays(end, start) + 1;
  const days = Array.from({ length: nDays }, (_, i) => addDays(start, i));
  const xFor = (iso: string) => 20 + diffDays(iso, start) * DAY_W;

  // newest entry per day wins the slot; the freshest overall gets the bird
  const byDate = new Map<string, JournalRow>();
  let newest: string | null = null;
  for (const e of entries) {
    const d = dISO(e.Date);
    if (d >= start && d <= end) {
      byDate.set(d, e);
      if (!newest || d > newest) newest = d;
    }
  }
  const blooms = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const markers = [
    { date: r.stimCd2, label: 'baseline' },
    { date: r.triggerEstimate, label: 'trigger' },
    { date: r.retrievalEstimate, label: 'retrieval' },
  ];

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = xFor(newest || today) - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest]);

  const width = nDays * DAY_W + 40;
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <Eyebrow>this cycle's garden</Eyebrow>
        <span className="text-sm text-taupe-500">
          {blooms.length === 0 ? 'ready for its first bloom' : <><strong className="font-medium text-espresso">{blooms.length}</strong> {blooms.length === 1 ? 'bloom' : 'blooms'}</>}
        </span>
      </div>
      <div ref={scroller} className="no-scrollbar -mx-2 overflow-x-auto px-2">
        <svg width={width} height={G_H} viewBox={`0 0 ${width} ${G_H}`} role="img" aria-label={`Cycle garden: ${blooms.length} journal entries as blooms between ${compact(start)} and ${compact(end)}`}>
          <style>{'@keyframes bloomIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}'}</style>
          {/* soil */}
          <line x1={12} y1={SOIL_Y} x2={width - 12} y2={SOIL_Y} stroke="#D8CFC2" strokeWidth="1.5" strokeLinecap="round" />
          {days.map((d, i) => {
            if (byDate.has(d)) return null;
            const future = d > today;
            return <circle key={d} cx={20 + i * DAY_W} cy={SOIL_Y} r={2.2} fill={future ? '#E5DED3' : '#CBC1B2'} />;
          })}
          {/* milestone markers — labels stagger so close dates don't collide */}
          {markers.map((m, mi) => (m.date >= start && m.date <= end) && (
            <g key={m.label} transform={`translate(${xFor(m.date)},0)`}>
              <line x1={0} y1={14 + (mi % 2) * 12 + 4} x2={0} y2={SOIL_Y - 4} stroke="#C98868" strokeWidth="1.2" strokeDasharray="3 4" opacity=".7" />
              <text x={0} y={12 + (mi % 2) * 12} textAnchor="middle" fontSize="9" fontWeight="600" letterSpacing=".08em" fill="#9C5D47">{m.label.toUpperCase()}</text>
            </g>
          ))}
          {/* blooms */}
          {blooms.map(([d, e], i) => (
            <GardenBloom key={d} x={xFor(d)} author={e.Author || (user === 'Both' ? 'Both' : user)} tall={(diffDays(d, start) * 7) % 3} delay={Math.min(i * 0.06, 0.8)} />
          ))}
          {/* the hummingbird visits the newest bloom */}
          {newest && <Hummingbird x={xFor(newest) + 30} y={SOIL_Y - 78} />}
          {/* day labels: today + weekly cycle days */}
          {days.map((d, i) => {
            const isToday = d === today;
            if (!isToday && i % 7 !== 0) return null;
            return (
              <text key={`l${d}`} x={20 + i * DAY_W} y={G_H - 22} textAnchor="middle" fontSize="9" fontWeight={isToday ? 700 : 500} fill={isToday ? '#B8735A' : '#A79E93'}>
                {isToday ? 'today' : compact(d)}
              </text>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-center text-xs text-taupe-500">
        {blooms.length === 0
          ? 'write your first page below — it plants the first bloom.'
          : user === 'Both'
            ? 'every page either of you writes grows here — raspberry is nina, sage is ryan, terracotta is shared.'
            : `${user.toLowerCase()}'s garden — your pages and shared ones. the bird keeps the newest company.`}
      </p>
    </Card>
  );
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
      {/* min-w-0: the garden's wide SVG must scroll inside its card, not widen
          the grid track (grid items default to min-width:auto). */}
      <Reveal className="min-w-0">
        <CycleGarden entries={visible} user={user} />
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
  const cycle = useMemo(() => computeCycle(loadCycleInput()), []);
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
        <TodayChecklist r={cycle} appts={[]} />
      </Reveal>
      <Reveal delay={0.08}>
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
const SHERPA_CHIPS = [
  "what's happening this week?",
  'explain Ganirelix',
  'prep me for the next appointment',
  'what happens after retrieval?',
];

export function Agent({ user }: { user: User }) {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ q: string; a?: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async (raw: string) => {
    const question = raw.trim();
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
            {thread.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SHERPA_CHIPS.map((c) => (
                  <button
                    key={c} type="button" onClick={() => ask(c)} disabled={busy}
                    className="rounded-full bg-sand px-3.5 py-2 text-xs font-medium text-taupe-600 card-inset transition-colors hover:text-espresso disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
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
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ask dr. sherpa…" className={`${inputClass} flex-1 rounded-full`} />
            <button className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-espresso text-white transition-opacity disabled:opacity-50" disabled={busy}><Send size={16} /></button>
          </form>
        </Card>
      </Reveal>
    </div>
  );
}

// ---- Calendar ---------------------------------------------------------------
// The whole cycle, computed live from the inputs panel (src/lib/cycle.ts).
// Editing any input — cd1, cycle length, the real +OPK date, the real next
// Cycle Day 1 — recomputes every milestone, med bar and cycle-day badge.
// Live appointments from Notion are overlaid on top.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CHIP: Record<MilestoneKind, string> = {
  fixed: 'border-espresso bg-espresso/[0.06] text-espresso',
  med: 'border-terracotta-500 bg-terracotta-50 text-terracotta-600',
  estimate: 'border-taupe-400 border-dashed bg-taupe-400/10 text-taupe-600',
  action: 'border-terracotta-600 bg-terracotta-100 text-terracotta-600 font-semibold',
};
const DOT: Record<MilestoneKind, string> = {
  fixed: 'bg-espresso',
  med: 'bg-terracotta-500',
  estimate: 'border border-dashed border-taupe-500 bg-transparent',
  action: 'bg-terracotta-600',
};
const KIND_ORDER: Record<MilestoneKind, number> = { action: 0, fixed: 1, med: 2, estimate: 3 };
const LEGEND: { kind: MilestoneKind; label: string }[] = [
  { kind: 'fixed', label: 'Appointment / confirmed' },
  { kind: 'med', label: 'Medication' },
  { kind: 'estimate', label: 'Estimate' },
  { kind: 'action', label: 'Call the clinic' },
];

// --- glossary tooltips: any known term in running text is tap/hover-to-reveal.
function Term({ children }: { children: string }) {
  const [open, setOpen] = useState(false);
  const entry = lookupTerm(children);
  if (!entry) return <>{children}</>;
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="cursor-help underline decoration-taupe-400 decoration-dotted underline-offset-2"
      >
        {children}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-20 mb-1.5 block w-56 max-w-[70vw] -translate-x-1/2 rounded-lg bg-espresso px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white shadow-lg">
          <span className="font-semibold">{entry.term}</span> — {entry.def}
        </span>
      )}
    </span>
  );
}

// Splits text on glossary terms and makes each one tappable.
function GlossaryText({ text }: { text: string }) {
  const parts = text.split(TERM_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <Term key={i}>{p}</Term> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </>
  );
}

function EstBadge() {
  return <span className="ml-1.5 inline-block rounded-sm border border-dashed border-taupe-400 px-1 py-px align-middle text-[9px] font-medium uppercase tracking-wide text-taupe-500">est.</span>;
}

// --- inputs panel: edit → everything recomputes live -------------------------
function CycleSettings({ value, onChange }: { value: CycleInput; onChange: (v: CycleInput) => void }) {
  const set = (k: keyof CycleInput, v: string | number | undefined) => onChange({ ...value, [k]: v });
  return (
    <Card>
      <Eyebrow className="mb-4">cycle inputs — edit and everything recomputes</Eyebrow>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className={labelClass}>
          last period day 1
          <input type="date" value={value.cd1} onChange={(e) => e.target.value && set('cd1', e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          cycle length (days)
          <input
            type="number" min={21} max={45} inputMode="numeric" value={value.cycleLength}
            onChange={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) set('cycleLength', Math.min(45, Math.max(21, n))); }}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          actual +OPK (surge)
          <input type="date" value={value.actualSurge ?? ''} onChange={(e) => set('actualSurge', e.target.value || undefined)} className={inputClass} />
        </label>
        <label className={labelClass}>
          actual next day 1
          <input type="date" value={value.actualStimCd1 ?? ''} onChange={(e) => set('actualStimCd1', e.target.value || undefined)} className={inputClass} />
        </label>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-taupe-500">
        Leave the last two empty until they really happen — entering the real positive <GlossaryText text="OPK" /> or the real next Day&nbsp;1 turns the tentative dates into locked ones (clear the field to go back to estimates).
      </p>
    </Card>
  );
}

// --- Notion is the source of truth --------------------------------------------
// Live appointment rows override the engine's computed milestones: an engine
// milestone is suppressed when a Notion row on the SAME date matches its
// intent, and appointments merge into the agenda as confirmed items. If the
// engine shifts (real dates entered) while Notion still has the old date, both
// show — a visible contradiction that says "update Notion".
const MILESTONE_MATCH: Record<string, RegExp> = {
  'opk-start': /opk/i,
  'ivf-class': /ivf class/i,
  'pgt-class': /pgt/i,
  'consent-signing': /consent/i,
  'estrace-start': /estrace|estradiol/i,
  'baseline': /baseline/i,
  'day5-us': /day.?5|monitoring/i,
  'retrieval': /retrieval/i,
  'trigger': /trigger/i,
  'opk-no-peak-call': /peak/i,
  'schedule-baseline-call': /schedule|stanford/i,
};
function dedupeAgainstNotion(milestones: Milestone[], appts: AppointmentRow[]): Milestone[] {
  return milestones.filter((m) => {
    const re = MILESTONE_MATCH[m.id];
    if (!re) return true;
    return !appts.some((a) => dISO(a.Date) === m.date && re.test(a.Appointment || ''));
  });
}
function apptToMilestone(a: AppointmentRow): Milestone | null {
  const d = dISO(a.Date);
  if (!d) return null;
  const title = a.Appointment || 'Appointment';
  const hasTime = !!a.Date && a.Date.length > 10;
  const time = hasTime ? new Date(a.Date!).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }) : '';
  const note = [a.Prep, [a.Provider, a.Clinic].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
  return {
    id: `appt-${a.id}`,
    date: d,
    title: time ? `${title} — ${time}` : title,
    kind: /\bcall\b|period|peak/i.test(title) ? 'action' : 'fixed',
    note: note || undefined,
    isEstimate: false,
  };
}

// --- month grid ---------------------------------------------------------------
type Ev = { kind: MilestoneKind; label: string; isEstimate: boolean };

function buildEvents(milestones: Milestone[], r: CycleResult, appts: AppointmentRow[]): Record<string, Ev[]> {
  const ev: Record<string, Ev[]> = {};
  const add = (iso: string, e: Ev) => { (ev[iso] ||= []).push(e); };
  // daily medication bars
  for (const w of r.medWindows) {
    for (let d = w.start; d < w.endExclusive; d = addDays(d, 1)) add(d, { kind: 'med', label: w.label, isEstimate: w.isEstimate });
  }
  // milestones, already deduped against Notion (skip med *starts* — the bars above show them)
  for (const m of milestones) {
    if (m.kind === 'med') continue;
    add(m.date, { kind: m.kind, label: m.title, isEstimate: m.isEstimate });
  }
  // overlay live appointments from Notion
  for (const a of appts) {
    const d = dISO(a.Date);
    if (!d) continue;
    const label = a.Appointment || 'appointment';
    add(d, { kind: /\bcall\b|period/i.test(label) ? 'action' : 'fixed', label, isEstimate: false });
  }
  Object.values(ev).forEach((list) => list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));
  return ev;
}

function Chip({ kind, label, isEstimate }: Ev) {
  return (
    <span className={`mt-0.5 block break-words rounded-sm border-l-2 px-1 py-0.5 text-[9.5px] leading-tight ${CHIP[kind]} ${isEstimate && kind !== 'estimate' ? 'border-dashed' : ''}`}>
      {isEstimate ? `~ ${label}` : label}
    </span>
  );
}

function MonthGrid({ y, m, events, today, cdFor, isStimMonth }: {
  y: number; m: number; events: Record<string, Ev[]>; today: string;
  cdFor: (iso: string) => number | null; isStimMonth: boolean;
}) {
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = new Date(y, m, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (day: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-lg font-light tracking-tight text-espresso">{MONTH_NAMES[m]}</h3>
        <span className="text-xs text-taupe-500">— {isStimMonth ? 'the real deal' : 'getting lined up'}</span>
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

// --- agenda: phone-first milestone list grouped by month ----------------------
// Receives engine milestones (deduped) MERGED with live Notion appointments.
function Agenda({ items }: { items: Milestone[] }) {
  const today = todayISO();
  const groups: { ym: string; items: Milestone[] }[] = [];
  for (const m of items) {
    const ym = m.date.slice(0, 7);
    const g = groups[groups.length - 1];
    if (g && g.ym === ym) g.items.push(m);
    else groups.push({ ym, items: [m] });
  }
  return (
    <div className="grid gap-5">
      {groups.map(({ ym, items }) => (
        <div key={ym}>
          <h3 className="mb-1 text-lg font-light tracking-tight text-espresso">{MONTH_NAMES[Number(ym.slice(5)) - 1]}</h3>
          <ol className="divide-y divide-line">
            {items.map((m) => {
              const past = m.date < today;
              const isToday = m.date === today;
              return (
                <li key={m.id} className={`flex gap-3 py-2.5 ${past ? 'opacity-45' : ''}`}>
                  <div className="w-16 shrink-0 pt-px text-right">
                    <span className={`block text-xs font-medium ${isToday ? 'text-terracotta-600' : 'text-espresso'}`}>{compact(m.date)}</span>
                    <span className="block text-[10px] text-taupe-400">
                      {new Date(`${m.date}T00:00:00`).toLocaleDateString('en', { weekday: 'short' }).toLowerCase()}
                    </span>
                  </div>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[m.kind]}`} aria-hidden />
                  <div className="min-w-0">
                    <span className="text-sm leading-snug text-espresso">
                      <GlossaryText text={m.title} />
                      {m.isEstimate && <EstBadge />}
                    </span>
                    {m.note && <p className="mt-0.5 text-xs leading-relaxed text-taupe-500"><GlossaryText text={m.note} /></p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function Calendar() {
  const [input, setInput] = useState<CycleInput>(loadCycleInput);
  const update = (v: CycleInput) => { setInput(v); saveCycleInput(v); };
  const r = useMemo(() => computeCycle(input), [input]);
  const { data, loading } = useAsync(() => api.listDb('appointments', 'Date', 'asc'), []);
  const appts = (data as AppointmentRow[] | null) || [];
  const today = todayISO();
  // Notion wins: suppress engine milestones matched by a same-date Notion row,
  // then merge appointments into the agenda as confirmed items.
  const deduped = useMemo(() => dedupeAgainstNotion(r.milestones, appts), [r, data]);
  const agendaItems = useMemo(() => {
    const merged = [...deduped, ...appts.map(apptToMilestone).filter((m): m is Milestone => m !== null)];
    return merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [deduped, data]);
  const events = useMemo(() => buildEvents(deduped, r, appts), [deduped, r, data]);

  // cycle-day badge: current cycle from cd1, stim cycle from the (real or
  // estimated) next Day 1 — the stim cycle wins once it starts.
  const cdFor = (iso: string): number | null => {
    if (iso >= r.stimCd1) {
      const cd = diffDays(iso, r.stimCd1) + 1;
      return cd <= 20 ? cd : null;
    }
    if (iso >= input.cd1) {
      const cd = diffDays(iso, input.cd1) + 1;
      return cd <= input.cycleLength ? cd : null;
    }
    return null;
  };

  // months spanned by the cycle (CD1 → retrieval)
  const months: { y: number; m: number }[] = [];
  const first = new Date(`${input.cd1}T00:00:00`);
  const last = new Date(`${r.retrievalEstimate}T00:00:00`);
  for (let c = new Date(first.getFullYear(), first.getMonth(), 1); c <= last; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
    months.push({ y: c.getFullYear(), m: c.getMonth() });
  }
  const stimMonth = Number(r.stimCd2.slice(5, 7)) - 1;
  const stimYear = Number(r.stimCd2.slice(0, 4));
  const primingMonth = MONTH_NAMES[first.getMonth()];

  return (
    <div className="grid gap-6">
      <Reveal>
        <Card>
          <Eyebrow>the plain-english version</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-taupe-600">
            The goal is to grow a batch of eggs, then collect them.{' '}
            <span className="font-medium text-espresso">{primingMonth}</span> is lining Nina's body up — <GlossaryText text="OPK" /> pee-stick tests to catch ovulation, then <GlossaryText text="Estrace" /> pills to even things out.{' '}
            <span className="font-medium text-espresso">{MONTH_NAMES[stimMonth]}</span> is the real deal — nightly belly shots (<GlossaryText text="Follistim 300 / Menopur 150" />) to grow the eggs, quick scans to watch them, one final <GlossaryText text="trigger" /> shot, then <GlossaryText text="retrieval" /> about two days later.
          </p>
          <p className="mt-3 rounded-xl bg-terracotta-50 px-3.5 py-2.5 text-xs leading-relaxed text-taupe-600">
            {r.stimCd1IsActual ? (
              <>Anchored on the <span className="font-medium text-terracotta-600">real Cycle Day 1</span> — but the trigger and retrieval dates still depend on the monitoring scans. The clinic sets those.</>
            ) : (
              <>These dates are <span className="font-medium text-terracotta-600">estimates</span> until Nina's real surge + next period are entered above. The clinic sets the real dates — call <a href="tel:+16504987911" className="font-medium text-terracotta-600 underline underline-offset-2">650-498-7911</a> (opt 3/2) on Day&nbsp;1.</>
            )}
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
        <CycleSettings value={input} onChange={update} />
      </Reveal>

      <Reveal delay={0.08}>
        <Card>
          <Eyebrow className="mb-4">milestones</Eyebrow>
          <Agenda items={agendaItems} />
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-taupe-500">
            {r.ongoing.map((o) => <span key={o.id}><GlossaryText text={o.label} /> from {compact(o.from)} onward, every day.</span>)}
          </p>
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card>
          {loading && <div className="mb-3"><Loading /></div>}
          {months.map((mo) => (
            <MonthGrid key={`${mo.y}-${mo.m}`} y={mo.y} m={mo.m} events={events} today={today} cdFor={cdFor} isStimMonth={mo.m === stimMonth && mo.y === stimYear} />
          ))}
          <p className="text-[11px] leading-relaxed text-taupe-500"><GlossaryText text="CD" /> = cycle day, counted from the first day of the period. Dashed chips (~) are still estimates.</p>
        </Card>
      </Reveal>

      <Reveal delay={0.12}>
        <Card>
          <Eyebrow>what the words mean</Eyebrow>
          <dl className="mt-3 divide-y divide-line">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="grid grid-cols-[130px_1fr] gap-3 py-2.5">
                <dt className="text-xs font-medium text-terracotta-600">{g.term}</dt>
                <dd className="text-xs leading-relaxed text-taupe-600">{g.def}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Reveal>
    </div>
  );
}
