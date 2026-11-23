import { describe, expect, it } from 'vitest';
import { calculateCouponSchedule } from './schedule';

describe('calculateCouponSchedule', () => {
  it('steps back six months from a mid-month maturity', () => {
    expect(calculateCouponSchedule('2026-11-23', '2028-06-15')).toEqual({
      previousCouponDate: '2026-06-15',
      couponDates: ['2026-12-15', '2027-06-15', '2027-12-15', '2028-06-15'],
    });
  });

  it('keeps month-end maturities on month ends', () => {
    const schedule = calculateCouponSchedule('2026-11-23', '2031-11-30');

    expect(schedule.previousCouponDate).toBe('2026-05-31');
    expect(schedule.couponDates).toHaveLength(11);
    expect(schedule.couponDates.slice(0, 3)).toEqual(['2026-11-30', '2027-05-31', '2027-11-30']);
  });

  it('treats settlement on a coupon date as the start of a full period', () => {
    const schedule = calculateCouponSchedule('2026-11-15', '2031-11-15');

    expect(schedule.previousCouponDate).toBe('2026-11-15');
    expect(schedule.couponDates[0]).toBe('2027-05-15');
    expect(schedule.couponDates).toHaveLength(10);
  });
});
