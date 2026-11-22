import 'server-only';
import Decimal from 'decimal.js';
import { calculateDaysBetween } from '../domain/dates';
import type { CurvePointValue, IsoDate } from '../domain/types';

const DAYS_PER_MONTH = 365.25 / 12;
const BPS_DECIMALS = 3;

export type InterpolatedYield = { yieldBps: Decimal; interpolatedFrom: string[] };

export function interpolateYield(
  points: CurvePointValue[],
  settleDate: IsoDate,
  maturityDate: IsoDate,
): InterpolatedYield {
  const months = calculateDaysBetween(settleDate, maturityDate) / DAYS_PER_MONTH;
  const upperIndex = points.findIndex((point) => months <= point.months);

  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];

  if (!upper) return flatAt(points[points.length - 1]);
  if (!lower || months === upper.months) return flatAt(upper);

  const weight = new Decimal(months - lower.months).div(upper.months - lower.months);
  const yieldBps = lower.yieldBps.plus(upper.yieldBps.minus(lower.yieldBps).times(weight));

  return {
    yieldBps: yieldBps.toDecimalPlaces(BPS_DECIMALS),
    interpolatedFrom: [lower.tenorCode, upper.tenorCode],
  };
}

function flatAt(point: CurvePointValue | undefined): InterpolatedYield {
  if (!point) throw new Error('Cannot interpolate an empty curve');
  return { yieldBps: point.yieldBps, interpolatedFrom: [point.tenorCode] };
}
