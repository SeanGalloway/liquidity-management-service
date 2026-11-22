import 'server-only';
import { Hono } from 'hono';
import { sql } from 'kysely';
import type { Container } from '../container';
import { findLatestYieldDate } from '../db/yields';

export function healthRoutes({ db }: Container) {
  return new Hono().get('/', async (c) => {
    await sql`select 1`.execute(db);
    const latestYieldAsOf = await findLatestYieldDate(db);

    return c.json({ ok: true, db: 'up', latestYieldAsOf });
  });
}
