import 'server-only';
import Decimal from 'decimal.js';
import { addMonths, calculateDaysBetween } from '../domain/dates';
import type { IsoDate } from '../domain/types';

const PAR = new Decimal(100);

// Investment-rate (bond-equivalent) bill price, 31 CFR Part 356 Appendix B, Section II.
export function calculateBillPrice(
  yieldBps: Decimal,
  settleDate: IsoDate,
  maturityDate: IsoDate,
): Decimal {
  const days = calculateDaysBetween(settleDate, maturityDate);
  const yearDays = calculateBillYearBasis(settleDate);
  const rate = yieldBps.div(10_000);
  const yearFraction = new Decimal(days).div(yearDays);

  if (days * 2 <= yearDays) {
    return PAR.div(rate.times(yearFraction).plus(1));
  }

  const firstHalfYear = rate.div(2).plus(1);
  const remainder = yearFraction.minus(0.5).times(rate).plus(1);
  return PAR.div(firstHalfYear.times(remainder));
}

export function calculateBillYearBasis(settleDate: IsoDate): 365 | 366 {
  const yearLater = addMonths(settleDate, 12);
  return calculateDaysBetween(settleDate, yearLater) === 366 ? 366 : 365;
}
