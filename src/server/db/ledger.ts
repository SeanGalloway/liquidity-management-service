import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { Executor } from './client';
import type { LedgerEntries } from './schema';

export type LedgerEntry = Selectable<LedgerEntries>;
export type NewLedgerEntry = Insertable<LedgerEntries>;

export function insertLedgerEntry(entry: NewLedgerEntry, ex: Executor): Promise<LedgerEntry> {
  return ex.insertInto('ledgerEntries').values(entry).returningAll().executeTakeFirstOrThrow();
}
