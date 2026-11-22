import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Curve, CurveQuery, YieldHistory, YieldHistoryQuery } from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';
import type { Curve as CurveValue, YieldSeries } from '../services/yields';

const getCurve = createRoute({
  method: 'get',
  path: '/curve',
  tags: ['Market data'],
  summary: 'Par yield curve on a date (nearest prior business day) or the latest',
  request: { query: CurveQuery },
  responses: { 200: jsonBody(Curve, 'Curve'), 503: errorBody('NO_MARKET_DATA') },
});

const getYieldHistory = createRoute({
  method: 'get',
  path: '/history',
  tags: ['Market data'],
  summary: 'Daily yield series per tenor (defaults to the last 6 months)',
  request: { query: YieldHistoryQuery },
  responses: { 200: jsonBody(YieldHistory, 'Series'), 400: errorBody('Unknown tenor code') },
});

export function yieldRoutes({ yields }: Container) {
  return createRouter()
    .openapi(getCurve, async (c) => {
      const curve = await yields.getCurve(c.req.valid('query').date);
      return c.json(toCurveDto(curve), 200);
    })
    .openapi(getYieldHistory, async (c) => {
      const { tenors, from, to } = c.req.valid('query');
      const tenorCodes = tenors
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean);
      const series = await yields.listYieldHistory(tenorCodes, { from, to });
      return c.json({ series: series.map(toSeriesDto) }, 200);
    });
}

function toCurveDto(curve: CurveValue) {
  return {
    asOf: curve.asOfDate,
    source: curve.source,
    points: curve.points.map((point) => ({
      tenor: point.tenorCode,
      yieldBps: point.yieldBps.toNumber(),
    })),
  };
}

function toSeriesDto(series: YieldSeries) {
  return {
    tenor: series.tenorCode,
    points: series.points.map((point) => ({
      date: point.date,
      yieldBps: point.yieldBps.toNumber(),
    })),
  };
}
