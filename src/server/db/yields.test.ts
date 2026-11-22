import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import {
  findCurveObservations,
  findYieldCoverage,
  findYieldHistory,
  insertYieldObservations,
} from './yields';

const POINT = {
  tenorCode: '3M',
  asOfDate: '2026-11-20',
  observedAt: new Date('2026-11-20T20:30:00Z'),
  yieldBps: '432',
  source: 'treasury.gov',
};

describe('yields repository', () => {
  it('skips the insert when there are no points', async () => {
    const { db, queries } = createRecordingDb();

    expect(await insertYieldObservations([], db)).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it('inserts all points in one idempotent statement keyed by tenor code', async () => {
    const { db, queries } = createRecordingDb([{ rows: [], numAffectedRows: 1n }]);

    const inserted = await insertYieldObservations([POINT], db);

    expect(inserted).toBe(1);
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain('jsonb_to_recordset');
    expect(queries[0]?.sql).toContain('on conflict do nothing');
    expect(JSON.parse(String(queries[0]?.parameters[0]))).toEqual([
      {
        tenor_code: '3M',
        observed_at: '2026-11-20T20:30:00.000Z',
        as_of_date: '2026-11-20',
        yield_bps: '432',
        source: 'treasury.gov',
      },
    ]);
  });

  it('summarizes coverage with min, max and count', async () => {
    const { db, sql } = createRecordingDb([[{ earliest: null, latest: null, rows: 0 }]]);

    await findYieldCoverage(db);

    expect(sql()).toEqual([
      'select min("as_of_date") as "earliest", max("as_of_date") as "latest", count(*) as "rows" from "yields"',
    ]);
  });

  it('selects the full curve for the latest date on or before the requested one', async () => {
    const { db, queries } = createRecordingDb();

    await findCurveObservations('2026-11-22', db);

    expect(queries[0]?.sql).toBe(
      'select "yields".*, "tenors"."code" as "tenor_code", "tenors"."months", "tenors"."kind" from "yields" ' +
        'inner join "tenors" on "tenors"."id" = "yields"."tenor_id" ' +
        'where "yields"."as_of_date" = (select max("as_of_date") as "latest" from "yields" where "as_of_date" <= $1) ' +
        'order by "tenors"."months"',
    );
    expect(queries[0]?.parameters).toEqual(['2026-11-22']);
  });

  it('filters history by tenor codes and date range', async () => {
    const { db, queries } = createRecordingDb();

    await findYieldHistory(['3M', '10Y'], { from: '2026-05-22', to: '2026-11-22' }, db);

    expect(queries[0]?.sql).toContain('where "tenors"."code" in ($1, $2)');
    expect(queries[0]?.parameters).toEqual(['3M', '10Y', '2026-05-22', '2026-11-22']);
  });
});
