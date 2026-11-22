import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { sql } from 'kysely';
import { Health } from '@shared/contracts';
import type { Container } from '../container';
import { findLatestYieldDate } from '../db/yields';
import { createRouter, jsonBody } from '../openapi';

const getHealth = createRoute({
  method: 'get',
  path: '/',
  tags: ['Ops'],
  summary: 'Liveness, database connectivity and latest stored yield date',
  responses: { 200: jsonBody(Health, 'Service is healthy') },
});

export function healthRoutes({ db }: Container) {
  return createRouter().openapi(getHealth, async (c) => {
    await sql`select 1`.execute(db);
    const latestYieldAsOf = await findLatestYieldDate(db);

    return c.json({ ok: true, db: 'up' as const, latestYieldAsOf }, 200);
  });
}
