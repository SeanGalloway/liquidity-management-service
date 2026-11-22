import 'server-only';
import { addMonths, endOfMonth, isEndOfMonth } from '../domain/dates';
import type { IsoDate } from '../domain/types';

export type CouponSchedule = {
  previousCouponDate: IsoDate;
  couponDates: IsoDate[];
};

export function calculateCouponSchedule(
  settleDate: IsoDate,
  maturityDate: IsoDate,
): CouponSchedule {
  const couponDates: IsoDate[] = [];
  let periodsBack = 0;
  let couponDate = maturityDate;

  while (couponDate > settleDate) {
    couponDates.unshift(couponDate);
    periodsBack += 1;
    couponDate = shiftFromMaturity(maturityDate, -6 * periodsBack);
  }

  return { previousCouponDate: couponDate, couponDates };
}

function shiftFromMaturity(maturityDate: IsoDate, months: number): IsoDate {
  const shifted = addMonths(maturityDate, months);
  return isEndOfMonth(maturityDate) ? endOfMonth(shifted) : shifted;
}
