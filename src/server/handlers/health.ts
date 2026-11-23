import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Health } from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, jsonBody } from '../openapi';

const getHealth = createRoute({
  method: 'get',
  path: '/',
  tags: ['Ops'],
  summary: 'Liveness, database connectivity and latest stored yield date',
  responses: { 200: jsonBody(Health, 'Service is healthy') },
});

export function healthRoutes({ yields }: Container) {
  return createRouter().openapi(getHealth, async (c) => {
    const coverage = await yields.getCoverage();
    return c.json({ ok: true, db: 'up' as const, latestYieldAsOf: coverage.latest }, 200);
  });
}
