import 'server-only';
import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import { insertScheduledCashflows } from '../db/cashflows';
import type { Database } from '../db/client';
import { insertHolding } from '../db/holdings';
import {
  findNextDueOrderForUpdate,
  findOrder,
  findOrderByIdempotencyKey,
  findOrders,
  insertOrder,
  markOrderExecuted,
  markOrderFailed,
  markOrderRejected,
  type Order,
  type OrderKeyset,
  type OrderWithHolding,
} from '../db/orders';
import type { DB } from '../db/schema';
import { insertSecurity } from '../db/securities';
import { withTransaction } from '../db/transaction';
import { DomainError } from '../domain/errors';
import type { Clock, IsoDate } from '../domain/types';
import type { BalanceService } from './balance';
import type { ExecuteOrder } from './execute-order';
import type { QuotesService } from './quotes';

const MIN_EXECUTION_DELAY_MS = 2_000;
const MAX_EXECUTION_DELAY_MS = 5_000;
const FILL_BATCH_LIMIT = 20;

export type OrderRequest = { maturityDate: IsoDate; faceCents: number };
export type SubmittedOrder = { order: OrderWithHolding; replayed: boolean };
export type OrderPage = { orders: OrderWithHolding[]; nextCursor: string | null };
export type OrdersQuery = { status?: string; cursor?: string; limit: number };
export type FillOutcome = 'none' | 'executed' | 'rejected' | 'failed';
export type FillSummary = { claimed: number; executed: number; rejected: number; failed: number };

type Dependencies = {
  db: Database;
  clock: Clock;
  quotes: QuotesService;
  executeOrder: ExecuteOrder;
  balance: BalanceService;
};

export function createOrdersService({ db, clock, quotes, executeOrder, balance }: Dependencies) {
  async function submitOrder(
    idempotencyKey: string,
    request: OrderRequest,
  ): Promise<SubmittedOrder> {
    const requestHash = hashRequest(request);

    const existing = await findOrderByIdempotencyKey(idempotencyKey, db);
    if (existing) return replay(existing, requestHash);

    const quote = await quotes.quoteOrder(request.maturityDate, request.faceCents);
    const inserted = await insertOrder(
      {
        idempotencyKey,
        requestHash,
        maturityDate: quote.security.maturityDate,
        faceCents: request.faceCents,
        quotedYieldBps: quote.yieldBps.toString(),
        quotedTotalCents: quote.totalCents,
        quotedAsOf: quote.pricedAsOf,
        executeAfter: new Date(clock.now().getTime() + randomExecutionDelayMs()),
      },
      db,
    );

    if (inserted) return { order: { ...inserted, holdingId: null }, replayed: false };

    const racedOrder = await findOrderByIdempotencyKey(idempotencyKey, db);
    if (!racedOrder) throw new Error(`Order for key ${idempotencyKey} vanished after conflict`);
    return replay(racedOrder, requestHash);
  }

  async function getOrder(id: string): Promise<OrderWithHolding> {
    const order = await findOrder(id, db);
    if (!order) throw new DomainError('NOT_FOUND', `Order ${id} not found`);
    return order;
  }

  async function listOrders(query: OrdersQuery): Promise<OrderPage> {
    const rows = await findOrders(
      { status: query.status, after: decodeCursor(query.cursor), limit: query.limit + 1 },
      db,
    );

    const orders = rows.slice(0, query.limit);
    const last = orders[orders.length - 1];
    const nextCursor = rows.length > query.limit && last ? encodeCursor(last) : null;

    return { orders, nextCursor };
  }

  async function fillDueOrders(): Promise<FillSummary> {
    const summary: FillSummary = { claimed: 0, executed: 0, rejected: 0, failed: 0 };

    for (let attempt = 0; attempt < FILL_BATCH_LIMIT; attempt++) {
      const outcome = await fillNextDueOrder();
      if (outcome === 'none') break;

      summary.claimed += 1;
      summary[outcome] += 1;
    }

    return summary;
  }

  async function fillNextDueOrder(): Promise<FillOutcome> {
    let claimedOrderId: string | undefined;

    try {
      return await withTransaction(db, async (trx) => {
        const order = await findNextDueOrderForUpdate(clock.now(), trx);
        if (!order) return 'none';

        claimedOrderId = order.id;
        return settleOrder(order, trx);
      });
    } catch (error) {
      if (!claimedOrderId) throw error;

      console.error(`order ${claimedOrderId} failed to fill`, error);
      await markOrderFailed(claimedOrderId, String(error), db);
      return 'failed';
    }
  }

  async function settleOrder(order: Order, trx: Transaction<DB>): Promise<'executed' | 'rejected'> {
    const execution = await executeOrder(order);
    if (execution.status === 'rejected') {
      await markOrderRejected(order.id, execution.reason, trx);
      return 'rejected';
    }

    const { quote, executedAt } = execution;

    const debited = await debitForOrder(order, quote.totalCents, trx);
    if (!debited) {
      await markOrderRejected(order.id, 'INSUFFICIENT_FUNDS', trx);
      return 'rejected';
    }

    const security = await insertSecurity(
      { ...quote.security, couponRateBps: quote.security.couponRateBps?.toString() ?? null },
      trx,
    );

    const holding = await insertHolding(
      {
        orderId: order.id,
        securityId: security.id,
        faceCents: order.faceCents,
        cleanCostCents: quote.cleanCents,
        accruedPaidCents: quote.accruedCents,
        purchaseYieldBps: quote.yieldBps.toString(),
        purchasedAt: executedAt,
      },
      trx,
    );

    await insertScheduledCashflows(
      quote.cashflows.map((cashflow) => ({
        holdingId: holding.id,
        payDate: cashflow.date,
        kind: cashflow.kind,
        amountCents: cashflow.amountCents,
      })),
      trx,
    );

    await markOrderExecuted(
      order.id,
      {
        executedAt,
        executedYieldBps: quote.yieldBps.toString(),
        executedTotalCents: quote.totalCents,
        pricedAsOf: quote.pricedAsOf,
      },
      trx,
    );

    return 'executed';
  }

  async function debitForOrder(order: Order, totalCents: number, trx: Transaction<DB>) {
    try {
      await balance.postLedgerEntry(
        { reason: 'buy', amountCents: -totalCents, orderId: order.id },
        trx,
      );
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.code === 'INSUFFICIENT_FUNDS') return false;
      throw error;
    }
  }

  return { submitOrder, getOrder, listOrders, fillDueOrders, fillNextDueOrder };
}

export type OrdersService = ReturnType<typeof createOrdersService>;

function replay(existing: OrderWithHolding, requestHash: string): SubmittedOrder {
  if (existing.requestHash !== requestHash) {
    throw new DomainError(
      'IDEMPOTENCY_CONFLICT',
      'This Idempotency-Key was already used with a different request',
    );
  }

  return { order: existing, replayed: true };
}

function hashRequest(request: OrderRequest): string {
  const canonical = JSON.stringify({
    maturityDate: request.maturityDate,
    faceCents: request.faceCents,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function randomExecutionDelayMs(): number {
  return MIN_EXECUTION_DELAY_MS + Math.random() * (MAX_EXECUTION_DELAY_MS - MIN_EXECUTION_DELAY_MS);
}

function encodeCursor(order: OrderWithHolding): string {
  return Buffer.from(`${order.createdAt.toISOString()}|${order.id}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): OrderKeyset | undefined {
  if (!cursor) return undefined;

  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAtDate = new Date(createdAt ?? '');

  if (!id || Number.isNaN(createdAtDate.getTime())) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid cursor');
  }

  return { createdAt: createdAtDate, id };
}
