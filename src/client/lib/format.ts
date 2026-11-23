import type { SecurityKind } from '../types';
import { toUtcMs } from './dates';

const MINUS = '−';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const compactDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const longDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
const newYorkDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
});
const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function withSign(value: number, formatted: string, showPlus: boolean) {
  if (value < 0) return `${MINUS}${formatted}`;
  if (value > 0 && showPlus) return `+${formatted}`;
  return formatted;
}

function formatMoney(cents: number, formatter: Intl.NumberFormat, showPlus: boolean) {
  return withSign(cents, formatter.format(Math.abs(cents) / 100), showPlus);
}

export function formatCents(cents: number) {
  return formatMoney(cents, dollars, false);
}

export function formatWholeDollars(cents: number) {
  return formatMoney(cents, wholeDollars, false);
}

export function formatSignedCents(cents: number) {
  return formatMoney(cents, dollars, true);
}

export function formatSignedWholeDollars(cents: number) {
  return formatMoney(cents, wholeDollars, true);
}

export function formatCompactDollars(cents: number) {
  return compactDollars.format(cents / 100);
}

export function formatDollarInput(cents: number) {
  return grouped.format(cents / 100);
}

export function parseDollarInput(text: string) {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function formatBpsAsPercent(bps: number, digits = 2) {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function formatBpsChange(bps: number) {
  const rounded = Math.round(bps);
  return `${withSign(rounded, String(Math.abs(rounded)), true)} bp`;
}

export function formatDate(isoDate: string) {
  return longDate.format(toUtcMs(isoDate));
}

export function formatInstantDate(instant: string) {
  return newYorkDate.format(new Date(instant));
}

export function formatShortDate(isoDate: string) {
  return shortDate.format(toUtcMs(isoDate));
}

export function formatMonthTick(ms: number) {
  return monthYear.format(ms).replace(' ', ' ’');
}

export function formatDateTime(instant: string) {
  return dateTime.format(new Date(instant));
}

export function formatTermRemaining(days: number) {
  if (days < 365) return `${days} ${days === 1 ? 'day' : 'days'}`;
  return `${(days / 365).toFixed(1)} yrs`;
}

export function formatKind(kind: SecurityKind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function formatSecurityName(kind: SecurityKind, maturityDate: string) {
  return `T-${formatKind(kind)} · ${formatDate(maturityDate)}`;
}

export function formatTenorName(code: string) {
  const unit = code.endsWith('Y') ? 'year' : 'month';
  return `${code.slice(0, -1)}-${unit}`;
}

const REJECT_REASONS: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Insufficient cash',
  NO_MARKET_DATA: 'No market data',
  MATURITY_NO_LONGER_VALID: 'Maturity no longer valid',
};

export function formatRejectReason(reason: string | null) {
  if (!reason) return 'Rejected';
  return REJECT_REASONS[reason] ?? reason.replaceAll('_', ' ').toLowerCase();
}
