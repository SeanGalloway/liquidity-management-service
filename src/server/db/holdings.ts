import 'server-only';
import { sql, type Insertable, type Selectable } from 'kysely';
import type { Executor } from './client';
import type { Holdings } from './schema';
import type { Security } from './securities';

export type Holding = Selectable<Holdings>;
export type NewHolding = Insertable<Holdings>;

export type SecurityTerms = Pick<
  Security,
  'kind' | 'cusip' | 'issueDate' | 'maturityDate' | 'couponRateBps' | 'synthetic'
>;

export type HoldingWithSecurity = Holding & SecurityTerms & { cashflowTotalCents: number };

export type HoldingStatusFilter = 'active' | 'matured' | 'all';

export function insertHolding(holding: NewHolding, ex: Executor): Promise<Holding> {
  return ex.insertInto('holdings').values(holding).returningAll().executeTakeFirstOrThrow();
}

export function findHoldingsWithSecurity(
  status: HoldingStatusFilter,
  ex: Executor,
): Promise<HoldingWithSecurity[]> {
  let query = selectHoldingsWithSecurity(ex)
    .orderBy('securities.maturityDate')
    .orderBy('holdings.purchasedAt');

  if (status !== 'all') query = query.where('holdings.status', '=', status);

  return query.execute();
}

export function findHoldingWithSecurity(
  id: string,
  ex: Executor,
): Promise<HoldingWithSecurity | undefined> {
  return selectHoldingsWithSecurity(ex).where('holdings.id', '=', id).executeTakeFirst();
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
    .select(
      sql<number>`(
        select coalesce(sum(c.amount_cents), 0)::bigint
        from scheduled_cashflows c
        where c.holding_id = holdings.id
      )`.as('cashflowTotalCents'),
    );
}
