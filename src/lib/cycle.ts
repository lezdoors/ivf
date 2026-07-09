// Pure cycle engine: computes the whole IVF timeline from a few inputs and
// recomputes when the real dates (actual OPK surge, actual next Cycle Day 1)
// are entered. No hardcoded dates except clinic-given absolute appointments.
// All dates are ISO `YYYY-MM-DD` strings; math is done in UTC so timezones
// can never shift a day.

export interface CycleInput {
  cd1: string; // last period Day 1, ISO date, e.g. "2026-07-05"
  cycleLength: number; // default 28
  actualSurge?: string; // actual positive OPK date, overrides the estimate
  actualStimCd1?: string; // actual next period Day 1 (called into clinic), overrides estimate
  estraceOffsetDays?: number; // default 5 (Estrace starts on "Day 5" — 5 days after peak ovulation)
  periodAfterEstraceMin?: number; // default 10
  periodAfterEstraceMax?: number; // default 12
}

export type MilestoneKind = 'fixed' | 'med' | 'action' | 'estimate';

export interface Milestone {
  id: string;
  date: string;
  title: string;
  kind: MilestoneKind;
  note?: string;
  isEstimate: boolean; // still an estimate vs. locked by a real entered date
}

// A span of daily medication (inclusive start, exclusive end) for calendar bars.
export interface MedWindow {
  id: string;
  label: string;
  start: string;
  endExclusive: string;
  isEstimate: boolean;
}

// Ongoing items (e.g. daily prenatal) — represented once, not as one dot per day.
export interface OngoingItem {
  id: string;
  label: string;
  from: string;
}

export interface CycleResult {
  opkStart: string;
  estimatedOvulation: string;
  estimatedSurge: string;
  surge: string;
  surgeIsActual: boolean;
  estraceStart: string;
  nextPeriodWindow: [string, string];
  stimCd1: string;
  stimCd1IsActual: boolean;
  stimCd2: string;
  day5Ultrasound: string;
  triggerEstimate: string;
  retrievalEstimate: string;
  milestones: Milestone[];
  medWindows: MedWindow[];
  ongoing: OngoingItem[];
}

// --- date helpers (local, tiny — date-fns is not in this project) -------------
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}
export const isValidISO = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const CLINIC_PHONE = '650-498-7911 (opt 3/2)';

// Clinic-given ABSOLUTE appointments (the clinic gave these as dates, not
// offsets — they do not move when the cycle shifts).
const FIXED_APPOINTMENTS: Milestone[] = [
  { id: 'ivf-class', date: '2026-07-14', title: 'IVF class — 7:30 AM', kind: 'fixed', isEstimate: false },
  { id: 'pgt-class', date: '2026-07-14', title: 'PGT class — 1:00 PM', kind: 'fixed', note: 'Partner must attend.', isEstimate: false },
  { id: 'consent-signing', date: '2026-07-27', title: 'Consent signing w/ Dr. Milki — 4:00 PM', kind: 'fixed', note: 'Partner must attend.', isEstimate: false },
];

export function computeCycle(input: CycleInput): CycleResult {
  const { cd1 } = input;
  const cycleLength = input.cycleLength || 28;
  const estraceOffset = input.estraceOffsetDays ?? 5;
  const pMin = input.periodAfterEstraceMin ?? 10;
  const pMax = input.periodAfterEstraceMax ?? 12;

  // Peak ovulation per the couple's planning sheet: "day 14 — 14 days after
  // the start of the period" (generalised: cycleLength − 14 days after cd1,
  // luteal phase held at 14). The LH surge is the day before; a real positive
  // OPK overrides it and shifts everything downstream.
  const estimatedOvulation = addDays(cd1, cycleLength - 14);
  const estimatedSurge = addDays(estimatedOvulation, -1);
  const surgeIsActual = isValidISO(input.actualSurge);
  const surge = surgeIsActual ? input.actualSurge! : estimatedSurge;
  const ovulation = surgeIsActual ? addDays(surge, 1) : estimatedOvulation;

  // Estrace starts on "Day 5" — Day 1 is the day after peak ovulation.
  const estraceStart = addDays(ovulation, estraceOffset);
  const nextPeriodWindow: [string, string] = [addDays(estraceStart, pMin), addDays(estraceStart, pMax)];
  const stimCd1IsActual = isValidISO(input.actualStimCd1);
  const stimCd1 = stimCd1IsActual ? input.actualStimCd1! : addDays(estraceStart, Math.round((pMin + pMax) / 2));
  const stimCd2 = addDays(stimCd1, 1);
  const day5Ultrasound = addDays(stimCd2, 4);
  const triggerEstimate = addDays(stimCd2, 9); // stim day ~10 — monitoring-dependent
  const retrievalEstimate = addDays(triggerEstimate, 2); // ~36h after trigger

  const opkStart = addDays(cd1, 6); // CD7 (sheet: OPK testing starts 7/11 for a 7/5 CD1)

  const unsorted: Milestone[] = [
    { id: 'cd1', date: cd1, title: 'Cycle Day 1 — period starts', kind: 'fixed', note: 'Daily prenatal (400mcg+ folic acid) from today onward.', isEstimate: false },
    { id: 'opk-start', date: opkStart, title: 'Start OPK testing (CD7)', kind: 'action', note: 'Test each morning until the stick turns positive — that is the LH surge.', isEstimate: false },
    ...FIXED_APPOINTMENTS,
    ...(surgeIsActual
      ? []
      : [{
          id: 'opk-no-peak-call',
          date: addDays(estimatedOvulation, -2),
          title: 'Call the office if the peak has not been reached yet',
          kind: 'action' as const,
          isEstimate: true,
        }]),
    {
      id: 'schedule-baseline-call',
      date: ovulation,
      title: 'Call Stanford — schedule the baseline U/S',
      kind: 'action',
      note: `${CLINIC_PHONE} — the baseline lands on CD1–2 of the next period.`,
      isEstimate: !surgeIsActual,
    },
    {
      id: 'surge',
      date: surge,
      title: surgeIsActual ? 'LH surge — confirmed (positive OPK)' : 'Likely LH surge (positive OPK)',
      kind: surgeIsActual ? 'fixed' : 'estimate',
      note: surgeIsActual ? undefined : 'Enter the real positive-OPK date above once it happens — everything after recomputes.',
      isEstimate: !surgeIsActual,
    },
    { id: 'ovulation', date: ovulation, title: 'Peak ovulation day', kind: 'estimate', isEstimate: !surgeIsActual },
    {
      id: 'estrace-start',
      date: estraceStart,
      title: 'Start Estrace (estrogen priming)',
      kind: 'med',
      note: `Day ${estraceOffset} — counted from the day after peak ovulation. Daily until the baseline scan.`,
      isEstimate: !surgeIsActual,
    },
    ...(stimCd1IsActual
      ? [{
          id: 'stim-cd1',
          date: stimCd1,
          title: 'Cycle Day 1 — confirmed (called into clinic)',
          kind: 'fixed' as const,
          isEstimate: false,
        }]
      : [{
          id: 'period-window',
          date: nextPeriodWindow[0],
          title: `Next period expected (${nextPeriodWindow[0].slice(5).replace('-', '/')}–${nextPeriodWindow[1].slice(5).replace('-', '/')})`,
          kind: 'action' as const,
          note: `Call ${CLINIC_PHONE} on Day 1 — the clinic sets the real stim dates.`,
          isEstimate: true,
        }]),
    {
      id: 'baseline',
      date: stimCd2,
      title: 'Baseline U/S (CD2) + stop Estrace',
      kind: stimCd1IsActual ? 'fixed' : 'estimate',
      note: 'Transvaginal scan — must be clear (no cysts) to start the shots.',
      isEstimate: !stimCd1IsActual,
    },
    {
      id: 'stim-start',
      date: stimCd2,
      title: 'Start Follistim 300 + Menopur 150',
      kind: 'med',
      note: 'Every evening (PM), subcutaneous — tiny needle, just under the belly skin.',
      isEstimate: !stimCd1IsActual,
    },
    {
      id: 'day5-us',
      date: day5Ultrasound,
      title: 'Day-5 U/S — possible Ganirelix start',
      kind: stimCd1IsActual ? 'fixed' : 'estimate',
      note: 'Ganirelix at the same time each morning; monitoring every 1–3 days after.',
      isEstimate: !stimCd1IsActual,
    },
    {
      id: 'trigger',
      date: triggerEstimate,
      title: 'Possible trigger shot (HCG ± Lupron) — stim day ~10',
      kind: 'estimate',
      note: 'Monitoring-dependent — the scans set the real date.',
      isEstimate: true,
    },
    {
      id: 'abstinence',
      date: addDays(retrievalEstimate, -2),
      title: 'Male abstinence window starts',
      kind: 'action',
      note: 'No more than 48 hours before retrieval.',
      isEstimate: true,
    },
    {
      id: 'retrieval',
      date: retrievalEstimate,
      title: 'Egg retrieval — ~36h after trigger',
      kind: 'estimate',
      note: 'Short procedure under sedation. Monitoring-dependent.',
      isEstimate: true,
    },
  ];
  const milestones = [...unsorted].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const medWindows: MedWindow[] = [
    { id: 'estrace', label: 'Estrace', start: estraceStart, endExclusive: stimCd2, isEstimate: !surgeIsActual },
    // Sheet shows Follistim + Menopur nightly through trigger day (10 nights).
    { id: 'stims', label: 'Follistim + Menopur (pm)', start: stimCd2, endExclusive: addDays(triggerEstimate, 1), isEstimate: !stimCd1IsActual },
    { id: 'ganirelix', label: 'Ganirelix (am)', start: day5Ultrasound, endExclusive: triggerEstimate, isEstimate: !stimCd1IsActual },
  ];

  const ongoing: OngoingItem[] = [
    { id: 'prenatal', label: 'Daily prenatal (400mcg+ folic acid)', from: cd1 },
    { id: 'coq10', label: 'CoQ10 400mg', from: cd1 },
  ];

  return {
    opkStart,
    estimatedOvulation,
    estimatedSurge,
    surge,
    surgeIsActual,
    estraceStart,
    nextPeriodWindow,
    stimCd1,
    stimCd1IsActual,
    stimCd2,
    day5Ultrasound,
    triggerEstimate,
    retrievalEstimate,
    milestones,
    medWindows,
    ongoing,
  };
}
