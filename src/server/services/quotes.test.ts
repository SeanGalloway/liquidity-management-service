import { describe, expect, it, vi } from 'vitest';
import { NOV_20_2026_CURVE } from '@test/fixtures/curves';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createQuotesService } from './quotes';
import { createSecurityResolver } from './security-resolver';
import type { YieldsService } from './yields';

const SUNDAY = createFakeClock('2026-11-22T17:00:00Z');

function createService() {
  const getCurve = vi.fn(async () => NOV_20_2026_CURVE);
  const yields = { getCurve } as unknown as YieldsService;
  const service = createQuotesService({
    clock: SUNDAY,
    yields,
    securityResolver: createSecurityResolver(),
  });

  return { service, getCurve };
}

describe('quoteOrder', () => {
  it('prices a bill from the latest close, settling on the next business day', async () => {
    const { service, getCurve } = createService();

    const quote = await service.quoteOrder('2027-03-18', 75_000_000);

    expect(getCurve).toHaveBeenCalledWith('latest');
    expect(quote.settleDate).toBe('2026-11-23');
    expect(quote.days).toBe(115);
    expect(quote.yieldBps.toNumber()).toBe(432);
    expect(quote.pricePer100.toNumber()).toBe(98.657181);
    expect(quote.cleanCents).toBe(73_992_886);
    expect(quote.accruedCents).toBe(0);
    expect(quote.cashflows).toEqual([
      { date: '2027-03-18', kind: 'principal', amountCents: 75_000_000 },
    ]);
    expect(quote.interestToMaturityCents).toBe(75_000_000 - 73_992_886);
    expect(quote.pricedAsOf).toEqual(NOV_20_2026_CURVE.observedAt);
  });

  it('prices a note with accrued interest and a full coupon schedule', async () => {
    const { service } = createService();

    const quote = await service.quoteOrder('2028-06-15', 100_000_000);

    expect(quote.security.kind).toBe('note');
    expect(quote.accruedCents).toBeGreaterThan(0);
    expect(quote.totalCents).toBe(quote.cleanCents + quote.accruedCents);
    expect(quote.cashflows.map((cashflow) => cashflow.kind)).toEqual([
      'coupon',
      'coupon',
      'coupon',
      'coupon',
      'principal',
    ]);
    expect(quote.pricePer100.toNumber()).toBe(99.997253);
    expect(quote.cleanCents).toBe(99_997_253);
    expect(quote.accruedCents).toBe(2_013_499);
  });

  it('charges cents from the published six-decimal price', async () => {
    const { service } = createService();

    const quote = await service.quoteOrder('2027-03-18', 10_000_000_000);

    expect(quote.pricePer100.toNumber()).toBe(98.657181);
    expect(quote.cleanCents).toBe(9_865_718_100);
  });

  it('settles on the trade date when today is a business day', async () => {
    const getCurve = vi.fn(async () => NOV_20_2026_CURVE);
    const service = createQuotesService({
      clock: createFakeClock('2026-11-24T17:00:00Z'),
      yields: { getCurve } as unknown as YieldsService,
      securityResolver: createSecurityResolver(),
    });

    const quote = await service.quoteOrder('2027-03-18', 75_000_000);

    expect(quote.settleDate).toBe('2026-11-24');
    expect(quote.days).toBe(114);
  });

  it('pays coupons on the next business day when the coupon date is a weekend', async () => {
    const { service } = createService();

    const quote = await service.quoteOrder('2031-11-30', 100_000_000);

    expect(quote.cashflows[0]?.date).toBe('2026-11-30');
    expect(quote.cashflows.find((cashflow) => cashflow.kind === 'principal')?.date).toBe(
      '2031-12-01',
    );
  });
});
