import 'server-only';
import { sql, type Insertable, type Selectable, type Transaction } from 'kysely';
import type { CashflowKind, CashflowStatus, DateRange, IsoDate } from '../domain/types';
import type { Executor } from './client';
import type { DB, ScheduledCashflows } from './schema';

type CashflowNarrowing = { kind: CashflowKind; status: CashflowStatus };

export type ScheduledCashflow = Omit<Selectable<ScheduledCashflows>, keyof CashflowNarrowing> &
  CashflowNarrowing;
export type NewScheduledCashflow = Insertable<ScheduledCashflows>;

export type CashflowsFilter = { status?: CashflowStatus; range?: Partial<DateRange> };

export function insertScheduledCashflows(
  cashflows: NewScheduledCashflow[],
  ex: Executor,
): Promise<ScheduledCashflow[]> {
  return ex
    .insertInto('scheduledCashflows')
    .values(cashflows)
    .returningAll()
    .$narrowType<CashflowNarrowing>()
    .execute();
}

export function findCashflowsForHolding(
  holdingId: string,
  ex: Executor,
): Promise<ScheduledCashflow[]> {
  return ex
    .selectFrom('scheduledCashflows')
    .selectAll()
    .where('holdingId', '=', holdingId)
    .orderBy('payDate')
    .orderBy('kind')
    .$narrowType<CashflowNarrowing>()
    .execute();
}

export function findCashflows(filter: CashflowsFilter, ex: Executor): Promise<ScheduledCashflow[]> {
  let query = ex.selectFrom('scheduledCashflows').selectAll().orderBy('payDate').orderBy('kind');

  if (filter.status) query = query.where('status', '=', filter.status);
  if (filter.range?.from) query = query.where('payDate', '>=', filter.range.from);
  if (filter.range?.to) query = query.where('payDate', '<=', filter.range.to);

  return query.$narrowType<CashflowNarrowing>().execute();
}

export function findNextDueCashflowForUpdate(
  today: IsoDate,
  trx: Transaction<DB>,
): Promise<ScheduledCashflow | undefined> {
  return trx
    .selectFrom('scheduledCashflows')
    .selectAll()
    .where('status', '=', 'scheduled')
    .where('payDate', '<=', today)
    .orderBy('payDate')
    .orderBy('kind')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .$narrowType<CashflowNarrowing>()
    .executeTakeFirst();
}

export function markCashflowPaid(id: string, trx: Transaction<DB>): Promise<ScheduledCashflow> {
  return trx
    .updateTable('scheduledCashflows')
    .set({ status: 'paid', paidAt: sql`now()` })
    .where('id', '=', id)
    .returningAll()
    .$narrowType<CashflowNarrowing>()
    .executeTakeFirstOrThrow();
}
