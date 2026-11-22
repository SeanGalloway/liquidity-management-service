import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import {
  Balance,
  CashflowList,
  CashflowQuery,
  DateRangeQuery,
  LedgerEntryList,
  Timeline,
  TimelineQuery,
} from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const notInitialized = errorBody('NOT_INITIALIZED — run setup first');

const getBalance = createRoute({
  method: 'get',
  path: '/balance',
  tags: ['Cash'],
  summary: 'Current cash balance and pending order exposure',
  responses: { 200: jsonBody(Balance, 'Current balance'), 409: notInitialized },
});

const getBalanceHistory = createRoute({
  method: 'get',
  path: '/balance/history',
  tags: ['Cash'],
  summary: 'Ledger entries with running balance',
  request: { query: DateRangeQuery },
  responses: {
    200: jsonBody(LedgerEntryList, 'Ledger entries, oldest first'),
    409: notInitialized,
  },
});

const getCashflows = createRoute({
  method: 'get',
  path: '/cashflows',
  tags: ['Cash'],
  summary: 'Scheduled and paid coupon / principal cashflows',
  request: { query: CashflowQuery },
  responses: { 200: jsonBody(CashflowList, 'Cashflows by date'), 409: notInitialized },
});

const getTimeline = createRoute({
  method: 'get',
  path: '/timeline',
  tags: ['Cash'],
  summary: 'Actual balance history plus projection from scheduled cashflows',
  request: { query: TimelineQuery },
  responses: { 200: jsonBody(Timeline, 'Chart-ready series'), 409: notInitialized },
});

export function balanceRoutes() {
  return createRouter()
    .openapi(getBalance, () => notImplemented('GET /balance'))
    .openapi(getBalanceHistory, () => notImplemented('GET /balance/history'))
    .openapi(getCashflows, () => notImplemented('GET /cashflows'))
    .openapi(getTimeline, () => notImplemented('GET /timeline'));
}
