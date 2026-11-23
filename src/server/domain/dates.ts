import 'server-only';
import type { Clock, IsoDate } from './types';

const MARKET_TIME_ZONE = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;

const newYorkDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: MARKET_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const newYorkOffsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  timeZoneName: 'longOffset',
});

export function createSystemClock(): Clock {
  return {
    now: () => new Date(),
    today: () => toNewYorkDate(new Date()),
  };
}

export function toNewYorkDate(instant: Date): IsoDate {
  return newYorkDateFormat.format(instant);
}

export function toNewYorkInstant(date: IsoDate, time: string): Date {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const offset = newYorkOffsetFormat.format(noonUtc).split('GMT')[1] ?? '-05:00';

  return new Date(`${date}T${time}${offset}`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
  return shifted.toISOString().slice(0, 10);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();

  firstOfTarget.setUTCDate(Math.min(day, lastDayOfTarget));
  return firstOfTarget.toISOString().slice(0, 10);
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function dayOfWeek(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function calculateDaysBetween(start: IsoDate, end: IsoDate): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function isEndOfMonth(date: IsoDate): boolean {
  return endOfMonth(date) === date;
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}
