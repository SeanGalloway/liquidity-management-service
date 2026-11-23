import 'server-only';
import { sql, type Selectable } from 'kysely';
import type { CurvePoint } from '../clients/yields-client';
import type { DateRange, IsoDate } from '../domain/types';
import type { Executor } from './client';
import type { Yields } from './schema';

export type YieldObservation = Selectable<Yields>;

export type CurveObservation = YieldObservation & { tenorCode: string; months: string };

export type YieldCoverage = {
  earliest: IsoDate | null;
  latest: IsoDate | null;
  rows: number;
};

export async function upsertYieldObservations(points: CurvePoint[], ex: Executor): Promise<number> {
  if (points.length === 0) return 0;

  const records = points.map((point) => ({
    tenor_code: point.tenorCode,
    observed_at: point.observedAt.toISOString(),
    as_of_date: point.asOfDate,
    yield_bps: point.yieldBps,
    source: point.source,
  }));

  const result = await sql`
    insert into yields (tenor_id, observed_at, as_of_date, yield_bps, source)
    select t.id, p.observed_at, p.as_of_date, p.yield_bps, p.source
    from jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as p(
      tenor_code text, observed_at timestamptz, as_of_date date, yield_bps numeric, source text
    )
    join tenors t on t.code = p.tenor_code
    on conflict (source, tenor_id, observed_at) do update
      set yield_bps = excluded.yield_bps, fetched_at = now()
      where yields.yield_bps is distinct from excluded.yield_bps
  `.execute(ex);

  return Number(result.numAffectedRows ?? 0);
}

export async function findYieldCoverage(ex: Executor): Promise<YieldCoverage> {
  return ex
    .selectFrom('yields')
    .select((eb) => [
      eb.fn.min<IsoDate | null>('asOfDate').as('earliest'),
      eb.fn.max<IsoDate | null>('asOfDate').as('latest'),
      eb.fn.countAll<number>().as('rows'),
    ])
    .executeTakeFirstOrThrow();
}

export function findCurveObservations(
  onOrBefore: IsoDate,
  ex: Executor,
): Promise<CurveObservation[]> {
  return ex
    .selectFrom('yields')
    .innerJoin('tenors', 'tenors.id', 'yields.tenorId')
    .selectAll('yields')
    .select(['tenors.code as tenorCode', 'tenors.months'])
    .where('yields.asOfDate', '=', (eb) =>
      eb
        .selectFrom('yields')
        .select((inner) => inner.fn.max('asOfDate').as('latest'))
        .where('asOfDate', '<=', onOrBefore),
    )
    .orderBy('tenors.months')
    .execute();
}

export function findYieldHistory(
  tenorCodes: string[],
  range: DateRange,
  ex: Executor,
): Promise<CurveObservation[]> {
  return ex
    .selectFrom('yields')
    .innerJoin('tenors', 'tenors.id', 'yields.tenorId')
    .selectAll('yields')
    .select(['tenors.code as tenorCode', 'tenors.months'])
    .where('tenors.code', 'in', tenorCodes)
    .where('yields.asOfDate', '>=', range.from)
    .where('yields.asOfDate', '<=', range.to)
    .orderBy('tenors.months')
    .orderBy('yields.asOfDate')
    .execute();
}
