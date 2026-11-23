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

type PricePer100 = { cleanPer100: Decimal; accruedPer100: Decimal };

export function calculateQuote({ security, curve, faceCents, settleDate }: QuoteInput): Quote {
  const { yieldBps, interpolatedFrom } = interpolateYield(
    curve.points,
    settleDate,
    security.maturityDate,
  );

  const price =
    security.kind === 'bill'
      ? priceBill(security, yieldBps, settleDate)
      : priceCouponSecurity(security, yieldBps, settleDate);

  const pricePer100 = roundPer100(price.cleanPer100);
  const cleanCents = toCents(pricePer100, faceCents);
  const accruedCents = toCents(roundPer100(price.accruedPer100), faceCents);
  const totalCents = cleanCents + accruedCents;

  const cashflows = calculateCashflows(security, faceCents, settleDate);
  const cashflowTotal = cashflows.reduce((sum, cashflow) => sum + cashflow.amountCents, 0);

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
    cashflows,
    pricedAsOf: curve.observedAt,
    source: curve.source,
  };
}

export function calculateCashflows(
  security: SecuritySpec,
  faceCents: number,
  settleDate: IsoDate,
): QuotedCashflow[] {
  const principal: QuotedCashflow = {
    date: rollForwardToBusinessDay(security.maturityDate),
    kind: 'principal',
    amountCents: faceCents,
  };

  if (security.kind === 'bill') return [principal];

  const couponCents = toCents(requireCouponRate(security).div(200), faceCents);
  const { couponDates } = calculateCouponSchedule(settleDate, security.maturityDate);

  const coupons = couponDates.map((date) => ({
    date: rollForwardToBusinessDay(date),
    kind: 'coupon' as const,
    amountCents: couponCents,
  }));

  return [...coupons, principal];
}

function priceBill(security: SecuritySpec, yieldBps: Decimal, settleDate: IsoDate): PricePer100 {
  return {
    cleanPer100: calculateBillPrice(yieldBps, settleDate, security.maturityDate),
    accruedPer100: new Decimal(0),
  };
}

function priceCouponSecurity(
  security: SecuritySpec,
  yieldBps: Decimal,
  settleDate: IsoDate,
): PricePer100 {
  const schedule = calculateCouponSchedule(settleDate, security.maturityDate);
  const couponRateBps = requireCouponRate(security);

  return calculateCouponPrice({ couponRateBps, yieldBps, schedule, settleDate });
}

function requireCouponRate(security: SecuritySpec): Decimal {
  if (!security.couponRateBps) throw new Error(`A ${security.kind} needs a coupon rate`);
  return security.couponRateBps;
}

function roundPer100(per100: Decimal): Decimal {
  return per100.toDecimalPlaces(PRICE_DECIMALS, Decimal.ROUND_HALF_UP);
}

function toCents(per100: Decimal, faceCents: number): number {
  return per100.times(faceCents).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}
