import 'server-only';
import { sql, type Transaction } from 'kysely';
import type { Database } from './client';
import type { DB } from './schema';

export function withTransaction<T>(db: Database, work: (trx: Transaction<DB>) => Promise<T>) {
  return db.transaction().execute(work);
}

export function withAdvisoryLock<T>(
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
      await sql`select pg_advisory_unlock(hashtext(${lockName}))`.execute(connection);
    }
  });
}
