import 'server-only';
import type { Transaction } from 'kysely';
import type { Database } from './client';
import type { DB } from './schema';

export function withTransaction<T>(db: Database, work: (trx: Transaction<DB>) => Promise<T>) {
  return db.transaction().execute(work);
}
