import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table ledger_entries alter column occurred_at set default clock_timestamp()`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table ledger_entries alter column occurred_at set default now()`.execute(db);
}
