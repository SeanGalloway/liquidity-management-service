import { describe, expect, it } from 'vitest';
import { NOV_20_2026_CURVE } from '@test/fixtures/curves';
import { createSecurityResolver } from './security-resolver';

const SETTLE = '2026-11-23';
const { resolveSecurity } = createSecurityResolver();

describe('resolveSecurity', () => {
  it('resolves maturities within a year to synthetic bills', () => {
    expect(resolveSecurity('2027-03-18', NOV_20_2026_CURVE, SETTLE)).toEqual({
      kind: 'bill',
      cusip: null,
      issueDate: SETTLE,
      maturityDate: '2027-03-18',
      couponRateBps: null,
      synthetic: true,
    });
  });

  it('rolls a bill maturity that falls on a holiday to the next business day', () => {
    expect(resolveSecurity('2027-07-05', NOV_20_2026_CURVE, SETTLE).maturityDate).toBe(
      '2027-07-06',
    );
  });

  it('never stretches a bill past one year by rolling its maturity', () => {
    const security = resolveSecurity('2027-11-27', NOV_20_2026_CURVE, '2026-11-27');

    expect(security.kind).toBe('note');
    expect(security.maturityDate).toBe('2027-11-27');
  });

  it('resolves longer maturities to par notes on their nominal dates', () => {
    const security = resolveSecurity('2028-11-23', NOV_20_2026_CURVE, SETTLE);

    expect(security.kind).toBe('note');
    expect(security.maturityDate).toBe('2028-11-23');
    expect(security.issueDate).toBe('2026-11-23');
    expect(security.couponRateBps?.toNumber()).toBeCloseTo(463, 0);
  });

  it('classifies terms beyond ten years as bonds', () => {
    expect(resolveSecurity('2046-11-15', NOV_20_2026_CURVE, SETTLE).kind).toBe('bond');
  });

  it('rejects maturities on or before settlement and beyond 30 years', () => {
    expect(() => resolveSecurity(SETTLE, NOV_20_2026_CURVE, SETTLE)).toThrow(
      'Maturity must be after settlement',
    );
    expect(() => resolveSecurity('2056-11-24', NOV_20_2026_CURVE, SETTLE)).toThrow(
      'within 30 years',
    );
  });
});
