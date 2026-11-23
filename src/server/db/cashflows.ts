import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { CashflowKind, CashflowStatus } from '../domain/types';
import type { Executor } from './client';
import type { ScheduledCashflows } from './schema';

export type ScheduledCashflow = Omit<Selectable<ScheduledCashflows>, 'kind' | 'status'> & {
  kind: CashflowKind;
  status: CashflowStatus;
};

type CashflowNarrowing = { kind: CashflowKind; status: CashflowStatus };
export type NewScheduledCashflow = Insertable<ScheduledCashflows>;

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
