import { describe, expect, it } from 'vitest';
import { NOV_20_2026_CURVE } from '@test/fixtures/curves';
import { interpolateYield } from './interpolate';

const SETTLE = '2026-11-23';

describe('interpolateYield', () => {
  it('interpolates linearly by months between bracketing tenors', () => {
    const result = interpolateYield(NOV_20_2026_CURVE.points, SETTLE, '2027-08-23');

    expect(result.yieldBps.toNumber()).toBe(444.433);
    expect(result.interpolatedFrom).toEqual(['6M', '1Y']);
  });

  it('holds the shortest tenor flat below 1M', () => {
    const result = interpolateYield(NOV_20_2026_CURVE.points, SETTLE, '2026-12-01');

    expect(result.yieldBps.toNumber()).toBe(419);
    expect(result.interpolatedFrom).toEqual(['1M']);
  });

  it('holds the longest tenor flat beyond 30Y', () => {
    const result = interpolateYield(NOV_20_2026_CURVE.points, SETTLE, '2056-12-01');

    expect(result.yieldBps.toNumber()).toBe(531);
    expect(result.interpolatedFrom).toEqual(['30Y']);
  });
});
