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
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';
import { JOBS, type ExclusiveJobOutcome } from '../services/job-runs';

function jobRoute<T extends z.ZodType>(path: string, summary: string, result: T) {
  return createRoute({
    method: 'post',
    path,
    tags: ['Jobs'],
    summary,
    security: [{ jobToken: [] }],
    responses: {
      200: jsonBody(z.union([result, SkippedJob]), 'Job result, or skipped if already running'),
      401: errorBody('Missing or invalid job token'),
    },
  });
}

const fillOrders = jobRoute('/fill-orders', 'Fill due pending orders', FillOrdersResult);
const syncYields = jobRoute(
  '/sync-yields',
  'Fetch closes missing since the latest stored one (12 months when empty)',
  SyncYieldsResult,
);
const payCashflows = jobRoute(
  '/pay-cashflows',
  'Pay due coupons and principal',
  PayCashflowsResult,
);

export function jobRoutes({ jobRuns, yields }: Container) {
  return createRouter()
    .openapi(fillOrders, () => notImplemented('Job fill-orders'))
    .openapi(syncYields, async (c) => {
      const outcome = await jobRuns.runExclusiveJob(JOBS.syncYields, yields.syncYields);
      return c.json(toJobResponse(outcome), 200);
    })
    .openapi(payCashflows, () => notImplemented('Job pay-cashflows'));
}

function toJobResponse<T>(outcome: ExclusiveJobOutcome<T>) {
  return outcome.status === 'skipped' ? { skipped: true as const } : outcome.result;
}
