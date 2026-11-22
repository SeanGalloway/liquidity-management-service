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

// Street-convention price for semiannual coupons with act/act accrual (31 CFR Part 356 Appendix B, Section I).
export function calculateCouponPrice({
  couponRateBps,
  yieldBps,
  schedule,
  settleDate,
}: CouponPriceInput): CouponPrice {
  const couponPer100 = couponRateBps.div(200);
  const periodYield = yieldBps.div(20_000).plus(1);

  const nextCouponDate = schedule.couponDates[0] ?? settleDate;
  const periodDays = calculateDaysBetween(schedule.previousCouponDate, nextCouponDate);
  const fractionToNext = new Decimal(calculateDaysBetween(settleDate, nextCouponDate)).div(
    periodDays,
  );

  let dirtyPer100 = new Decimal(0);
  schedule.couponDates.forEach((_, index) => {
    dirtyPer100 = dirtyPer100.plus(couponPer100.div(periodYield.pow(fractionToNext.plus(index))));
  });

  const lastPeriod = fractionToNext.plus(schedule.couponDates.length - 1);
  dirtyPer100 = dirtyPer100.plus(new Decimal(100).div(periodYield.pow(lastPeriod)));

  const accruedPer100 = couponPer100.times(new Decimal(1).minus(fractionToNext));

  return { dirtyPer100, accruedPer100, cleanPer100: dirtyPer100.minus(accruedPer100) };
}
