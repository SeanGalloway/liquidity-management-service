import 'server-only';
import { sql, type Insertable, type Selectable, type Transaction } from 'kysely';
import type { HoldingStatus, SecurityKind } from '../domain/types';
import type { Executor } from './client';
import type { DB, Holdings } from './schema';
import type { Security } from './securities';

export type Holding = Omit<Selectable<Holdings>, 'status'> & { status: HoldingStatus };
export type NewHolding = Insertable<Holdings>;

type HoldingWithSecurityNarrowing = {
  kind: SecurityKind;
  cashflowTotalCents: number;
};

export type HoldingWithSecurity = Holding &
  Pick<Security, 'cusip' | 'issueDate' | 'maturityDate' | 'couponRateBps' | 'synthetic'> &
  HoldingWithSecurityNarrowing;

export type HoldingStatusFilter = HoldingStatus | 'all';

export function insertHolding(holding: NewHolding, ex: Executor): Promise<Holding> {
  return ex
    .insertInto('holdings')
    .values(holding)
    .returningAll()
    .$narrowType<{ status: HoldingStatus }>()
    .executeTakeFirstOrThrow();
}

export function findHoldingsWithSecurity(
  status: HoldingStatusFilter,
  ex: Executor,
): Promise<HoldingWithSecurity[]> {
  let query = selectHoldingsWithSecurity(ex)
    .orderBy('securities.maturityDate')
    .orderBy('holdings.purchasedAt')
    .orderBy('holdings.id');

  if (status !== 'all') query = query.where('holdings.status', '=', status);

  return query.execute();
}

export function findHoldingWithSecurity(
  id: string,
  ex: Executor,
): Promise<HoldingWithSecurity | undefined> {
  return selectHoldingsWithSecurity(ex).where('holdings.id', '=', id).executeTakeFirst();
}

export function markHoldingMatured(id: string, trx: Transaction<DB>): Promise<Holding> {
  return trx
    .updateTable('holdings')
    .set({ status: 'matured', maturedAt: sql`now()` })
    .where('id', '=', id)
    .returningAll()
    .$narrowType<{ status: HoldingStatus }>()
    .executeTakeFirstOrThrow();
}

function selectHoldingsWithSecurity(ex: Executor) {
  return ex
    .selectFrom('holdings')
    .innerJoin('securities', 'securities.id', 'holdings.securityId')
    .selectAll('holdings')
    .select([
      'securities.kind',
      'securities.cusip',
      'securities.issueDate',
      'securities.maturityDate',
      'securities.couponRateBps',
      'securities.synthetic',
    ])
    .select((eb) =>
      eb
        .selectFrom('scheduledCashflows')
        .select((inner) =>
          inner
            .cast<number>(inner.fn.coalesce(inner.fn.sum('amountCents'), inner.lit(0)), 'bigint')
            .as('total'),
        )
        .whereRef('scheduledCashflows.holdingId', '=', 'holdings.id')
        .$asScalar()
        .as('cashflowTotalCents'),
    )
    .$narrowType<HoldingWithSecurityNarrowing & Pick<Holding, 'status'>>();
}
