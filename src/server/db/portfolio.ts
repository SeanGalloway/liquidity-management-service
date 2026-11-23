import 'server-only';
import { sql } from 'kysely';
import type { Executor } from './client';

// TRUNCATE skips the ledger's row-level append-only trigger; only the guarded reset may call this.
export async function deletePortfolio(ex: Executor): Promise<void> {
  await sql`
    truncate table ledger_entries, scheduled_cashflows, holdings, securities, orders, balance
  `.execute(ex);
}
