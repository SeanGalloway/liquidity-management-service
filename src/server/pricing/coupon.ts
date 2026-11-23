import 'server-only';
import Decimal from 'decimal.js';
import { calculateDaysBetween } from '../domain/dates';
import type { IsoDate } from '../domain/types';
import type { CouponSchedule } from './schedule';

export type CouponPrice = {
  dirtyPer100: Decimal;
  accruedPer100: Decimal;
  cleanPer100: Decimal;
};

type CouponPriceInput = {
  couponRateBps: Decimal;
  yieldBps: Decimal;
  schedule: CouponSchedule;
  settleDate: IsoDate;
};

// Secondary-market (SIFMA street convention) price: semiannual compounding including the fractional
// first period, act/act accrued. Treasury's auction formula (31 CFR 356 App. B) instead uses simple
// interest for that period.
export function calculateCouponPrice({
  couponRateBps,
  yieldBps,
  schedule,
  settleDate,
}: CouponPriceInput): CouponPrice {
  const couponPer100 = couponRateBps.div(200);
  const periodYield = yieldBps.div(20_000).plus(1);

  const nextCouponDate = schedule.couponDates[0];
  if (!nextCouponDate) throw new Error(`No coupon dates remain after ${settleDate}`);

  const periodDays = calculateDaysBetween(schedule.previousCouponDate, nextCouponDate);
  const fractionToNext = new Decimal(calculateDaysBetween(settleDate, nextCouponDate)).div(
    periodDays,
  );

  const periods = schedule.couponDates.length;
  let dirtyPer100 = new Decimal(100).div(periodYield.pow(fractionToNext.plus(periods - 1)));

  for (let period = 0; period < periods; period++) {
    dirtyPer100 = dirtyPer100.plus(couponPer100.div(periodYield.pow(fractionToNext.plus(period))));
  }

  const accruedPer100 = couponPer100.times(new Decimal(1).minus(fractionToNext));

  return { dirtyPer100, accruedPer100, cleanPer100: dirtyPer100.minus(accruedPer100) };
}
