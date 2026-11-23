# Liquidity Management Service

A prototype Treasury desk for a single institution. It pulls the U.S. Treasury par yield curve and
lets you buy Treasuries by maturity date and face amount. It tracks holdings, orders, cash and
projected cashflows until maturity.

## Getting started

Requires Node 22, pnpm 11 and Docker.

**Local dev**

```bash
cp .env.example .env
pnpm install
pnpm db:up && pnpm db:migrate
pnpm dev      # app + API on :3000
pnpm worker   # second terminal: job scheduler
```

**Full stack in containers** (Postgres → migrate → app → worker)

```bash
docker compose --profile full up --build
```

**Links**

- App: <http://localhost:3000>. The first visit opens setup (starting balance and yield backfill).
- Swagger UI: <http://localhost:3000/api/v1/docs>
- OpenAPI spec: <http://localhost:3000/api/v1/openapi.json>
- Health: <http://localhost:3000/api/v1/health>

**Demo tools**

- `ENABLE_SIMULATION=true` (the default in `.env.example`) shows an orange **Simulation** panel and enables `POST /api/v1/setup/reset`.
- The reset erases the balance, holdings, orders and ledger. Stored yields are kept.
- It `TRUNCATE`s the append-only ledger, so keep the flag off anywhere real. Compose defaults it to `false`.

**Checks**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## Architecture

```
browser ──► Next.js (UI + /api/v1 Hono) ──► Postgres
worker  ──► POST /api/v1/jobs/*  (bearer JOB_TOKEN; never touches the DB)
```

### Frontend

- Next.js 16 App Router, React 19 and Tailwind 4 with shadcn/ui primitives
- TanStack Query for server state; a typed Hono RPC client (`hc<ApiRoutes>`)
- Tabs:
  - **Portfolio:** KPIs, holdings, orders, cash timeline
  - **Research:** yield curve and tenor history
- The order ticket sits in a side rail.

### Backend

- Hono with `@hono/zod-openapi`, mounted at `/api/v1`. The zod contracts in `src/shared/` are shared with the client.
- Layers: `handlers → services → { db, pricing, clients }`
  - `services/` own the transactions and are built with lightweight DI in `container.ts`.
  - `db/` holds Kysely repositories, one query per function.
  - `pricing/` is pure:
    - Bills use the investment-rate formula.
    - Notes and bonds are synthetic par coupons priced with the street-convention formula and act/act accrued interest.
    - Yields are interpolated linearly between tenors.
  - `clients/` holds the treasury.gov par yield CSV client.
- All cash moves go through `postLedgerEntry`. It locks the balance row and appends to the ledger, which is append-only (enforced by a trigger).
- Orders require an `Idempotency-Key` header and are filled asynchronously at the latest stored close.

### Database

- Postgres 18 with `uuidv7()` ids, which also serve as paging cursors.
- Money is stored as `bigint` cents and rates as `numeric` bps.
- Migrations are Kysely files in `db/migrations`; `pnpm db:codegen` regenerates `src/server/db/schema.ts`.

<details>
<summary>Schema</summary>

```
tenors               id, code ('1M'…'30Y'), months, kind (bill|note|bond)
yields               (source, tenor_id, observed_at) pk, as_of_date, yield_bps
balance              id = 1, amount_cents ≥ 0
ledger_entries       id, occurred_at, reason (deposit|buy|coupon|principal), amount_cents,
                     balance_after_cents, order_id?, cashflow_id?          -- append-only
orders               id, idempotency_key, status (pending|executed|rejected|failed),
                     maturity_date, face_cents, quoted_*, execute_after, executed_*
securities           id, cusip?, kind, issue_date, maturity_date, coupon_rate_bps?, synthetic
holdings             id, order_id, security_id, face_cents, clean_cost_cents,
                     accrued_paid_cents, purchase_yield_bps, status (active|matured)
scheduled_cashflows  id, holding_id, pay_date, kind (coupon|principal), amount_cents,
                     status (scheduled|paid)
job_runs             id, job, status (running|succeeded|failed), started_at, result, error
```

Full DDL and invariants are in [db/SCHEMA.md](db/SCHEMA.md).

</details>

### Worker

- Plain Node timers in `worker/schedule.ts`. Each job is an authenticated `POST` to the app.
- Every job also runs once at startup.

| Job                   | Every | Does                                                                    |
| --------------------- | ----- | ----------------------------------------------------------------------- |
| `/jobs/fill-orders`   | 10 s  | Fills due pending orders, one transaction each (`skip locked`)          |
| `/jobs/sync-yields`   | 15 m  | Fetches the treasury.gov par curve and upserts changes. Exclusive.      |
| `/jobs/pay-cashflows` | 24 h  | Pays due coupons and principal, then marks matured holdings. Exclusive. |

## Scope decisions

- Single user and a single cash balance. No auth.
- Buy orders only. Holdings are held to maturity.
- Securities are synthetic: bills under one year; notes and bonds as par coupons at the interpolated yield.
- Yields are the daily treasury.gov par curve. Orders fill at the latest stored close, not live prices.
- Execution is a simulated in-process engine with a delay of 2 s or more. There is no broker connection.
- Funds are checked at fill time, not reserved when the order is placed.
- Use API polling rather than SSE for live data

## Future enhancements

- **Auth:** users, multiple accounts and roles. Login flows, session management/validation middleware. `users` and `institutions` tables, with queries predicated by institution id and user access.
- **Sell orders:** Based on market pricing. Most useful after real passage of time.
- **Real broker clients:** swap the `execute-order.ts` engine for a broker or FIX adapter, with real CUSIPs
- **Real-time yield data:** an intraday vendor feed behind the existing `YieldsClient` interface
- **Deposit/Withdrawal prediction model** based on historical depositor behavior. Informs portfolio decisions and minimum cash needed on a particular day.
- **Integration tests, CI**

