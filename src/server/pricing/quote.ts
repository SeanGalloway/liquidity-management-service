import 'server-only';
import Decimal from 'decimal.js';
import { calculateDaysBetween } from '../domain/dates';
import type { Curve, IsoDate, SecuritySpec } from '../domain/types';
import { calculateBillPrice } from './bill';
import { rollForwardToBusinessDay } from './calendar';
import { calculateCouponPrice } from './coupon';
import { interpolateYield } from './interpolate';
import { calculateCouponSchedule } from './schedule';

const PRICE_DECIMALS = 6;

export type QuotedCashflow = { date: IsoDate; kind: 'coupon' | 'principal'; amountCents: number };

export type Quote = {
  security: SecuritySpec;
  settleDate: IsoDate;
  days: number;
  yieldBps: Decimal;
  interpolatedFrom: string[];
  pricePer100: Decimal;
  cleanCents: number;
  accruedCents: number;
  totalCents: number;
  interestToMaturityCents: number;
  cashflows: QuotedCashflow[];
  pricedAsOf: Date;
  source: string;
};

type QuoteInput = {
  security: SecuritySpec;
  curve: Curve;
  faceCents: number;
  settleDate: IsoDate;
};

type PricedSecurity = {
  cleanPer100: Decimal;
  accruedPer100: Decimal;
  cashflows: QuotedCashflow[];
};

export function calculateQuote({ security, curve, faceCents, settleDate }: QuoteInput): Quote {
  const { yieldBps, interpolatedFrom } = interpolateYield(
    curve.points,
    settleDate,
    security.maturityDate,
  );

  const priced = security.couponRateBps
    ? priceCouponSecurity(security.couponRateBps, yieldBps, security, faceCents, settleDate)
    : priceBill(yieldBps, security, faceCents, settleDate);

  const cleanCents = toCents(priced.cleanPer100, faceCents);
  const accruedCents = toCents(priced.accruedPer100, faceCents);
  const totalCents = cleanCents + accruedCents;
  const cashflowTotal = priced.cashflows.reduce((sum, cashflow) => sum + cashflow.amountCents, 0);

  return {
    security,
    settleDate,
    days: calculateDaysBetween(settleDate, security.maturityDate),
    yieldBps,
    interpolatedFrom,
    pricePer100: priced.cleanPer100.toDecimalPlaces(PRICE_DECIMALS),
    cleanCents,
    accruedCents,
    totalCents,
    interestToMaturityCents: cashflowTotal - totalCents,
    cashflows: priced.cashflows,
    pricedAsOf: curve.observedAt,
    source: curve.source,
  };
}

function priceBill(
  yieldBps: Decimal,
  security: SecuritySpec,
  faceCents: number,
  settleDate: IsoDate,
): PricedSecurity {
  return {
    cleanPer100: calculateBillPrice(yieldBps, settleDate, security.maturityDate),
    accruedPer100: new Decimal(0),
    cashflows: [principalCashflow(security, faceCents)],
  };
}

function priceCouponSecurity(
  couponRateBps: Decimal,
  yieldBps: Decimal,
  security: SecuritySpec,
  faceCents: number,
  settleDate: IsoDate,
): PricedSecurity {
  const schedule = calculateCouponSchedule(settleDate, security.maturityDate);
  const price = calculateCouponPrice({ couponRateBps, yieldBps, schedule, settleDate });
  const couponCents = toCents(couponRateBps.div(200), faceCents);

  const coupons = schedule.couponDates.map((date) => ({
    date: rollForwardToBusinessDay(date),
    kind: 'coupon' as const,
    amountCents: couponCents,
  }));

  return {
    cleanPer100: price.cleanPer100,
    accruedPer100: price.accruedPer100,
    cashflows: [...coupons, principalCashflow(security, faceCents)],
  };
}

function principalCashflow(security: SecuritySpec, faceCents: number): QuotedCashflow {
  return {
    date: rollForwardToBusinessDay(security.maturityDate),
    kind: 'principal',
    amountCents: faceCents,
  };
}

function toCents(per100: Decimal, faceCents: number): number {
  return per100.times(faceCents).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
