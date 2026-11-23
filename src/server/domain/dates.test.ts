import { describe, expect, it } from 'vitest';
import { addDays, addMonths, toNewYorkDate, toNewYorkInstant } from './dates';

describe('dates', () => {
  it('converts a New York wall time to an instant across DST', () => {
    expect(toNewYorkInstant('2026-07-01', '15:30:00').toISOString()).toBe(
      '2026-07-01T19:30:00.000Z',
    );
    expect(toNewYorkInstant('2026-12-01', '15:30:00').toISOString()).toBe(
      '2026-12-01T20:30:00.000Z',
    );
  });

  it('resolves New York midnight with the offset in force at midnight on DST changeover days', () => {
    expect(toNewYorkInstant('2026-03-08', '00:00:00').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(toNewYorkInstant('2026-11-01', '00:00:00').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(toNewYorkInstant('2026-03-08', '15:30:00').toISOString()).toBe(
      '2026-03-08T19:30:00.000Z',
    );
  });

  it('uses the New York calendar date for "today"', () => {
    expect(toNewYorkDate(new Date('2026-11-23T03:00:00Z'))).toBe('2026-11-22');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('clamps addMonths to the end of shorter months', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-22', -12)).toBe('2025-11-22');
  });
});
