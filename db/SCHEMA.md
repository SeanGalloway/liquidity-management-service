## Database schema

Postgres 18 (`uuidv7()` for time-sortable ids, which also make good cursors). Enums are `text` +
`CHECK` (easier to migrate than native enums). Money `bigint` cents, rates `numeric(8,3)` bps,
calendar dates `date`, instants `timestamptz`. Nothing is deleted in v1, so no cascades.

### Reference & market data
```sql
create table tenors (
  id      smallint primary key,
  code    text not null unique,                 -- '1M','2M','3M','4M','6M','1Y',…,'30Y'
  months  numeric(4,1) not null unique,         -- numeric so a 1.5M point fits if the feed has it
  kind    text not null check (kind in ('bill','note','bond'))
);  -- rows inserted by the migration

create table yields (
  tenor_id     smallint not null references tenors(id),
  observed_at  timestamptz not null,            -- daily feed: as_of_date at 15:30 ET
  as_of_date   date not null,
  yield_bps    numeric(8,3) not null,
  source       text not null,                   -- 'treasury.gov' | future vendor
  fetched_at   timestamptz not null default now(),
  primary key (source, tenor_id, observed_at)   -- makes poll/backfill idempotent (ON CONFLICT DO NOTHING)
);
create index yields_as_of_idx on yields (as_of_date desc, tenor_id);
```

### Cash
```sql
create table balance (
  id            smallint primary key default 1 check (id = 1),   -- single row in v1
  amount_cents  bigint not null check (amount_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table ledger_entries (                   -- append-only; this IS balance history
  id                   uuid primary key default uuidv7(),
  occurred_at          timestamptz not null default now(),
  reason               text not null check (reason in ('deposit','buy','coupon','principal')),
  amount_cents         bigint not null check (amount_cents <> 0),     -- signed
  balance_after_cents  bigint not null check (balance_after_cents >= 0),
  order_id             uuid unique references orders(id),            -- an order debits at most once
  cashflow_id          uuid unique references scheduled_cashflows(id), -- a cashflow pays at most once
  check (
       (reason = 'deposit'                  and order_id is null     and cashflow_id is null     and amount_cents > 0)
    or (reason = 'buy'                      and order_id is not null and cashflow_id is null     and amount_cents < 0)
    or (reason in ('coupon','principal')    and order_id is null     and cashflow_id is not null and amount_cents > 0)
  )
);
create index ledger_occurred_idx on ledger_entries (occurred_at);
-- trigger: reject UPDATE/DELETE on ledger_entries
```

### Trading
```sql
create table orders (
  id                    uuid primary key default uuidv7(),
  idempotency_key       text not null unique,
  request_hash          text not null,          -- same key + different body → 409
  side                  text not null default 'buy' check (side in ('buy')),
  status                text not null default 'pending'
                          check (status in ('pending','executed','rejected','failed')),
  maturity_date         date not null,          -- business-day adjusted
  face_cents            bigint not null check (face_cents >= 10000 and face_cents % 10000 = 0),
  -- quote captured at submit (shown as "estimate" vs. fill)
  quoted_yield_bps      numeric(8,3) not null,
  quoted_total_cents    bigint not null,
  quoted_as_of          timestamptz not null,
  -- simulated delay
  execute_after         timestamptz not null,
  -- fill
  executed_at           timestamptz,
  executed_yield_bps    numeric(8,3),
  executed_total_cents  bigint,
  priced_as_of          timestamptz,
  reject_reason         text,                   -- 'INSUFFICIENT_FUNDS' | 'NO_MARKET_DATA' | …
  failure_message       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((status = 'executed') = (executed_at is not null and executed_yield_bps is not null
                                  and executed_total_cents is not null and priced_as_of is not null)),
  check ((status = 'rejected') = (reject_reason is not null))
);
create index orders_due_idx  on orders (execute_after) where status = 'pending';
create index orders_list_idx on orders (created_at desc, id desc);

create table securities (                       -- what the instrument IS (reference data)
  id               uuid primary key default uuidv7(),
  cusip            text unique,                 -- null for synthetic v1 securities
  kind             text not null check (kind in ('bill','note','bond')),
  issue_date       date not null,               -- v1 synthetic: fill date
  maturity_date    date not null,
  coupon_rate_bps  numeric(8,3),
  synthetic        boolean not null default true,
  created_at       timestamptz not null default now(),
  check ((kind = 'bill') = (coupon_rate_bps is null)),
  check (synthetic or cusip is not null)
);

create table holdings (                         -- our POSITION in a security; one row per lot
  id                  uuid primary key default uuidv7(),
  order_id            uuid not null unique references orders(id),   -- one fill → one lot
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
```

### Ops
```sql
create table job_runs (
  id           uuid primary key default uuidv7(),
  job          text not null,                   -- 'sync-yields' | 'pay-cashflows'
  status       text not null check (status in ('running','succeeded','failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  result       jsonb,
  error        text
);
create index job_runs_job_idx on job_runs (job, started_at desc);
-- only runs that did work or failed are recorded (fill-orders every 10s would otherwise add ~8.6k rows/day)
```

### Mapping from the original entity list
| Original | Now |
|---|---|
| holding.count | `holdings.face_cents` |
| holding.bill_type | `securities.kind` + `maturity_date` + `coupon_rate_bps` via `holdings.security_id` |
| holding.ordered datetime | `orders.created_at` (via `holdings.order_id`) |
| holding.purchase datetime / maturity date | `holdings.purchased_at` / `securities.maturity_date` |
| balance.amount, updatedAt | `balance` + `ledger_entries` for history |
| order.type / count / datetime | `side` / `face_cents` / `created_at` |
| order.holding_id | inverted: `holdings.order_id` (never null, unique) |
| bill type | `tenors` (curve reference points, enum-like) — instrument attributes moved to `securities` |

**Terminology:** *tenor* = time-to-maturity point on the curve only. A *security* (identified by
CUSIP) carries reference data: kind, issue/maturity date, coupon rate. Yield and price are *market
data*, never security attributes. A *holding* is our position in a security.
| yields (datetime, bill_type, yield_bps) | `yields` + `source`, `as_of_date`, `fetched_at` |

### Invariants (enforced by constraints, asserted in tests)
1. `balance.amount_cents` = `sum(ledger_entries.amount_cents)` = latest `balance_after_cents`.
2. Executed order ⇔ exactly one holding and one `buy` ledger entry (unique FKs).
3. Paid cashflow ⇔ exactly one `coupon`/`principal` ledger entry (unique `cashflow_id`).
4. Holding `matured` ⇔ its principal cashflow is `paid` (same transaction in `payDueCashflows`).
5. Cash can never go negative (`CHECK` on both `balance` and `balance_after_cents`) — a last line of
   defense behind the service's funds check.

---