import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { LedgerReason } from '../domain/types';
import type { Executor } from './client';
import type { LedgerEntries } from './schema';

export type LedgerEntry = Omit<Selectable<LedgerEntries>, 'reason'> & { reason: LedgerReason };
export type NewLedgerEntry = Insertable<LedgerEntries>;

export type InstantRange = { from?: Date; before?: Date };

export function insertLedgerEntry(entry: NewLedgerEntry, ex: Executor): Promise<LedgerEntry> {
  return ex
    .insertInto('ledgerEntries')
    .values(entry)
    .returningAll()
    .$narrowType<{ reason: LedgerReason }>()
    .executeTakeFirstOrThrow();
}

export function findLedgerEntries(range: InstantRange, ex: Executor): Promise<LedgerEntry[]> {
  let query = ex.selectFrom('ledgerEntries').selectAll().orderBy('occurredAt').orderBy('id');

  if (range.from) query = query.where('occurredAt', '>=', range.from);
  if (range.before) query = query.where('occurredAt', '<', range.before);

  return query.$narrowType<{ reason: LedgerReason }>().execute();
}
