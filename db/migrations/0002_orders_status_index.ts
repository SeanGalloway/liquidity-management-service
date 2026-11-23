import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists orders_list_idx;
    create index orders_status_id_idx on orders (status, id desc);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop index if exists orders_status_id_idx;
    create index orders_list_idx on orders (created_at desc, id desc);
  `.execute(db);
}
