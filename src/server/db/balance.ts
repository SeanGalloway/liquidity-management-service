import 'server-only';
import { sql, type Selectable, type Transaction } from 'kysely';
import type { Executor } from './client';
import type { Balance as BalanceTable, DB } from './schema';

export type Balance = Selectable<BalanceTable>;

export function findBalance(ex: Executor): Promise<Balance | undefined> {
  return ex.selectFrom('balance').selectAll().executeTakeFirst();
}

export function insertBalance(ex: Executor): Promise<Balance | undefined> {
  return ex
    .insertInto('balance')
    .values({ amountCents: 0 })
    .onConflict((oc) => oc.column('id').doNothing())
    .returningAll()
    .executeTakeFirst();
}

export function findBalanceForUpdate(trx: Transaction<DB>): Promise<Balance> {
  return trx.selectFrom('balance').selectAll().forUpdate().executeTakeFirstOrThrow();
}

export function updateBalanceAmount(amountCents: number, trx: Transaction<DB>): Promise<Balance> {
  return trx
    .updateTable('balance')
    .set({ amountCents, updatedAt: sql`now()` })
    .returningAll()
    .executeTakeFirstOrThrow();
}
