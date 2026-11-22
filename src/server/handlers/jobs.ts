import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  BackfillResult,
  FillOrdersResult,
  PayCashflowsResult,
  PollYieldsResult,
  SkippedJob,
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
const pollYields = jobRoute('/poll-yields', 'Fetch the latest close if new', PollYieldsResult);
const payCashflows = jobRoute(
  '/pay-cashflows',
  'Pay due coupons and principal',
  PayCashflowsResult,
);
const backfillYields = jobRoute(
  '/backfill-yields',
  'Fetch the last 12 months of closes',
  BackfillResult,
);

export function jobRoutes({ jobRuns, yields }: Container) {
  return createRouter()
    .openapi(fillOrders, () => notImplemented('Job fill-orders'))
    .openapi(pollYields, async (c) => {
      const outcome = await jobRuns.runExclusiveJob(JOBS.pollYields, yields.pollLatestYields);
      return c.json(toJobResponse(outcome), 200);
    })
    .openapi(payCashflows, () => notImplemented('Job pay-cashflows'))
    .openapi(backfillYields, async (c) => {
      const outcome = await jobRuns.runExclusiveJob(JOBS.backfillYields, yields.backfillYields);
      return c.json(toJobResponse(outcome), 200);
    });
}

function toJobResponse<T>(outcome: ExclusiveJobOutcome<T>) {
  return outcome.status === 'skipped' ? { skipped: true as const } : outcome.result;
}
