import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { HoldingDetail, HoldingList, HoldingsQuery, IdParam } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const listHoldings = createRoute({
  method: 'get',
  path: '/',
  tags: ['Holdings'],
  summary: 'Lots, soonest maturity first',
  request: { query: HoldingsQuery },
  responses: { 200: jsonBody(HoldingList, 'Holdings'), 409: errorBody('NOT_INITIALIZED') },
});

const getHolding = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Holdings'],
  summary: 'One lot with its security and cashflow schedule',
  request: { params: IdParam },
  responses: { 200: jsonBody(HoldingDetail, 'Holding'), 404: errorBody('NOT_FOUND') },
});

export function holdingRoutes() {
  return createRouter()
    .openapi(listHoldings, () => notImplemented('GET /holdings'))
    .openapi(getHolding, () => notImplemented('GET /holdings/{id}'));
}
