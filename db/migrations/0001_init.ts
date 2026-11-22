import { sql, type Kysely } from 'kysely';

const TENORS = [
  [1, '1M', 1, 'bill'],
  [2, '1.5M', 1.5, 'bill'],
  [3, '2M', 2, 'bill'],
  [4, '3M', 3, 'bill'],
  [5, '4M', 4, 'bill'],
  [6, '6M', 6, 'bill'],
  [7, '1Y', 12, 'bill'],
  [8, '2Y', 24, 'note'],
  [9, '3Y', 36, 'note'],
  [10, '5Y', 60, 'note'],
  [11, '7Y', 84, 'note'],
  [12, '10Y', 120, 'note'],
  [13, '20Y', 240, 'bond'],
  [14, '30Y', 360, 'bond'],
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await createReferenceTables(db);
  await createCashTables(db);
  await createTradingTables(db);
  await createLedgerTable(db);
  await createOpsTables(db);
  await insertTenors(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    drop table if exists job_runs, ledger_entries, scheduled_cashflows, holdings,
      orders, securities, balance, yields, tenors cascade;
    drop function if exists reject_ledger_mutation;
  `.execute(db);
}

async function createReferenceTables(db: Kysely<unknown>) {
  await sql`
    create table tenors (
      id      smallint primary key,
      code    text not null unique,
      months  numeric(4,1) not null unique,
      kind    text not null check (kind in ('bill','note','bond'))
    );

    create table yields (
      tenor_id     smallint not null references tenors(id),
      observed_at  timestamptz not null,
      as_of_date   date not null,
      yield_bps    numeric(8,3) not null,
      source       text not null,
      fetched_at   timestamptz not null default now(),
      primary key (source, tenor_id, observed_at)
    );
    create index yields_as_of_idx on yields (as_of_date desc, tenor_id);

    create table securities (
      id               uuid primary key default uuidv7(),
      cusip            text unique,
      kind             text not null check (kind in ('bill','note','bond')),
      issue_date       date not null,
      maturity_date    date not null,
      coupon_rate_bps  numeric(8,3),
      synthetic        boolean not null default true,
      created_at       timestamptz not null default now(),
      check ((kind = 'bill') = (coupon_rate_bps is null)),
      check (synthetic or cusip is not null)
    );
  `.execute(db);
}

async function createCashTables(db: Kysely<unknown>) {
  await sql`
    create table balance (
      id            smallint primary key default 1 check (id = 1),
      amount_cents  bigint not null check (amount_cents >= 0),
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    );
  `.execute(db);
}

async function createTradingTables(db: Kysely<unknown>) {
  await sql`
    create table orders (
      id                    uuid primary key default uuidv7(),
      idempotency_key       text not null unique,
      request_hash          text not null,
      side                  text not null default 'buy' check (side in ('buy')),
      status                text not null default 'pending'
                              check (status in ('pending','executed','rejected','failed')),
      maturity_date         date not null,
      face_cents            bigint not null check (face_cents >= 10000 and face_cents % 10000 = 0),
      quoted_yield_bps      numeric(8,3) not null,
      quoted_total_cents    bigint not null,
      quoted_as_of          timestamptz not null,
      execute_after         timestamptz not null,
      executed_at           timestamptz,
      executed_yield_bps    numeric(8,3),
      executed_total_cents  bigint,
      priced_as_of          timestamptz,
      reject_reason         text,
      failure_message       text,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now(),
      check ((status = 'executed') = (executed_at is not null and executed_yield_bps is not null
                                      and executed_total_cents is not null and priced_as_of is not null)),
      check ((status = 'rejected') = (reject_reason is not null))
    );
    create index orders_due_idx on orders (execute_after) where status = 'pending';
    create index orders_list_idx on orders (created_at desc, id desc);

    create table holdings (
      id                  uuid primary key default uuidv7(),
      order_id            uuid not null unique references orders(id),
      security_id         uuid not null references securities(id),
      face_cents          bigint not null check (face_cents > 0),
      clean_cost_cents    bigint not null check (clean_cost_cents > 0),
      accrued_paid_cents  bigint not null default 0 check (accrued_paid_cents >= 0),
      purchase_yield_bps  numeric(8,3) not null,
      purchased_at        timestamptz not null,
      status              text not null default 'active' check (status in ('active','matured')),
      matured_at          timestamptz,
      check ((status = 'matured') = (matured_at is not null))
    );
    create index holdings_status_idx on holdings (status);
    create index holdings_security_idx on holdings (security_id);

    create table scheduled_cashflows (
      id            uuid primary key default uuidv7(),
      holding_id    uuid not null references holdings(id),
      pay_date      date not null,
      kind          text not null check (kind in ('coupon','principal')),
      amount_cents  bigint not null check (amount_cents > 0),
      status        text not null default 'scheduled' check (status in ('scheduled','paid')),
      paid_at       timestamptz,
      unique (holding_id, pay_date, kind),
      check ((status = 'paid') = (paid_at is not null))
    );
    create index cashflows_due_idx on scheduled_cashflows (pay_date) where status = 'scheduled';
  `.execute(db);
}

async function createLedgerTable(db: Kysely<unknown>) {
  await sql`
    create table ledger_entries (
      id                   uuid primary key default uuidv7(),
      occurred_at          timestamptz not null default now(),
      reason               text not null check (reason in ('deposit','buy','coupon','principal')),
      amount_cents         bigint not null check (amount_cents <> 0),
      balance_after_cents  bigint not null check (balance_after_cents >= 0),
      order_id             uuid unique references orders(id),
      cashflow_id          uuid unique references scheduled_cashflows(id),
      check (
           (reason = 'deposit' and order_id is null and cashflow_id is null and amount_cents > 0)
        or (reason = 'buy' and order_id is not null and cashflow_id is null and amount_cents < 0)
        or (reason in ('coupon','principal') and order_id is null and cashflow_id is not null
            and amount_cents > 0)
      )
    );
    create index ledger_occurred_idx on ledger_entries (occurred_at);

    create function reject_ledger_mutation() returns trigger language plpgsql as $$
    begin
      raise exception 'ledger_entries is append-only';
    end;
    $$;

    create trigger ledger_entries_append_only
      before update or delete on ledger_entries
      for each row execute function reject_ledger_mutation();
  `.execute(db);
}

async function createOpsTables(db: Kysely<unknown>) {
  await sql`
    create table job_runs (
      id           uuid primary key default uuidv7(),
      job          text not null,
      status       text not null check (status in ('running','succeeded','failed')),
      started_at   timestamptz not null default now(),
      finished_at  timestamptz,
      result       jsonb,
      error        text
    );
    create index job_runs_job_idx on job_runs (job, started_at desc);
  `.execute(db);
}

async function insertTenors(db: Kysely<unknown>) {
  for (const [id, code, months, kind] of TENORS) {
    await sql`insert into tenors (id, code, months, kind) values (${id}, ${code}, ${months}, ${kind})`.execute(
      db,
    );
  }
}
