import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateBillPrice, calculateBillYearBasis } from './bill';

// Appendix B's published inverse: investment rate from price for bills beyond a half-year.
function investmentRateFromPrice(price: Decimal, days: number, yearDays: number): Decimal {
  const t = new Decimal(days).div(yearDays);
  const a = t.times(2).minus(1);
  const discriminant = t.pow(2).minus(a.times(new Decimal(1).minus(new Decimal(100).div(price))));

  return t.times(-2).plus(discriminant.sqrt().times(2)).div(a);
}

describe('calculateBillPrice', () => {
  it('uses simple interest up to a half-year', () => {
    const price = calculateBillPrice(new Decimal(432), '2026-11-23', '2027-02-22');

    expect(price.toDecimalPlaces(6).toNumber()).toBe(98.934435);
  });

  it('compounds semiannually beyond a half-year', () => {
    const price = calculateBillPrice(new Decimal(451), '2026-11-23', '2027-11-18');

    expect(price.toDecimalPlaces(6).toNumber()).toBe(95.695908);
  });

  it('round-trips through the published investment-rate formula', () => {
    const price = calculateBillPrice(new Decimal(451), '2026-11-23', '2027-11-18');
    const rate = investmentRateFromPrice(price, 360, 365);

    expect(rate.times(10_000).toDecimalPlaces(9).toNumber()).toBe(451);
  });

  it('uses a 366-day year when the following year contains February 29', () => {
    expect(calculateBillYearBasis('2026-11-23')).toBe(365);
    expect(calculateBillYearBasis('2027-11-23')).toBe(366);
  });
});
