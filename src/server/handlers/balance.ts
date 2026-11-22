import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Balance, DateRangeQuery, LedgerEntryList } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
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
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function balanceRoutes() {
  return createRouter()
    .openapi(getBalance, () => notImplemented('GET /balance'))
    .openapi(getBalanceHistory, () => notImplemented('GET /balance/history'));
}
