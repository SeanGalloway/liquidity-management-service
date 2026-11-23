import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Balance, DateRangeQuery, LedgerEntryList } from '@shared/contracts';
import type { Container } from '../container';
import type { LedgerEntry } from '../db/ledger';
import type { BalanceSummary } from '../services/balance';
import { createRouter, errorBody, jsonBody } from '../openapi';

const getBalance = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cash'],
  summary: 'Current cash balance and pending order exposure',
  responses: { 200: jsonBody(Balance, 'Current balance'), 409: errorBody('NOT_INITIALIZED') },
});

const getBalanceHistory = createRoute({
  method: 'get',
  path: '/history',
  tags: ['Cash'],
  summary: 'Ledger entries with running balance',
  request: { query: DateRangeQuery },
  responses: {
    200: jsonBody(LedgerEntryList, 'Ledger entries, oldest first'),
    400: errorBody('VALIDATION_FAILED'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function balanceRoutes({ balance }: Container) {
  return createRouter()
    .openapi(getBalance, async (c) => {
      const summary = await balance.getBalance();
      return c.json(toBalanceDto(summary), 200);
    })
    .openapi(getBalanceHistory, async (c) => {
      const entries = await balance.listBalanceHistory(c.req.valid('query'));
      return c.json({ data: entries.map(toLedgerEntryDto) }, 200);
    });
}

function toBalanceDto({ balance, pendingOrders }: BalanceSummary) {
  return {
    amountCents: balance.amountCents,
    updatedAt: balance.updatedAt.toISOString(),
    pendingOrders,
  };
}

function toLedgerEntryDto(entry: LedgerEntry) {
  return {
    id: entry.id,
    occurredAt: entry.occurredAt.toISOString(),
    amountCents: entry.amountCents,
    balanceAfterCents: entry.balanceAfterCents,
    reason: entry.reason,
    ref: toLedgerRef(entry),
  };
}

function toLedgerRef(entry: LedgerEntry) {
  if (entry.orderId) return { type: 'order' as const, id: entry.orderId };
  if (entry.cashflowId) return { type: 'cashflow' as const, id: entry.cashflowId };
  return null;
}
