import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  calculateDaysBetween,
  calculateEarliestMaturity,
  getTodayInNewYork,
} from './dates';

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths('2026-11-22', 3)).toBe('2027-02-22');
    expect(addMonths('2026-11-22', 120)).toBe('2036-11-22');
    expect(addMonths('2026-11-22', -6)).toBe('2026-05-22');
  });

  it('clamps to the end of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-08-31', -6)).toBe('2027-02-28');
  });

  it('treats fractional months as 30-day fractions', () => {
    expect(addMonths('2026-11-22', 1.5)).toBe('2027-01-06');
  });
});

describe('day arithmetic', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-11-20', -7)).toBe('2026-11-13');
  });

  it('counts calendar days', () => {
    expect(calculateDaysBetween('2026-11-22', '2026-12-17')).toBe(25);
  });

  it('reads today on the New York calendar', () => {
    expect(getTodayInNewYork(new Date('2026-11-23T03:00:00Z'))).toBe('2026-11-22');
    expect(getTodayInNewYork(new Date('2026-11-23T05:00:00Z'))).toBe('2026-11-23');
  });
});

describe('calculateEarliestMaturity', () => {
  it('is the second business day after today', () => {
    expect(calculateEarliestMaturity('2026-11-23')).toBe('2026-11-25');
    expect(calculateEarliestMaturity('2026-11-20')).toBe('2026-11-24');
    expect(calculateEarliestMaturity('2026-11-21')).toBe('2026-11-24');
    expect(calculateEarliestMaturity('2026-11-22')).toBe('2026-11-24');
  });
});
