import 'server-only';
import { sql, type Insertable, type Selectable, type Transaction } from 'kysely';
import type { Executor } from './client';
import type { DB, Orders } from './schema';

export type Order = Selectable<Orders>;
export type NewOrder = Insertable<Orders>;
export type OrderWithHolding = Order & { holdingId: string | null };

export type OrderKeyset = { createdAt: Date; id: string };

export type OrderFill = {
  executedAt: Date;
  executedYieldBps: string;
  executedTotalCents: number;
  pricedAsOf: Date;
};

export type OrdersFilter = {
  status?: string;
  after?: OrderKeyset;
  limit: number;
};

export function insertOrder(order: NewOrder, ex: Executor): Promise<Order | undefined> {
  return ex
    .insertInto('orders')
    .values(order)
    .onConflict((oc) => oc.column('idempotencyKey').doNothing())
    .returningAll()
    .executeTakeFirst();
}

export function findOrder(id: string, ex: Executor): Promise<OrderWithHolding | undefined> {
  return selectOrdersWithHolding(ex).where('orders.id', '=', id).executeTakeFirst();
}

export function findOrderByIdempotencyKey(
  idempotencyKey: string,
  ex: Executor,
): Promise<OrderWithHolding | undefined> {
  return selectOrdersWithHolding(ex)
    .where('orders.idempotencyKey', '=', idempotencyKey)
    .executeTakeFirst();
}

export function findOrders(filter: OrdersFilter, ex: Executor): Promise<OrderWithHolding[]> {
  let query = selectOrdersWithHolding(ex)
    .orderBy('orders.createdAt', 'desc')
    .orderBy('orders.id', 'desc')
    .limit(filter.limit);

  if (filter.status) query = query.where('orders.status', '=', filter.status);

  const after = filter.after;
  if (after) {
    query = query.where((eb) =>
      eb(eb.refTuple('orders.createdAt', 'orders.id'), '<', eb.tuple(after.createdAt, after.id)),
    );
  }

  return query.execute();
}

export function findNextDueOrderForUpdate(
  now: Date,
  trx: Transaction<DB>,
): Promise<Order | undefined> {
  return trx
    .selectFrom('orders')
    .selectAll()
    .where('status', '=', 'pending')
    .where('executeAfter', '<=', now)
    .orderBy('executeAfter')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();
}

export function markOrderExecuted(
  id: string,
  fill: OrderFill,
  trx: Transaction<DB>,
): Promise<Order> {
  return trx
    .updateTable('orders')
    .set({ ...fill, status: 'executed', updatedAt: sql`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function markOrderRejected(
  id: string,
  rejectReason: string,
  trx: Transaction<DB>,
): Promise<Order> {
  return trx
    .updateTable('orders')
    .set({ status: 'rejected', rejectReason, updatedAt: sql`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function markOrderFailed(
  id: string,
  failureMessage: string,
  ex: Executor,
): Promise<Order | undefined> {
  return ex
    .updateTable('orders')
    .set({ status: 'failed', failureMessage, updatedAt: sql`now()` })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .returningAll()
    .executeTakeFirst();
}

function selectOrdersWithHolding(ex: Executor) {
  return ex
    .selectFrom('orders')
    .leftJoin('holdings', 'holdings.orderId', 'orders.id')
    .selectAll('orders')
    .select('holdings.id as holdingId');
}
