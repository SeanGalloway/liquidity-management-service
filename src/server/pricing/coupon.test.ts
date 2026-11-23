import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateCouponPrice } from './coupon';
import { calculateCouponSchedule } from './schedule';

function price(couponBps: number, yieldBps: number, settleDate: string, maturityDate: string) {
  return calculateCouponPrice({
    couponRateBps: new Decimal(couponBps),
    yieldBps: new Decimal(yieldBps),
    schedule: calculateCouponSchedule(settleDate, maturityDate),
    settleDate,
  });
}

describe('calculateCouponPrice', () => {
  it('matches the textbook 5-year 5% coupon at a 6% yield on a coupon date', () => {
    const result = price(500, 600, '2026-11-15', '2031-11-15');

    expect(result.cleanPer100.toDecimalPlaces(6).toNumber()).toBe(95.734899);
    expect(result.accruedPer100.toNumber()).toBe(0);
  });

  it('prices exactly at par when coupon equals yield on a coupon date', () => {
    const result = price(471, 471, '2026-11-15', '2031-11-15');

    expect(result.cleanPer100.toDecimalPlaces(9).toNumber()).toBe(100);
  });

  it('accrues act/act from the previous coupon date mid-period', () => {
    const result = price(463, 463, '2026-11-23', '2028-06-15');

    expect(result.accruedPer100.toDecimalPlaces(6).toNumber()).toBe(2.036694);
    expect(result.cleanPer100.toDecimalPlaces(6).toNumber()).toBe(99.99719);
  });
});
