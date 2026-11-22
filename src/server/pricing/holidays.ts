import 'server-only';
import { addDays, dayOfWeek, endOfMonth, toIsoDate, yearOf } from '../domain/dates';
import type { IsoDate } from '../domain/types';

const SUNDAY = 0;
const MONDAY = 1;
const THURSDAY = 4;
const SATURDAY = 6;

const holidaysByYear = new Map<number, Set<IsoDate>>();

export function isFederalReserveHoliday(date: IsoDate): boolean {
  const year = yearOf(date);

  let holidays = holidaysByYear.get(year);
  if (!holidays) {
    holidays = calculateFederalReserveHolidays(year);
    holidaysByYear.set(year, holidays);
  }

  return holidays.has(date);
}

// Federal Reserve (Fedwire securities) holidays: Sunday holidays move to Monday, Saturday ones are not observed.
export function calculateFederalReserveHolidays(year: number): Set<IsoDate> {
  const holidays = [
    observed(toIsoDate(year, 1, 1)),
    nthWeekdayOfMonth(year, 1, MONDAY, 3),
    nthWeekdayOfMonth(year, 2, MONDAY, 3),
    lastWeekdayOfMonth(year, 5, MONDAY),
    observed(toIsoDate(year, 6, 19)),
    observed(toIsoDate(year, 7, 4)),
    nthWeekdayOfMonth(year, 9, MONDAY, 1),
    nthWeekdayOfMonth(year, 10, MONDAY, 2),
    observed(toIsoDate(year, 11, 11)),
    nthWeekdayOfMonth(year, 11, THURSDAY, 4),
    observed(toIsoDate(year, 12, 25)),
  ];

  return new Set(holidays.filter((date): date is IsoDate => date !== null));
}

function observed(date: IsoDate): IsoDate | null {
  const weekday = dayOfWeek(date);

  if (weekday === SUNDAY) return addDays(date, 1);
  if (weekday === SATURDAY) return null;
  return date;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): IsoDate {
  const first = toIsoDate(year, month, 1);
  const offset = (weekday - dayOfWeek(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): IsoDate {
  const last = endOfMonth(toIsoDate(year, month, 1));
  const offset = (dayOfWeek(last) - weekday + 7) % 7;
  return addDays(last, -offset);
}
