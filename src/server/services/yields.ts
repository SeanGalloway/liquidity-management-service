import 'server-only';
import Decimal from 'decimal.js';
import type { YieldsClient } from '../clients/yields-client';
import type { Database } from '../db/client';
import { findTenors, type Tenor } from '../db/tenors';
import {
  findCurveObservations,
  findYieldCoverage,
  findYieldHistory,
  upsertYieldObservations,
  type CurveObservation,
  type YieldCoverage,
} from '../db/yields';
import { addDays, addMonths, rejectInvertedRange } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { Clock, Curve, CurvePointValue, DateRange, IsoDate } from '../domain/types';
import { rollForwardToBusinessDay } from '../pricing/calendar';

const SYNC_LOOKBACK_MONTHS = 12;
const HISTORY_DEFAULT_MONTHS = 6;

export type YieldSeries = { tenorCode: string; points: { date: IsoDate; yieldBps: Decimal }[] };

export type SyncResult = {
  fetched: number;
  stored: number;
  earliest: IsoDate | null;
  latest: IsoDate | null;
};

type Dependencies = {
  db: Database;
  clock: Clock;
  yieldsClient: YieldsClient;
};

export function createYieldsService({ db, clock, yieldsClient }: Dependencies) {
  async function syncYields(): Promise<SyncResult> {
    const today = clock.today();
    const before = await findYieldCoverage(db);

    if (before.latest && rollForwardToBusinessDay(addDays(before.latest, 1)) > today) {
      return { fetched: 0, stored: 0, earliest: before.earliest, latest: before.latest };
    }

    const from = before.latest ?? addMonths(today, -SYNC_LOOKBACK_MONTHS);
    const points = await yieldsClient.fetchParYieldCurve({ from, to: today });
    const stored = await upsertYieldObservations(points, db);
    const after = await findYieldCoverage(db);

    return { fetched: points.length, stored, earliest: after.earliest, latest: after.latest };
  }

  async function getCurve(date: IsoDate | 'latest'): Promise<Curve> {
    const onOrBefore = date === 'latest' ? clock.today() : date;
    const observations = await findCurveObservations(onOrBefore, db);

    const first = observations[0];
    if (!first) {
      throw new DomainError('NO_MARKET_DATA', `No yield curve on or before ${onOrBefore}`);
    }

    return {
      asOfDate: first.asOfDate,
      observedAt: first.observedAt,
      source: first.source,
      points: observations.map(toCurvePointValue),
    };
  }

  async function listYieldHistory(
    tenorCodes: string[],
    range: Partial<DateRange>,
  ): Promise<YieldSeries[]> {
    if (tenorCodes.length === 0) {
      throw new DomainError('VALIDATION_FAILED', 'At least one tenor code is required');
    }

    const tenors = await findTenors(db);
    rejectUnknownTenors(tenorCodes, tenors);

    const to = range.to ?? clock.today();
    const from = range.from ?? addMonths(to, -HISTORY_DEFAULT_MONTHS);
    rejectInvertedRange(from, to);

    const observations = await findYieldHistory(tenorCodes, { from, to }, db);

    return groupIntoSeries(observations);
  }

  function listTenors(): Promise<Tenor[]> {
    return findTenors(db);
  }

  function getCoverage(): Promise<YieldCoverage> {
    return findYieldCoverage(db);
  }

  return { syncYields, getCurve, listYieldHistory, listTenors, getCoverage };
}

export type YieldsService = ReturnType<typeof createYieldsService>;

function toCurvePointValue(observation: CurveObservation): CurvePointValue {
  return {
    tenorCode: observation.tenorCode,
    months: Number(observation.months),
    yieldBps: new Decimal(observation.yieldBps),
  };
}

function rejectUnknownTenors(tenorCodes: string[], tenors: Tenor[]) {
  const known = new Set(tenors.map((tenor) => tenor.code));
  const unknown = tenorCodes.filter((code) => !known.has(code));

  if (unknown.length > 0) {
    throw new DomainError('VALIDATION_FAILED', `Unknown tenor codes: ${unknown.join(', ')}`);
  }
}

function groupIntoSeries(observations: CurveObservation[]): YieldSeries[] {
  const series = new Map<string, YieldSeries>();

  for (const observation of observations) {
    const entry = series.get(observation.tenorCode) ?? {
      tenorCode: observation.tenorCode,
      points: [],
    };
    entry.points.push({ date: observation.asOfDate, yieldBps: new Decimal(observation.yieldBps) });
    series.set(observation.tenorCode, entry);
  }

  return [...series.values()];
}
