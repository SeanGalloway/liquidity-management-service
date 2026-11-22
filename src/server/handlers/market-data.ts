import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Curve, CurveQuery, TenorList, YieldHistory, YieldHistoryQuery } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const listTenors = createRoute({
  method: 'get',
  path: '/tenors',
  tags: ['Market data'],
  summary: 'Reference tenors on the par yield curve',
  responses: { 200: jsonBody(TenorList, 'Tenors, shortest first') },
});

const getCurve = createRoute({
  method: 'get',
  path: '/yields/curve',
  tags: ['Market data'],
  summary: 'Par yield curve on a date (nearest prior business day) or the latest',
  request: { query: CurveQuery },
  responses: { 200: jsonBody(Curve, 'Curve'), 503: errorBody('NO_MARKET_DATA') },
});

const getYieldHistory = createRoute({
  method: 'get',
  path: '/yields/history',
  tags: ['Market data'],
  summary: 'Daily yield series per tenor',
  request: { query: YieldHistoryQuery },
  responses: { 200: jsonBody(YieldHistory, 'Series'), 400: errorBody('Unknown tenor code') },
});

export function marketDataRoutes() {
  return createRouter()
    .openapi(listTenors, () => notImplemented('GET /tenors'))
    .openapi(getCurve, () => notImplemented('GET /yields/curve'))
    .openapi(getYieldHistory, () => notImplemented('GET /yields/history'));
}
