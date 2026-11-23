import 'server-only';
import { sql } from 'kysely';
import type { Database } from './client';

// Session-level lock held on one dedicated connection; `work` runs on other pool connections.
export function withSessionAdvisoryLock<T>(
  db: Database,
  lockName: string,
  work: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  return db.connection().execute(async (connection) => {
    const { rows } = await sql<{ acquired: boolean }>`
      select pg_try_advisory_lock(hashtext(${lockName})) as acquired
    `.execute(connection);

    if (!rows[0]?.acquired) return { acquired: false };

    try {
      return { acquired: true, result: await work() };
    } finally {
      await sql`select pg_advisory_unlock(hashtext(${lockName}))`
        .execute(connection)
        .catch((error) => console.error(`failed to release advisory lock ${lockName}`, error));
    }
  });
}
