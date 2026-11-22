import 'server-only';
import Decimal from 'decimal.js';
import type { YieldsClient } from '../clients/yields-client';
import type { Database } from '../db/client';
import { findTenors, type Tenor } from '../db/tenors';
import {
  findCurveObservations,
  findYieldCoverage,
  findYieldHistory,
  insertYieldObservations,
  type CurveObservation,
} from '../db/yields';
import { addDays, addMonths } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { Clock, DateRange, IsoDate } from '../domain/types';

const BACKFILL_MONTHS = 12;
const HISTORY_DEFAULT_MONTHS = 6;

export type CurvePointValue = { tenorCode: string; months: number; yieldBps: Decimal };

export type Curve = {
  asOfDate: IsoDate;
  observedAt: Date;
  source: string;
  points: CurvePointValue[];
};

export type YieldSeries = { tenorCode: string; points: { date: IsoDate; yieldBps: Decimal }[] };

export type BackfillResult = {
  fetched: number;
  inserted: number;
  earliest: IsoDate | null;
  latest: IsoDate | null;
};

export type PollResult = { fetched: number; inserted: number; latestAsOf: IsoDate | null };

type Dependencies = {
  db: Database;
  clock: Clock;
  yieldsClient: YieldsClient;
};

export function createYieldsService({ db, clock, yieldsClient }: Dependencies) {
  async function backfillYields(): Promise<BackfillResult> {
    const today = clock.today();

    const points = await yieldsClient.fetchParYieldCurve({
      from: addMonths(today, -BACKFILL_MONTHS),
      to: today,
    });
    const inserted = await insertYieldObservations(points, db);
    const coverage = await findYieldCoverage(db);

    return {
      fetched: points.length,
      inserted,
      earliest: coverage.earliest,
      latest: coverage.latest,
    };
  }

  async function pollLatestYields(): Promise<PollResult> {
    const today = clock.today();
    const coverage = await findYieldCoverage(db);

    const from = coverage.latest ? addDays(coverage.latest, 1) : addMonths(today, -BACKFILL_MONTHS);
    if (from > today) return { fetched: 0, inserted: 0, latestAsOf: coverage.latest };

    const points = await yieldsClient.fetchParYieldCurve({ from, to: today });
    const inserted = await insertYieldObservations(points, db);
    const updated = await findYieldCoverage(db);

    return { fetched: points.length, inserted, latestAsOf: updated.latest };
  }

  async function getCurve(date: IsoDate | 'latest'): Promise<Curve> {
    const observations = await findCurveObservations(date === 'latest' ? clock.today() : date, db);

    const first = observations[0];
    if (!first) throw new DomainError('NO_MARKET_DATA', `No yield curve on or before ${date}`);

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
    const tenors = await findTenors(db);
    rejectUnknownTenors(tenorCodes, tenors);

    const to = range.to ?? clock.today();
    const from = range.from ?? addMonths(to, -HISTORY_DEFAULT_MONTHS);
    const observations = await findYieldHistory(tenorCodes, { from, to }, db);

    return groupIntoSeries(observations);
  }

  function listTenors(): Promise<Tenor[]> {
    return findTenors(db);
  }

  return { backfillYields, pollLatestYields, getCurve, listYieldHistory, listTenors };
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
