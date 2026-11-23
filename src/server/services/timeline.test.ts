import { describe, expect, it } from 'vitest';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createRecordingDb } from '@test/helpers/recording-db';
import { calculateProjection, createTimelineService } from './timeline';

const SUNDAY = createFakeClock('2026-11-22T17:00:00Z');

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

describe('calculateProjection', () => {
  it('starts at today, steps by pay date and merges same-day cashflows', () => {
    const points = calculateProjection(1_000, '2026-11-22', '2028-06-15', [
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

  it('extends a flat line to a horizon past the last cashflow', () => {
    const points = calculateProjection(1_000, '2026-11-22', '2027-12-31', [
      { date: '2027-03-18', kind: 'principal', holdingId: 'a', amountCents: 500 },
    ]);

    expect(points.at(-1)).toEqual({ date: '2027-12-31', balanceCents: 1_500 });
  });
});

describe('getTimeline', () => {
  it('reads balance, daily closes and cashflows in one repeatable-read snapshot', async () => {
    const { db, sql } = createRecordingDb([
      [{ id: 1, amountCents: 1_500_000_000 }],
      [{ date: '2026-11-22', balanceCents: 1_500_000_000 }],
      [
        cashflow('2026-11-20', 'coupon', 10),
        cashflow('2027-03-18', 'principal', 500),
        cashflow('2028-06-15', 'principal', 1_000),
      ],
    ]);

    const timeline = await createTimelineService({ db, clock: SUNDAY }).getTimeline();

    expect(sql()[0]).toBe('begin isolation level repeatable read');
    expect(sql()[2]).toContain('distinct on (day)');
    expect(sql().at(-1)).toBe('commit');
    expect(timeline.actual).toEqual([{ date: '2026-11-22', balanceCents: 1_500_000_000 }]);
    expect(timeline.lastMaturity).toBe('2028-06-15');
    expect(timeline.events.map((event) => event.date)).toEqual([
      '2026-11-22',
      '2027-03-18',
      '2028-06-15',
    ]);
    expect(timeline.projected.at(-1)).toEqual({ date: '2028-06-15', balanceCents: 1_500_001_510 });
  });

  it('cuts events off at an explicit horizon and ends the projection there', async () => {
    const { db } = createRecordingDb([
      [{ id: 1, amountCents: 100 }],
      [],
      [cashflow('2027-03-18', 'principal', 500), cashflow('2028-06-15', 'principal', 1_000)],
    ]);

    const timeline = await createTimelineService({ db, clock: SUNDAY }).getTimeline('2027-12-31');

    expect(timeline.events).toHaveLength(1);
    expect(timeline.lastMaturity).toBe('2028-06-15');
    expect(timeline.projected.at(-1)).toEqual({ date: '2027-12-31', balanceCents: 600 });
  });

  it('rejects a horizon before today without querying', async () => {
    const { db, queries } = createRecordingDb();

    await expect(
      createTimelineService({ db, clock: SUNDAY }).getTimeline('2026-11-01'),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(queries).toHaveLength(0);
  });
});
