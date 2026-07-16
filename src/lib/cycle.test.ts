import { describe, it, expect } from 'vitest';
import { computeCycle, addDays, diffDays } from './cycle';

const BASE = { cd1: '2026-07-05', cycleLength: 28 };

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2026-08-01', -2)).toBe('2026-07-30');
  });
  it('diffs days', () => {
    expect(diffDays('2026-08-03', '2026-07-05')).toBe(29);
  });
});

describe('computeCycle — 28-day default (cd1 = 2026-07-05)', () => {
  const r = computeCycle(BASE);

  it('estimates peak ovulation 14 days after CD1 (sheet rule, luteal held at 14)', () => {
    expect(r.estimatedOvulation).toBe('2026-07-19');
  });
  it('estimates the surge the day before ovulation', () => {
    expect(r.estimatedSurge).toBe('2026-07-18');
    expect(r.surge).toBe('2026-07-18');
    expect(r.surgeIsActual).toBe(false);
  });
  it('starts Estrace on Day 5 after peak ovulation', () => {
    expect(r.estraceStart).toBe('2026-07-24');
  });
  it('expects the next period 10–12 days after Estrace start', () => {
    expect(r.nextPeriodWindow).toEqual(['2026-08-03', '2026-08-05']);
  });
  it('estimates stim CD1 at the window midpoint (estrace + 11)', () => {
    expect(r.stimCd1).toBe('2026-08-04');
    expect(r.stimCd1IsActual).toBe(false);
    expect(r.stimCd2).toBe('2026-08-05');
  });
  it('derives day-5 U/S, trigger (~stim day 10) and retrieval (+2)', () => {
    expect(r.day5Ultrasound).toBe('2026-08-09');
    expect(r.triggerEstimate).toBe('2026-08-14');
    expect(r.retrievalEstimate).toBe('2026-08-16');
  });
  it('starts OPK testing on CD7 (sheet: 7/11)', () => {
    expect(r.milestones.find((m) => m.id === 'opk-start')?.date).toBe('2026-07-11');
  });
  it('includes the fixed clinic appointments', () => {
    const ids = r.milestones.map((m) => m.id);
    expect(ids).toContain('ivf-class');
    expect(ids).toContain('pgt-class');
    expect(ids).toContain('consent-signing');
    expect(r.milestones.find((m) => m.id === 'consent-signing')?.date).toBe('2026-07-27');
  });
  it('flags everything derived from estimates as isEstimate', () => {
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId['surge'].isEstimate).toBe(true);
    expect(byId['estrace-start'].isEstimate).toBe(true);
    expect(byId['baseline'].isEstimate).toBe(true);
    expect(byId['trigger'].isEstimate).toBe(true);
    expect(byId['retrieval'].isEstimate).toBe(true);
    expect(byId['opk-start'].isEstimate).toBe(false);
    expect(byId['ivf-class'].isEstimate).toBe(false);
  });
  it('keeps milestones sorted by date', () => {
    const dates = r.milestones.map((m) => m.date);
    expect([...dates].sort()).toEqual(dates);
  });
  it('represents daily prenatal + CoQ10 as ongoing items, not dots', () => {
    expect(r.ongoing).toEqual([
      expect.objectContaining({ id: 'prenatal', from: '2026-07-05' }),
      expect.objectContaining({ id: 'coq10', from: '2026-07-05' }),
    ]);
    expect(r.milestones.filter((m) => /prenatal|coq10/i.test(m.title))).toHaveLength(0);
  });
  it('adds the sheet action items: no-peak call, schedule-baseline call, abstinence', () => {
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId['opk-no-peak-call'].date).toBe('2026-07-17');
    expect(byId['schedule-baseline-call'].date).toBe('2026-07-19');
    expect(byId['abstinence'].date).toBe(addDays(r.retrievalEstimate, -2));
  });
  it('adds the class-letter items: no-surge blood draw (CD17) + stim-day-4 cutoff', () => {
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId['no-surge-blood-draw'].date).toBe('2026-07-21');
    expect(byId['exercise-cutoff'].date).toBe(addDays(r.stimCd2, 3));
  });
  it('drops the no-peak call + blood-draw once the real surge is entered', () => {
    const withSurge = computeCycle({ ...BASE, actualSurge: '2026-07-19' });
    expect(withSurge.milestones.find((m) => m.id === 'opk-no-peak-call')).toBeUndefined();
    expect(withSurge.milestones.find((m) => m.id === 'no-surge-blood-draw')).toBeUndefined();
  });
});

describe('computeCycle — actualSurge override', () => {
  const r = computeCycle({ ...BASE, actualSurge: '2026-07-19' });

  it('shifts everything downstream of the surge', () => {
    expect(r.surge).toBe('2026-07-19');
    expect(r.surgeIsActual).toBe(true);
    expect(r.estraceStart).toBe('2026-07-25');
    expect(r.nextPeriodWindow).toEqual(['2026-08-04', '2026-08-06']);
    expect(r.stimCd1).toBe('2026-08-05');
    expect(r.triggerEstimate).toBe('2026-08-15');
    expect(r.retrievalEstimate).toBe('2026-08-17');
  });
  it('locks surge-derived milestones but keeps stim-cycle ones tentative', () => {
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId['surge'].isEstimate).toBe(false);
    expect(byId['estrace-start'].isEstimate).toBe(false);
    expect(byId['baseline'].isEstimate).toBe(true);
    expect(byId['trigger'].isEstimate).toBe(true);
  });
});

describe('computeCycle — actualStimCd1 override', () => {
  const r = computeCycle({ ...BASE, actualStimCd1: '2026-08-05' });

  it('anchors the whole stim cycle on the real Day 1', () => {
    expect(r.stimCd1).toBe('2026-08-05');
    expect(r.stimCd1IsActual).toBe(true);
    expect(r.stimCd2).toBe('2026-08-06');
    expect(r.day5Ultrasound).toBe('2026-08-10');
    expect(r.triggerEstimate).toBe('2026-08-15');
    expect(r.retrievalEstimate).toBe('2026-08-17');
  });
  it('replaces the period window with a confirmed CD1 milestone', () => {
    const ids = r.milestones.map((m) => m.id);
    expect(ids).toContain('stim-cd1');
    expect(ids).not.toContain('period-window');
  });
  it('locks baseline/stims but trigger + retrieval stay monitoring-dependent', () => {
    const byId = Object.fromEntries(r.milestones.map((m) => [m.id, m]));
    expect(byId['baseline'].isEstimate).toBe(false);
    expect(byId['stim-start'].isEstimate).toBe(false);
    expect(byId['day5-us'].isEstimate).toBe(false);
    expect(byId['trigger'].isEstimate).toBe(true);
    expect(byId['retrieval'].isEstimate).toBe(true);
  });
});

describe('computeCycle — non-28-day cycles', () => {
  it('handles a 30-day cycle (ovulation CD16)', () => {
    const r = computeCycle({ cd1: '2026-07-05', cycleLength: 30 });
    expect(r.estimatedOvulation).toBe('2026-07-21');
    expect(r.estimatedSurge).toBe('2026-07-20');
  });
  it('handles month/year rollover', () => {
    const r = computeCycle({ cd1: '2026-12-20', cycleLength: 28 });
    expect(r.estimatedOvulation).toBe('2027-01-03');
  });
});

describe('computeCycle — med windows', () => {
  const r = computeCycle(BASE);
  it('runs Estrace from start until the baseline (stim CD2)', () => {
    const w = r.medWindows.find((x) => x.id === 'estrace')!;
    expect(w.start).toBe('2026-07-24');
    expect(w.endExclusive).toBe('2026-08-05');
  });
  it('runs stims from CD2 through trigger day (10 nights), Ganirelix from day-5 U/S', () => {
    const stims = r.medWindows.find((x) => x.id === 'stims')!;
    const gani = r.medWindows.find((x) => x.id === 'ganirelix')!;
    expect(stims.start).toBe('2026-08-05');
    expect(stims.endExclusive).toBe('2026-08-15'); // includes trigger night, per the sheet
    expect(gani.start).toBe('2026-08-09');
    expect(gani.endExclusive).toBe('2026-08-14');
  });
});
