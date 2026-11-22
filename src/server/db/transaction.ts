import 'server-only';
import { sql, type Transaction } from 'kysely';
import type { Database } from './client';
import type { DB } from './schema';

export function withTransaction<T>(db: Database, work: (trx: Transaction<DB>) => Promise<T>) {
  return db.transaction().execute(work);
}

export async function withAdvisoryLock<T>(
  db: Database,
  lockName: string,
  work: (trx: Transaction<DB>) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  return withTransaction(db, async (trx) => {
    const { rows } = await sql<{ acquired: boolean }>`
      select pg_try_advisory_xact_lock(hashtext(${lockName})) as acquired
    `.execute(trx);

    if (!rows[0]?.acquired) return { acquired: false };

    const result = await work(trx);
    return { acquired: true, result };
  });
}
