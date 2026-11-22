import 'server-only';
import { addDays, dayOfWeek } from '../domain/dates';
import type { IsoDate } from '../domain/types';
import { isFederalReserveHoliday } from './holidays';

export function isBusinessDay(date: IsoDate): boolean {
  const weekday = dayOfWeek(date);
  return weekday !== 0 && weekday !== 6 && !isFederalReserveHoliday(date);
}

export function rollForwardToBusinessDay(date: IsoDate): IsoDate {
  let candidate = date;
  while (!isBusinessDay(candidate)) candidate = addDays(candidate, 1);
  return candidate;
}
