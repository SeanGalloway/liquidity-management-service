import { describe, expect, it } from 'vitest';
import type { Curve, Tenor, YieldSeries } from '../types';
import {
  calculateCompareDate,
  calculateSpreads,
  calculateTenorRows,
  calculateYieldOnOrBefore,
} from './curve';

const curve: Curve = {
  asOf: '2026-11-20',
  source: 'treasury.gov',
  points: [
    { tenor: '3M', yieldBps: 432 },
    { tenor: '2Y', yieldBps: 463 },
    { tenor: '10Y', yieldBps: 492 },
  ],
};

const tenors: Tenor[] = [
  { code: '3M', months: 3, kind: 'bill' },
  { code: '2Y', months: 24, kind: 'note' },
  { code: '10Y', months: 120, kind: 'note' },
];

const history: YieldSeries[] = [
  {
    tenor: '3M',
    points: [
      { date: '2026-10-19', yieldBps: 440 },
      { date: '2026-10-20', yieldBps: 443 },
      { date: '2026-11-12', yieldBps: 430 },
      { date: '2026-11-20', yieldBps: 432 },
    ],
  },
];

describe('calculateYieldOnOrBefore', () => {
  it('takes the latest observation not after the date', () => {
    expect(calculateYieldOnOrBefore(history[0]!.points, '2026-11-13')).toBe(430);
    expect(calculateYieldOnOrBefore(history[0]!.points, '2026-10-20')).toBe(443);
    expect(calculateYieldOnOrBefore(history[0]!.points, '2026-01-01')).toBeNull();
  });
});

describe('calculateTenorRows', () => {
  const rows = calculateTenorRows(curve, tenors, history);

  it('computes 1W and 1M changes and the stored range', () => {
    expect(rows[0]).toEqual({
      tenor: '3M',
      months: 3,
      kind: 'bill',
      yieldBps: 432,
      change1wBps: 2,
      change1mBps: -11,
      rangeLowBps: 430,
      rangeHighBps: 443,
    });
  });

  it('leaves changes empty without history', () => {
    expect(rows[2]).toMatchObject({
      tenor: '10Y',
      kind: 'note',
      change1wBps: null,
      rangeLowBps: null,
    });
  });

  it('derives curve spreads', () => {
    const spreads = calculateSpreads(rows);
    expect(spreads.tenMinusThreeBps).toBe(60);
    expect(spreads.tenMinusTwoBps).toBe(29);
    expect(spreads.threeMonth?.yieldBps).toBe(432);
  });
});

describe('calculateCompareDate', () => {
  it('steps back from the curve date', () => {
    expect(calculateCompareDate('2026-11-20', '1W')).toBe('2026-11-13');
    expect(calculateCompareDate('2026-11-20', '1M')).toBe('2026-10-20');
    expect(calculateCompareDate('2026-11-20', '6M')).toBe('2026-05-20');
    expect(calculateCompareDate('2026-11-20', 'none')).toBeNull();
  });
});
