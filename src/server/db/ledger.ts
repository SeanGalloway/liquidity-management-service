import 'server-only';
import { sql, type Insertable, type Selectable } from 'kysely';
import type { IsoDate, LedgerReason } from '../domain/types';
import type { Executor } from './client';
import type { LedgerEntries } from './schema';

export type LedgerEntry = Omit<Selectable<LedgerEntries>, 'reason'> & { reason: LedgerReason };
export type NewLedgerEntry = Insertable<LedgerEntries>;

export type InstantRange = { from?: Date; before?: Date };

export type DailyBalance = { date: IsoDate; balanceCents: number };

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

export async function findDailyClosingBalances(ex: Executor): Promise<DailyBalance[]> {
  const { rows } = await sql<DailyBalance>`
    select distinct on (day) day as "date", balance_after_cents as "balanceCents"
    from (
      select (occurred_at at time zone 'America/New_York')::date as day, occurred_at, id,
        balance_after_cents
      from ledger_entries
    ) entries
    order by day, occurred_at desc, id desc
  `.execute(ex);

  return rows;
}
