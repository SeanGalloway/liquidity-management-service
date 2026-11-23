import 'server-only';
import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import { insertScheduledCashflows } from '../db/cashflows';
import type { Database } from '../db/client';
import { findBalanceForUpdate } from '../db/balance';
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
  type OrderWithHolding,
} from '../db/orders';
import type { DB } from '../db/schema';
import { insertSecurity } from '../db/securities';
import { withTransaction } from '../db/transaction';
import { DomainError } from '../domain/errors';
import type { Clock, IsoDate, OrderStatus } from '../domain/types';
import { calculateCashflows } from '../pricing/quote';
import type { BalanceService } from './balance';
import type { ExecuteOrder } from './execute-order';
import type { QuotesService } from './quotes';

const MIN_EXECUTION_DELAY_MS = 2_000;
const MAX_EXECUTION_DELAY_MS = 5_000;
const FILL_BATCH_LIMIT = 20;

export type OrderRequest = { maturityDate: IsoDate; faceCents: number };
export type SubmittedOrder = { order: OrderWithHolding; replayed: boolean };
export type OrderPage = { orders: OrderWithHolding[]; nextCursor: string | null };
export type OrdersQuery = { status?: OrderStatus; cursor?: string; limit: number };
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
      { status: query.status, afterId: query.cursor, limit: query.limit + 1 },
      db,
    );

    const orders = rows.slice(0, query.limit);
    const last = orders[orders.length - 1];
    const nextCursor = rows.length > query.limit && last ? last.id : null;

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
      await markOrderFailed(claimedOrderId, String(error), db).catch((markError) =>
        console.error(`could not mark order ${claimedOrderId} failed`, markError),
      );
      return 'failed';
    }
  }

  async function settleOrder(order: Order, trx: Transaction<DB>): Promise<'executed' | 'rejected'> {
    const funds = await findBalanceForUpdate(trx);
    if (funds.amountCents < order.quotedTotalCents) {
      await markOrderRejected(order.id, 'INSUFFICIENT_FUNDS', trx);
      return 'rejected';
    }

    const execution = await executeOrder(order);
    if (execution.status === 'rejected') {
      await markOrderRejected(order.id, execution.reason, trx);
      return 'rejected';
    }

    const { fill } = execution;

    const debited = await debitForOrder(order, fill.totalCents, trx);
    if (!debited) {
      await markOrderRejected(order.id, 'INSUFFICIENT_FUNDS', trx);
      return 'rejected';
    }

    const security = await insertSecurity(
      { ...fill.security, couponRateBps: fill.security.couponRateBps?.toString() ?? null },
      trx,
    );

    const holding = await insertHolding(
      {
        orderId: order.id,
        securityId: security.id,
        faceCents: order.faceCents,
        cleanCostCents: fill.cleanCents,
        accruedPaidCents: fill.accruedCents,
        purchaseYieldBps: fill.yieldBps.toString(),
        purchasedAt: fill.executedAt,
      },
      trx,
    );

    const cashflows = calculateCashflows(fill.security, order.faceCents, fill.settleDate);
    await insertScheduledCashflows(
      cashflows.map((cashflow) => ({
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
        executedAt: fill.executedAt,
        executedYieldBps: fill.yieldBps.toString(),
        executedTotalCents: fill.totalCents,
        pricedAsOf: fill.pricedAsOf,
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

export function hashRequest(request: OrderRequest): string {
  const canonical = JSON.stringify({
    maturityDate: request.maturityDate,
    faceCents: request.faceCents,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function randomExecutionDelayMs(): number {
  return MIN_EXECUTION_DELAY_MS + Math.random() * (MAX_EXECUTION_DELAY_MS - MIN_EXECUTION_DELAY_MS);
}
