import { describe, expect, it } from 'vitest';
import {
  formatBpsAsPercent,
  formatBpsChange,
  formatCents,
  formatCompactDollars,
  formatDate,
  formatDollarInput,
  formatMonthTick,
  formatRejectReason,
  formatSecurityName,
  formatShortDate,
  formatSignedCents,
  formatSignedWholeDollars,
  formatTenorName,
  formatTermRemaining,
  formatWholeDollars,
  parseDollarInput,
} from './format';

describe('money', () => {
  it('formats integer cents as dollars', () => {
    expect(formatCents(74_098_050)).toBe('$740,980.50');
    expect(formatCents(-150)).toBe('−$1.50');
    expect(formatWholeDollars(74_098_050)).toBe('$740,981');
  });

  it('signs deltas with a plus and a true minus', () => {
    expect(formatSignedCents(901_950)).toBe('+$9,019.50');
    expect(formatSignedCents(-901_950)).toBe('−$9,019.50');
    expect(formatSignedCents(0)).toBe('$0.00');
    expect(formatSignedWholeDollars(2_645_000)).toBe('+$26,450');
  });

  it('abbreviates axis values', () => {
    expect(formatCompactDollars(1_600_000_000)).toBe('$16M');
    expect(formatCompactDollars(0)).toBe('$0');
  });
});

describe('dollar input', () => {
  it('parses typed amounts into cents', () => {
    expect(parseDollarInput('$750,000')).toBe(75_000_000);
    expect(parseDollarInput(' 1200.5 ')).toBe(120_050);
    expect(parseDollarInput('100.25')).toBe(10_025);
  });

  it('rejects anything that is not a plain amount', () => {
    expect(parseDollarInput('')).toBeNull();
    expect(parseDollarInput('12a')).toBeNull();
    expect(parseDollarInput('-5')).toBeNull();
    expect(parseDollarInput('1.234')).toBeNull();
  });

  it('round-trips through the display format', () => {
    expect(formatDollarInput(75_000_000)).toBe('750,000');
    expect(parseDollarInput(formatDollarInput(75_000_000))).toBe(75_000_000);
  });
});

describe('rates', () => {
  it('formats bps as percent', () => {
    expect(formatBpsAsPercent(383.2)).toBe('3.83%');
    expect(formatBpsAsPercent(457.727, 3)).toBe('4.577%');
  });

  it('formats changes in whole basis points', () => {
    expect(formatBpsChange(2.4)).toBe('+2 bp');
    expect(formatBpsChange(-11)).toBe('−11 bp');
    expect(formatBpsChange(0.2)).toBe('0 bp');
  });
});

describe('dates', () => {
  it('formats ISO dates without shifting time zones', () => {
    expect(formatDate('2027-03-18')).toBe('Mar 18, 2027');
    expect(formatShortDate('2026-12-15')).toBe('Dec 15');
    expect(formatMonthTick(Date.UTC(2026, 5, 1))).toBe('Jun ’26');
  });

  it('describes the term remaining', () => {
    expect(formatTermRemaining(1)).toBe('1 day');
    expect(formatTermRemaining(25)).toBe('25 days');
    expect(formatTermRemaining(584)).toBe('1.6 yrs');
  });
});

describe('labels', () => {
  it('names securities and tenors', () => {
    expect(formatSecurityName('bill', '2026-12-17')).toBe('T-Bill · Dec 17, 2026');
    expect(formatTenorName('3M')).toBe('3-month');
    expect(formatTenorName('10Y')).toBe('10-year');
  });

  it('humanizes reject reasons', () => {
    expect(formatRejectReason('INSUFFICIENT_FUNDS')).toBe('Insufficient cash');
    expect(formatRejectReason('SOMETHING_ELSE')).toBe('something else');
    expect(formatRejectReason(null)).toBe('Rejected');
  });
});
