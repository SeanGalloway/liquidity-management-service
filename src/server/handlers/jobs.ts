import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import type { z } from 'zod';
import {
  BackfillResult,
  FillOrdersResult,
  PayCashflowsResult,
  PollYieldsResult,
} from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

function jobRoute(path: string, summary: string, result: z.ZodType) {
  return createRoute({
    method: 'post',
    path,
    tags: ['Jobs'],
    summary,
    security: [{ jobToken: [] }],
    responses: {
      200: jsonBody(result, 'Job result'),
      401: errorBody('Missing or invalid job token'),
    },
  });
}

const fillOrders = jobRoute('/fill-orders', 'Fill due pending orders', FillOrdersResult);
const pollYields = jobRoute('/poll-yields', 'Fetch the latest close if new', PollYieldsResult);
const payCashflows = jobRoute(
  '/pay-cashflows',
  'Pay due coupons and principal',
  PayCashflowsResult,
);
const backfillYields = jobRoute('/backfill-yields', 'Seed CSV + fetch gap', BackfillResult);

export function jobRoutes() {
  return createRouter()
    .openapi(fillOrders, () => notImplemented('Job fill-orders'))
    .openapi(pollYields, () => notImplemented('Job poll-yields'))
    .openapi(payCashflows, () => notImplemented('Job pay-cashflows'))
    .openapi(backfillYields, () => notImplemented('Job backfill-yields'));
}
