import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { Executor } from './client';
import type { ScheduledCashflows } from './schema';

export type ScheduledCashflow = Selectable<ScheduledCashflows>;
export type NewScheduledCashflow = Insertable<ScheduledCashflows>;

export function insertScheduledCashflows(
  cashflows: NewScheduledCashflow[],
  ex: Executor,
): Promise<ScheduledCashflow[]> {
  return ex.insertInto('scheduledCashflows').values(cashflows).returningAll().execute();
}
