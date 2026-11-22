import { describe, expect, it, vi } from 'vitest';
import type { CurvePoint, YieldsClient } from '@server/clients/yields-client';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createYieldsService } from './yields';

const clock = createFakeClock('2026-11-22T17:00:00Z');

function point(asOfDate: string, tenorCode = '3M'): CurvePoint {
  return {
    tenorCode,
    asOfDate,
    observedAt: new Date(`${asOfDate}T20:30:00Z`),
    yieldBps: '432',
    source: 'treasury.gov',
  };
}

function stubClient(points: CurvePoint[]) {
  const fetchParYieldCurve = vi.fn(async () => points);
  return { client: { fetchParYieldCurve } satisfies YieldsClient, fetchParYieldCurve };
}

describe('yields service', () => {
  it('syncs the last 12 months when nothing is stored', async () => {
    const live = stubClient([point('2026-11-19'), point('2026-11-20')]);
    const { db } = createRecordingDb([
      [{ earliest: null, latest: null, rows: 0 }],
      { rows: [], numAffectedRows: 2n },
      [{ earliest: '2026-11-19', latest: '2026-11-20', rows: 2 }],
    ]);

    const service = createYieldsService({ db, clock, yieldsClient: live.client });
    const result = await service.syncYields();

    expect(live.fetchParYieldCurve).toHaveBeenCalledWith({ from: '2025-11-22', to: '2026-11-22' });
    expect(result).toEqual({ fetched: 2, stored: 2, earliest: '2026-11-19', latest: '2026-11-20' });
  });

  it('re-fetches from the latest stored close so same-day corrections are picked up', async () => {
    const live = stubClient([point('2026-11-19'), point('2026-11-20')]);
    const { db } = createRecordingDb([
      [{ earliest: '2025-11-24', latest: '2026-11-19', rows: 2 }],
      { rows: [], numAffectedRows: 1n },
      [{ earliest: '2025-11-24', latest: '2026-11-20', rows: 3 }],
    ]);

    const service = createYieldsService({ db, clock, yieldsClient: live.client });
    const result = await service.syncYields();

    expect(live.fetchParYieldCurve).toHaveBeenCalledWith({ from: '2026-11-19', to: '2026-11-22' });
    expect(result).toEqual({ fetched: 2, stored: 1, earliest: '2025-11-24', latest: '2026-11-20' });
  });

  it('skips the fetch when today is already stored', async () => {
    const live = stubClient([]);
    const { db } = createRecordingDb([[{ earliest: '2026-10-29', latest: '2026-11-22', rows: 3 }]]);

    const service = createYieldsService({ db, clock, yieldsClient: live.client });
    const result = await service.syncYields();

    expect(live.fetchParYieldCurve).not.toHaveBeenCalled();
    expect(result).toEqual({
      fetched: 0,
      stored: 0,
      earliest: '2026-10-29',
      latest: '2026-11-22',
      rows: 3,
    });
  });

  it('builds a curve from the stored observations', async () => {
    const { db } = createRecordingDb([
      [
        {
          tenorCode: '1M',
          months: '1.0',
          yieldBps: '419',
          asOfDate: '2026-11-20',
          observedAt: new Date('2026-11-20T20:30:00Z'),
          source: 'treasury.gov',
        },
        {
          tenorCode: '30Y',
          months: '360.0',
          yieldBps: '531',
          asOfDate: '2026-11-20',
          observedAt: new Date('2026-11-20T20:30:00Z'),
          source: 'treasury.gov',
        },
      ],
    ]);

    const service = createYieldsService({
      db,
      clock,
      yieldsClient: stubClient([]).client,
    });
    const curve = await service.getCurve('latest');

    expect(curve.asOfDate).toBe('2026-11-20');
    expect(curve.points.map((p) => [p.tenorCode, p.months, p.yieldBps.toNumber()])).toEqual([
      ['1M', 1, 419],
      ['30Y', 360, 531],
    ]);
  });

  it('rejects unknown tenor codes in history requests', async () => {
    const { db } = createRecordingDb([[{ id: 4, code: '3M', months: '3.0', kind: 'bill' }]]);

    const service = createYieldsService({
      db,
      clock,
      yieldsClient: stubClient([]).client,
    });

    await expect(service.listYieldHistory(['3M', '9M'], {})).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown tenor codes: 9M',
    });
  });

  it('rejects an empty tenor list and an inverted date range', async () => {
    const tenorRows = [{ id: 4, code: '3M', months: '3.0', kind: 'bill' }];
    const { db } = createRecordingDb([tenorRows, tenorRows]);
    const service = createYieldsService({ db, clock, yieldsClient: stubClient([]).client });

    await expect(service.listYieldHistory([], {})).rejects.toMatchObject({
      message: 'At least one tenor code is required',
    });
    await expect(
      service.listYieldHistory(['3M'], { from: '2026-11-20', to: '2026-11-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
