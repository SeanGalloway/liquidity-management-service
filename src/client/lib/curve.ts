import type { Curve, SecurityKind, Tenor, YieldSeries } from '../types';
import { addDays, addMonths } from './dates';

export type TenorRow = {
  tenor: string;
  months: number;
  kind: SecurityKind;
  yieldBps: number;
  change1wBps: number | null;
  change1mBps: number | null;
  rangeLowBps: number | null;
  rangeHighBps: number | null;
};

export type Spreads = {
  threeMonth: TenorRow | null;
  tenYear: TenorRow | null;
  tenMinusThreeBps: number | null;
  tenMinusTwoBps: number | null;
};

export const COMPARE_OPTIONS = [
  { key: '1W', label: '1 week ago', months: 0.25 },
  { key: '1M', label: '1 month ago', months: 1 },
  { key: '6M', label: '6 months ago', months: 6 },
  { key: 'none', label: 'None', months: 0 },
] as const;

export type CompareKey = (typeof COMPARE_OPTIONS)[number]['key'];

export function calculateCompareDate(asOf: string, key: CompareKey) {
  if (key === 'none') return null;
  if (key === '1W') return addDays(asOf, -7);
  return addMonths(asOf, key === '1M' ? -1 : -6);
}

export function calculateYieldOnOrBefore(points: YieldSeries['points'], date: string) {
  let found: number | null = null;
  for (const point of points) {
    if (point.date > date) break;
    found = point.yieldBps;
  }
  return found;
}

function calculateChange(current: number, previous: number | null) {
  return previous === null ? null : current - previous;
}

function calculateTenorRow(
  point: Curve['points'][number],
  asOf: string,
  tenor: Tenor | undefined,
  series: YieldSeries | undefined,
): TenorRow {
  const points = series?.points ?? [];
  const yields = points.map((p) => p.yieldBps);

  return {
    tenor: point.tenor,
    months: tenor?.months ?? 0,
    kind: tenor?.kind ?? 'bill',
    yieldBps: point.yieldBps,
    change1wBps: calculateChange(
      point.yieldBps,
      calculateYieldOnOrBefore(points, addDays(asOf, -7)),
    ),
    change1mBps: calculateChange(
      point.yieldBps,
      calculateYieldOnOrBefore(points, addMonths(asOf, -1)),
    ),
    rangeLowBps: yields.length ? Math.min(...yields) : null,
    rangeHighBps: yields.length ? Math.max(...yields) : null,
  };
}

export function calculateTenorRows(curve: Curve, tenors: Tenor[], history: YieldSeries[]) {
  const tenorByCode = new Map(tenors.map((tenor) => [tenor.code, tenor]));
  const seriesByCode = new Map(history.map((series) => [series.tenor, series]));

  return curve.points.map((point) =>
    calculateTenorRow(
      point,
      curve.asOf,
      tenorByCode.get(point.tenor),
      seriesByCode.get(point.tenor),
    ),
  );
}

function calculateSpread(long: TenorRow | undefined, short: TenorRow | undefined) {
  return long && short ? long.yieldBps - short.yieldBps : null;
}

export function calculateSpreads(rows: TenorRow[]): Spreads {
  const byTenor = new Map(rows.map((row) => [row.tenor, row]));
  const tenYear = byTenor.get('10Y');

  return {
    threeMonth: byTenor.get('3M') ?? null,
    tenYear: tenYear ?? null,
    tenMinusThreeBps: calculateSpread(tenYear, byTenor.get('3M')),
    tenMinusTwoBps: calculateSpread(tenYear, byTenor.get('2Y')),
  };
}
