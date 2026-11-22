import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  FillOrdersResult,
  PayCashflowsResult,
  SkippedJob,
  SyncYieldsResult,
} from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';
import { JOBS, type ExclusiveJobOutcome } from '../services/job-runs';

function jobRoute<T extends z.ZodType>(path: string, summary: string, response: T) {
  return createRoute({
    method: 'post',
    path,
    tags: ['Jobs'],
    summary,
    security: [{ jobToken: [] }],
    responses: {
      200: jsonBody(response, 'Job result'),
      401: errorBody('Missing or invalid job token'),
    },
  });
}

const fillOrders = jobRoute(
  '/fill-orders',
  'Fill due pending orders (safe to run concurrently)',
  FillOrdersResult,
);
const syncYields = jobRoute(
  '/sync-yields',
  'Fetch closes missing since the latest stored one (12 months when empty), or skip if running',
  z.union([SyncYieldsResult, SkippedJob]),
);
const payCashflows = jobRoute(
  '/pay-cashflows',
  'Pay due coupons and principal, or skip if running',
  z.union([PayCashflowsResult, SkippedJob]),
);

export function jobRoutes({ jobRuns, yields, orders, cashflows }: Container) {
  return createRouter()
    .openapi(fillOrders, async (c) => {
      return c.json(await orders.fillDueOrders(), 200);
    })
    .openapi(syncYields, async (c) => {
      const outcome = await jobRuns.runExclusiveJob(JOBS.syncYields, yields.syncYields);
      return c.json(toJobResponse(outcome), 200);
    })
    .openapi(payCashflows, async (c) => {
      const outcome = await jobRuns.runExclusiveJob(JOBS.payCashflows, cashflows.payDueCashflows);
      return c.json(toJobResponse(outcome), 200);
    });
}

function toJobResponse<T>(outcome: ExclusiveJobOutcome<T>) {
  return outcome.status === 'skipped' ? { skipped: true as const } : outcome.result;
}
