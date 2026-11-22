import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '@server/db/ledger';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createRecordingDb } from '@test/helpers/recording-db';
import { calculateDailyBalances, calculateProjection, createTimelineService } from './timeline';

function entry(occurredAt: string, balanceAfterCents: number): LedgerEntry {
  return {
    id: occurredAt,
    occurredAt: new Date(occurredAt),
    reason: 'buy',
    amountCents: -1,
    balanceAfterCents,
    orderId: null,
    cashflowId: null,
  };
}

function cashflow(payDate: string, kind: 'coupon' | 'principal', amountCents: number) {
  return {
    id: payDate + kind,
    holdingId: 'holding-1',
    payDate,
    kind,
    amountCents,
    status: 'scheduled',
    paidAt: null,
  };
}

describe('calculateDailyBalances', () => {
  it('keeps the closing balance of each New York calendar day', () => {
    const points = calculateDailyBalances([
      entry('2026-11-22T15:00:00Z', 1_500_000_000),
      entry('2026-11-22T23:00:00Z', 1_397_989_248),
      entry('2026-11-23T03:00:00Z', 1_323_996_362),
      entry('2026-11-23T15:00:00Z', 1_300_000_000),
    ]);

    expect(points).toEqual([
      { date: '2026-11-22', balanceCents: 1_323_996_362 },
      { date: '2026-11-23', balanceCents: 1_300_000_000 },
    ]);
  });
});

describe('calculateProjection', () => {
  it('starts at today and steps by each pay date, merging same-day cashflows', () => {
    const points = calculateProjection(1_000, '2026-11-22', [
      { date: '2027-03-18', kind: 'principal', holdingId: 'a', amountCents: 500 },
      { date: '2028-06-15', kind: 'coupon', holdingId: 'b', amountCents: 20 },
      { date: '2028-06-15', kind: 'principal', holdingId: 'b', amountCents: 1_000 },
    ]);

    expect(points).toEqual([
      { date: '2026-11-22', balanceCents: 1_000 },
      { date: '2027-03-18', balanceCents: 1_500 },
      { date: '2028-06-15', balanceCents: 2_520 },
    ]);
  });
});

describe('getTimeline', () => {
  it('projects to the last maturity by default and treats overdue cashflows as due today', async () => {
    const { db } = createRecordingDb([
      [entry('2026-11-22T15:00:00Z', 1_500_000_000)],
      [{ id: 1, amountCents: 1_500_000_000 }],
      [
        cashflow('2026-11-20', 'coupon', 10),
        cashflow('2027-03-18', 'principal', 500),
        cashflow('2028-06-15', 'principal', 1_000),
      ],
    ]);

    const timeline = await createTimelineService({
      db,
      clock: createFakeClock('2026-11-22T17:00:00Z'),
    }).getTimeline();

    expect(timeline.lastMaturity).toBe('2028-06-15');
    expect(timeline.events.map((event) => event.date)).toEqual([
      '2026-11-22',
      '2027-03-18',
      '2028-06-15',
    ]);
    expect(timeline.projected.at(-1)).toEqual({ date: '2028-06-15', balanceCents: 1_500_001_510 });
  });

  it('cuts events off at an explicit horizon', async () => {
    const { db } = createRecordingDb([
      [],
      [{ id: 1, amountCents: 100 }],
      [cashflow('2027-03-18', 'principal', 500), cashflow('2028-06-15', 'principal', 1_000)],
    ]);

    const timeline = await createTimelineService({
      db,
      clock: createFakeClock('2026-11-22T17:00:00Z'),
    }).getTimeline('2027-12-31');

    expect(timeline.events).toHaveLength(1);
    expect(timeline.lastMaturity).toBe('2028-06-15');
  });
});
