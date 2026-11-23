import { describe, expect, it } from 'vitest';
import { isBusinessDay, rollForwardToBusinessDay } from './calendar';
import { calculateFederalReserveHolidays } from './holidays';

describe('Federal Reserve holidays', () => {
  it('lists the 2026 schedule, skipping July 4 on a Saturday', () => {
    expect([...calculateFederalReserveHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-05-25',
      '2026-06-19',
      '2026-09-07',
      '2026-10-12',
      '2026-11-11',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it('moves Sunday holidays to Monday', () => {
    expect(calculateFederalReserveHolidays(2023).has('2023-01-02')).toBe(true);
    expect(calculateFederalReserveHolidays(2022).has('2022-12-26')).toBe(true);
  });

  it('does not observe Saturday holidays on Friday', () => {
    const holidays2027 = calculateFederalReserveHolidays(2027);

    expect(holidays2027.has('2027-06-18')).toBe(false);
    expect(holidays2027.has('2027-12-24')).toBe(false);
  });
});

describe('business days', () => {
  it('excludes weekends and holidays', () => {
    expect(isBusinessDay('2026-11-23')).toBe(true);
    expect(isBusinessDay('2026-11-22')).toBe(false);
    expect(isBusinessDay('2026-11-26')).toBe(false);
  });

  it('rolls forward over weekends and holidays', () => {
    expect(rollForwardToBusinessDay('2026-11-21')).toBe('2026-11-23');
    expect(rollForwardToBusinessDay('2026-11-26')).toBe('2026-11-27');
    expect(rollForwardToBusinessDay('2026-11-23')).toBe('2026-11-23');
  });
});
