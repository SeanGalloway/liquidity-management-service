import { describe, expect, it } from 'vitest';
import type { Holding, Timeline } from '../types';
import { toUtcMs } from './dates';
import {
  calculateCashflowChips,
  calculateMaturityMarkers,
  calculatePortfolioSummary,
  calculateProjectedBalance,
  calculateTimelineSeries,
} from './portfolio';

function holding(
  id: string,
  kind: Holding['security']['kind'],
  maturityDate: string,
  faceCents: number,
  purchaseYieldBps: number,
  interestToMaturityCents: number,
): Holding {
  return {
    id,
    orderId: `order-${id}`,
    security: {
      id: `security-${id}`,
      cusip: null,
      kind,
      issueDate: '2026-11-22',
      maturityDate,
      couponRateBps: kind === 'bill' ? null : purchaseYieldBps,
      synthetic: true,
    },
    faceCents,
    cleanCostCents: faceCents,
    accruedPaidCents: 0,
    totalCostCents: faceCents,
    purchaseYieldBps,
    purchasedAt: '2026-11-22T15:00:00Z',
    status: 'active',
    maturedAt: null,
    interestToMaturityCents,
  };
}

const holdings = [
  holding('bill-a', 'bill', '2027-03-18', 75_000_000, 432, 1_000_000),
  holding('bill-b', 'bill', '2027-03-18', 25_000_000, 440, 300_000),
  holding('note', 'note', '2028-06-15', 100_000_000, 458, 7_000_000),
];

const timeline: Timeline = {
  today: '2026-11-22',
  lastMaturity: '2028-06-15',
  actual: [
    { date: '2026-11-20', balanceCents: 1_500_000_000 },
    { date: '2026-11-22', balanceCents: 1_300_000_000 },
  ],
  projected: [
    { date: '2026-11-22', balanceCents: 1_300_000_000 },
    { date: '2026-12-15', balanceCents: 1_302_000_000 },
    { date: '2027-03-18', balanceCents: 1_402_000_000 },
  ],
  events: [
    { date: '2026-12-15', kind: 'coupon', holdingId: 'note', amountCents: 2_000_000 },
    { date: '2027-03-18', kind: 'principal', holdingId: 'bill-a', amountCents: 75_000_000 },
    { date: '2027-03-18', kind: 'principal', holdingId: 'bill-b', amountCents: 25_000_000 },
  ],
};

describe('calculatePortfolioSummary', () => {
  it('totals face and interest and weights yield by face', () => {
    const summary = calculatePortfolioSummary(holdings);

    expect(summary.holdingCount).toBe(3);
    expect(summary.investedFaceCents).toBe(200_000_000);
    expect(summary.interestToMaturityCents).toBe(8_300_000);
    expect(summary.averageYieldBps).toBeCloseTo((432 * 75 + 440 * 25 + 458 * 100) / 200);
  });

  it('sums every lot maturing on the earliest date', () => {
    expect(calculatePortfolioSummary(holdings).nextMaturity).toEqual({
      date: '2027-03-18',
      faceCents: 100_000_000,
    });
  });

  it('handles an empty portfolio', () => {
    const summary = calculatePortfolioSummary([]);
    expect(summary.averageYieldBps).toBeNull();
    expect(summary.nextMaturity).toBeNull();
  });
});

describe('calculateCashflowChips', () => {
  it('groups same-day cashflows of one kind and labels them', () => {
    expect(calculateCashflowChips(timeline.events, holdings)).toEqual([
      { date: '2026-12-15', label: 'Coupon', amountCents: 2_000_000 },
      { date: '2027-03-18', label: 'Bill', amountCents: 100_000_000 },
    ]);
  });

  it('orders chips by date whatever order the events arrive in', () => {
    const chips = calculateCashflowChips([...timeline.events].reverse(), holdings);
    expect(chips.map((chip) => chip.date)).toEqual(['2026-12-15', '2027-03-18']);
  });

  it('labels mixed maturities generically and respects the limit', () => {
    const events = [
      { date: '2027-03-18', kind: 'principal' as const, holdingId: 'bill-a', amountCents: 1 },
      { date: '2027-03-18', kind: 'principal' as const, holdingId: 'note', amountCents: 2 },
      { date: '2027-06-15', kind: 'coupon' as const, holdingId: 'note', amountCents: 3 },
    ];

    expect(calculateCashflowChips(events, holdings, 1)).toEqual([
      { date: '2027-03-18', label: 'Maturities', amountCents: 3 },
    ]);
  });
});

describe('calculateTimelineSeries', () => {
  it('merges actual and projected points and extends to the horizon', () => {
    const series = calculateTimelineSeries(timeline, '2027-06-01');

    expect(series).toEqual([
      { t: toUtcMs('2026-11-20'), actual: 1_500_000_000 },
      { t: toUtcMs('2026-11-22'), actual: 1_300_000_000, projected: 1_300_000_000 },
      { t: toUtcMs('2026-12-15'), projected: 1_302_000_000, inflow: 2_000_000 },
      { t: toUtcMs('2027-03-18'), projected: 1_402_000_000, inflow: 100_000_000 },
      { t: toUtcMs('2027-06-01'), projected: 1_402_000_000 },
    ]);
  });

  it('places an overdue cashflow on tomorrow, where the projection applies it', () => {
    const overdue = {
      ...timeline,
      events: [{ date: '2026-11-20', kind: 'coupon' as const, holdingId: 'h', amountCents: 5_00 }],
    };

    const tomorrow = calculateTimelineSeries(overdue, '2026-11-22').find(
      (point) => point.t === toUtcMs('2026-11-23'),
    );

    expect(tomorrow?.inflow).toBe(5_00);
  });

  it('does not add a horizon point inside the projection', () => {
    expect(calculateTimelineSeries(timeline, '2027-03-18')).toHaveLength(4);
  });
});

describe('maturity markers and projected balance', () => {
  it('places one marker per maturity date at the balance after it', () => {
    expect(calculateMaturityMarkers(timeline)).toEqual([
      {
        t: toUtcMs('2027-03-18'),
        date: '2027-03-18',
        amountCents: 100_000_000,
        balanceCents: 1_402_000_000,
      },
    ]);
  });

  it('reads the balance at the end of the projection', () => {
    expect(calculateProjectedBalance(timeline)).toBe(1_402_000_000);
    expect(calculateProjectedBalance({ ...timeline, projected: [] })).toBe(1_300_000_000);
  });
});
