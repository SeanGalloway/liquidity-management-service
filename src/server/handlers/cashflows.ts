import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { CashflowList, CashflowQuery } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const listCashflows = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cash'],
  summary: 'Scheduled and paid coupon / principal cashflows',
  request: { query: CashflowQuery },
  responses: {
    200: jsonBody(CashflowList, 'Cashflows by date'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function cashflowRoutes() {
  return createRouter().openapi(listCashflows, () => notImplemented('GET /cashflows'));
}
