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

  it('estimates ovulation on CD14 (luteal held at 14)', () => {
    expect(r.estimatedOvulation).toBe('2026-07-18');
  });
  it('estimates the surge the day before ovulation', () => {
    expect(r.estimatedSurge).toBe('2026-07-17');
    expect(r.surge).toBe('2026-07-17');
    expect(r.surgeIsActual).toBe(false);
  });
  it('starts Estrace ~5 days after the surge', () => {
    expect(r.estraceStart).toBe('2026-07-22');
  });
  it('expects the next period 10–12 days after Estrace start', () => {
    expect(r.nextPeriodWindow).toEqual(['2026-08-01', '2026-08-03']);
  });
  it('estimates stim CD1 at the window midpoint (estrace + 11)', () => {
    expect(r.stimCd1).toBe('2026-08-02');
    expect(r.stimCd1IsActual).toBe(false);
    expect(r.stimCd2).toBe('2026-08-03');
  });
  it('derives day-5 U/S, trigger (~stim day 10) and retrieval (+2)', () => {
    expect(r.day5Ultrasound).toBe('2026-08-07');
    expect(r.triggerEstimate).toBe('2026-08-12');
    expect(r.retrievalEstimate).toBe('2026-08-14');
  });
  it('starts OPK testing on CD9 (clinic said 7/13)', () => {
    expect(r.milestones.find((m) => m.id === 'opk-start')?.date).toBe('2026-07-13');
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
  it('represents the daily prenatal as an ongoing item, not a dot', () => {
    expect(r.ongoing).toEqual([expect.objectContaining({ id: 'prenatal', from: '2026-07-05' })]);
    expect(r.milestones.filter((m) => /prenatal/i.test(m.title))).toHaveLength(0);
  });
});

describe('computeCycle — actualSurge override', () => {
  const r = computeCycle({ ...BASE, actualSurge: '2026-07-19' });

  it('shifts everything downstream of the surge', () => {
    expect(r.surge).toBe('2026-07-19');
    expect(r.surgeIsActual).toBe(true);
    expect(r.estraceStart).toBe('2026-07-24');
    expect(r.nextPeriodWindow).toEqual(['2026-08-03', '2026-08-05']);
    expect(r.stimCd1).toBe('2026-08-04');
    expect(r.triggerEstimate).toBe('2026-08-14');
    expect(r.retrievalEstimate).toBe('2026-08-16');
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
    expect(r.estimatedOvulation).toBe('2026-07-20');
    expect(r.estimatedSurge).toBe('2026-07-19');
  });
  it('handles month/year rollover', () => {
    const r = computeCycle({ cd1: '2026-12-20', cycleLength: 28 });
    expect(r.estimatedOvulation).toBe('2027-01-02');
  });
});

describe('computeCycle — med windows', () => {
  const r = computeCycle(BASE);
  it('runs Estrace from start until the baseline (stim CD2)', () => {
    const w = r.medWindows.find((x) => x.id === 'estrace')!;
    expect(w.start).toBe('2026-07-22');
    expect(w.endExclusive).toBe('2026-08-03');
  });
  it('runs stims from CD2 to trigger, Ganirelix from day-5 U/S', () => {
    const stims = r.medWindows.find((x) => x.id === 'stims')!;
    const gani = r.medWindows.find((x) => x.id === 'ganirelix')!;
    expect(stims.start).toBe('2026-08-03');
    expect(stims.endExclusive).toBe('2026-08-12');
    expect(gani.start).toBe('2026-08-07');
    expect(gani.endExclusive).toBe('2026-08-12');
  });
});
