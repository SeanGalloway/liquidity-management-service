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

  const priced =
    security.kind === 'bill'
      ? priceBill(security, yieldBps, faceCents, settleDate)
      : priceCouponSecurity(security, yieldBps, faceCents, settleDate);

  const pricePer100 = priced.cleanPer100.toDecimalPlaces(PRICE_DECIMALS, Decimal.ROUND_HALF_UP);
  const cleanCents = toCents(pricePer100, faceCents);
  const accruedPer100 = priced.accruedPer100.toDecimalPlaces(PRICE_DECIMALS, Decimal.ROUND_HALF_UP);
  const accruedCents = toCents(accruedPer100, faceCents);
  const totalCents = cleanCents + accruedCents;
  const cashflowTotal = priced.cashflows.reduce((sum, cashflow) => sum + cashflow.amountCents, 0);

  return {
    security,
    settleDate,
    days: calculateDaysBetween(settleDate, security.maturityDate),
    yieldBps,
    interpolatedFrom,
    pricePer100,
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
  security: SecuritySpec,
  yieldBps: Decimal,
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
  security: SecuritySpec,
  yieldBps: Decimal,
  faceCents: number,
  settleDate: IsoDate,
): PricedSecurity {
  const couponRateBps = security.couponRateBps;
  if (!couponRateBps) throw new Error(`A ${security.kind} needs a coupon rate`);

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
