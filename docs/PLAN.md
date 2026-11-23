# Liquidity Management Service — Plan

Prototype: a full-stack app that pulls Treasury yields, plots the curve, lets a single
institution buy Treasuries on the secondary market, and shows holdings, order history and
balance history. Goal is a robust, readable foundation — not a complete production app.

Status of planning steps:

- [x] Product / requirement questions
- [x] Tech / implementation questions
- [x] Mockups + design language — direction A "Ledger" ([canvas](https://claude.ai/artifact/FCm1p472XDHg1xmZADRK1g))
- [x] API shape
- [x] Module organization
- [x] Database schema review
- [x] Yield data source
- [x] Polling / job mechanism

---

> Build sequencing and later refinements: see [IMPLEMENTATION.md](IMPLEMENTATION.md) (wins on conflict).

## Product decisions

### Scope
- **Single user, single institution.** No auth in v1; designed so auth can be added as Hono
  middleware. Multi-user / multi-institution expansion described in README.
- **Buy-only, held to maturity.** All trades are secondary-market buys. Selling before
  maturity is later scope.
- **Order input = maturity date + face amount.** $100 minimum, $100 increments (face value).
  Market orders only; a slippage guard is later scope.
- **Instruments:** maturity ≤ 1y → bill (zero-coupon, discount). > 1y → note (≤ 10y) or
  bond (> 10y), modeled as a *synthetic par security*: coupon rate = interpolated par yield,
  clean price = 100, semi-annual coupons scheduled backward from maturity, accrued interest
  paid on short first period. Real CUSIP resolution is later scope (`security-resolver` stub).
- **Pricing simplification (explicit):** yield = curve yield at *remaining* maturity, regardless of
  a security's original term or coupon (differences are a few bps: liquidity premium, coupon
  effect, par-vs-spot curve). Cashflow *timing* does depend on coupon, so the synthetic par
  security is the neutral choice: realistic coupon dates, idealized coupon amounts. README states this.
- **Pricing source:** the latest *stored* closing par curve in `yields`. No API call at execution.
  Orders placed after hours / weekends fill immediately at the last close, labeled
  "priced as of <date> close".
- **Order lifecycle:** `pending → executed | rejected | failed`. Simulated 2–5s execution
  delay. Insufficient funds → `rejected` (checked at execution; no reservation at submit).
- **Maturity & coupons:** every holding gets a `scheduled_cashflows` schedule at fill time.
  A daily job (also run on worker startup, idempotent) pays all due cashflows into the ledger.
- **Startup wizard:** if no balance exists, `/setup` collects a starting balance and runs the
  yield backfill with progress, then lands on the dashboard.
- **Descoped:** sells, future-obligation cashflow tool (separate tool later), auctions,
  intraday data, slippage guard.

### UX
Two tabs, brokerage-style:
- **Portfolio** — balance, holdings (lots), order history, and a timeline: past cash balance
  (from ledger) + future maturities/coupons (from scheduled cashflows), with a slider out to
  the last maturity showing projected cash steps.
- **Research** — full par yield curve (1M–30Y) with history. Clicking a point on the curve
  opens the order form with that maturity prefilled.
- Order form shows a live estimate (clean price, accrued, total cost, yield, coupon schedule)
  from the latest close.

### Design language — "Ledger"
- Light, institutional, dense. Inter with tabular numerals; one blue accent (`#1E4FD8`),
  neutral grays, semantic green/amber/red only for status and deltas. 8px radii, 1px borders.
- Portfolio layout: KPI strip → cash timeline (actual solid, projected dashed, maturity markers,
  "Today" line, upcoming-cashflow chips, horizon slider) → **one card with Holdings / Orders
  tabs** (pending indicator on the Orders tab). Order ticket is a persistent right rail
  (stacks on mobile); it is the *only* order entry point — no duplicate header CTA.
- Ticket: maturity date + tenor shortcut chips, face amount, plain-language summary
  ("Pay about X today, receive Y on Z"), then the breakdown, then **Place order**.
- Research: spread KPIs, full curve with compare-to (1W/1M/6M), bills/notes/bonds bands,
  click a point (or a table row's Buy) to prefill the ticket's maturity.

---

## Tech decisions

| Area | Decision |
|---|---|
| Framework | Next.js (App Router) + TypeScript strict, pnpm |
| API | Hono app mounted in one catch-all route `app/api/[[...route]]/route.ts`; zod validation; handlers thin → services → repositories |
| DB | Postgres via docker-compose; Kysely + kysely-codegen; Kysely migrations |
| Repositories | Single-purpose query functions accepting an optional transaction (`db \| trx`) |
| Money / rates | `bigint` cents; `numeric` bps; `decimal.js` for pricing math |
| Ledger | Append-only `ledger_entries` (= balance history) + single `balance` row, updated in the same tx with `SELECT … FOR UPDATE` |
| Orders | `POST /orders` with `Idempotency-Key` → inserts `pending`, returns `202`. Fill happens later via job |
| Jobs | Exposed as HTTP endpoints on the main service (`POST /api/jobs/*`), protected by a shared job token. **The worker never touches the DB** — it is only a scheduler that calls those endpoints |
| Interpolation | Linear across tenors (v1); bill + coupon pricers behind one `quote()` interface |
| Calendar | Hardcoded US bond-market holiday list for business-day rolling |
| Frontend data | TanStack Query: 60s refetch; 1s while an order is pending |
| UI | Tailwind + shadcn/ui; Recharts |
| Tests | Vitest. Repository unit tests use compile-only Kysely (fake recording driver) asserting SQL; services tested with stubbed repos. Integration tests vs. docker Postgres — **later**, not in initial build |

### Yield data
- Source: Treasury.gov daily par yield curve (free, no key, published ~3:30–6pm ET).
- `yields-client.ts` exposes `fetchCurve(range) → CurvePoint[]` with `observedAt` + `source`,
  so a paid intraday vendor can be swapped in later without schema changes.
- Backfill fetches the last 12 months live (one request per calendar year, ~2 requests) and
  inserts with `ON CONFLICT DO NOTHING`; polling fetches only the gap after the latest stored date.
  No seed CSV is shipped (removed: a year is one request, so it only helped offline demos).

### Jobs (scheduler → HTTP)
| Endpoint | Schedule | Notes |
|---|---|---|
| `POST /api/jobs/fill-orders` | every 10s | Claims due pending orders (`execute_after <= now()`) with `FOR UPDATE SKIP LOCKED`, bounded batch |
| `POST /api/jobs/sync-yields` | on start + every 15m (+ after setup) | Fetches missing closes (12 months when empty); upserts |
| `POST /api/jobs/pay-cashflows` | on startup + daily | Pays due scheduled cashflows; idempotent |

- Simulated delay is a timestamp (`execute_after = created_at + 2–5s`), not a `sleep` in the
  request, so no transaction or request is held open. Fill latency ≈ delay + up to one tick.
- Each job takes a Postgres advisory lock (`pg_try_advisory_lock`) so overlapping triggers no-op.
- Scheduler waits for `/api/health`, never overlaps calls to the same job, and logs results.
  Shape matches Vercel Cron / Cloud Scheduler, so it can be replaced without code changes.

---

## API shape

Hono app at `/api/v1`. JSON only.

**Conventions**
- Money: integer **cents** (`faceCents`, `amountCents`) — safe as JSON numbers up to ~$90T.
  Rates: **bps** as numbers (may be fractional, e.g. `383.2`). Dates: `YYYY-MM-DD`; timestamps: ISO-8601 UTC.
- Errors: `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [...] } }`.
  Codes: `VALIDATION_FAILED` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `IDEMPOTENCY_CONFLICT` 409,
  `ALREADY_INITIALIZED` 409, `NOT_INITIALIZED` 409, `NO_MARKET_DATA` 503.
- Lists: `{ "data": [...], "nextCursor": "..." | null }`; cursor = opaque `(created_at, id)`.
- Middleware order: requestId → logger → error mapper → *(auth, later)* → setup guard → zod validator.

### Setup
| Method | Path | Purpose |
|---|---|---|
| GET | `/setup` | `{ initialized, yields: { earliest, latest, rows, backfill: "idle"\|"running"\|"done"\|"failed" } }` — wizard polls this |
| POST | `/setup` | `{ startingBalanceCents }` → `202`. One tx: balance row + `deposit` ledger entry. Then kicks off yield backfill. `409 ALREADY_INITIALIZED` if a balance exists |

All endpoints below except `/yields*`, `/tenors`, `/health` return `409 NOT_INITIALIZED` before setup.

### Balance & timeline
| Method | Path | Purpose |
|---|---|---|
| GET | `/balance` | `{ amountCents, updatedAt, pendingOrders: { count, faceCents } }` |
| GET | `/balance/history?from&to` | Ledger entries: `{ id, occurredAt, amountCents (signed), balanceAfterCents, reason: deposit\|buy\|coupon\|principal, ref: { type, id } }` |
| GET | `/cashflows?status=scheduled\|paid&from&to` | Scheduled/paid cashflows: `{ id, holdingId, date, kind: coupon\|principal, amountCents, status, paidAt }` |
| GET | `/timeline?to=YYYY-MM-DD` | Server-computed chart series: `{ today, lastMaturity, actual: [{ date, balanceCents }], projected: [{ date, balanceCents }], events: [{ date, kind, holdingId, amountCents }] }`. Projection = current balance + scheduled cashflows, no new orders |

### Holdings
| Method | Path | Purpose |
|---|---|---|
| GET | `/holdings?status=active\|matured\|all` | Lots, soonest maturity first |
| GET | `/holdings/:id` | Lot + its cashflow schedule + originating order id |

Holding: `{ id, kind: bill\|note\|bond, maturityDate, faceCents, couponRateBps|null, cleanCostCents, accruedPaidCents, totalCostCents, purchaseYieldBps, purchasedAt, status, orderId, interestToMaturityCents }`

### Quotes & orders
| Method | Path | Purpose |
|---|---|---|
| GET | `/quote?maturityDate&faceCents` | Side-effect-free estimate from latest stored close. Powers the ticket |
| POST | `/orders` | Header `Idempotency-Key` (required). Body `{ maturityDate, faceCents }` → `202 { order }` with `status: "pending"` |
| GET | `/orders?status&cursor&limit` | Newest first |
| GET | `/orders/:id` | Ticket polls this (1s) while pending |

Quote: `{ kind, maturityDate (business-day adjusted), days, yieldBps, interpolatedFrom: ["3M","4M"], couponRateBps|null, pricePer100, cleanPriceCents, accruedCents, totalCents, interestToMaturityCents, cashflows: [...], pricedAsOf, source }`

Order: `{ id, side: "buy", status: pending\|executed\|rejected\|failed, maturityDate, faceCents, quote: {yieldBps, totalCents, pricedAsOf} , fill: null | { executedAt, yieldBps, totalCents, pricedAsOf, holdingId }, rejectReason|null, createdAt }`

Validation (`400`): `faceCents ≥ 10000` and multiple of `10000`; `maturityDate` > today + 1 business day and ≤ 30y out.
Rejections are async (`status: rejected`, e.g. `INSUFFICIENT_FUNDS`) — the POST itself still returns `202`.
Same `Idempotency-Key` + same body → original order (`200`); different body → `409`.

### Market data
| Method | Path | Purpose |
|---|---|---|
| GET | `/tenors` | Reference tenors `{ code, months, kind }` |
| GET | `/yields/curve?date=latest\|YYYY-MM-DD` | `{ asOf, source, points: [{ tenor, yieldBps }] }` — nearest prior business day if date has no row |
| GET | `/yields/history?tenors=3M,10Y&from&to` | `{ series: [{ tenor, points: [{ date, yieldBps }] }] }` |

### Ops
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ ok, db, latestYieldAsOf }` — scheduler waits on this |
| POST | `/jobs/fill-orders` | Job token. `{ claimed, executed, rejected, failed }` |
| POST | `/jobs/sync-yields` | Job token. `{ fetched, stored, earliest, latest }` |
| POST | `/jobs/pay-cashflows` | Job token. `{ paid, totalCents }` |

---

## Module organization

```
liquidity-management-service/
├── README.md                          setup, design decisions, future work
├── docs/PLAN.md
├── package.json · pnpm-lock.yaml · .nvmrc
├── tsconfig.json                      strict; paths: @server/*, @client/*, @shared/*
├── next.config.ts
├── vitest.config.ts                   aliases `server-only` → test/stubs/empty.ts
├── eslint.config.mjs · prettier.config.mjs · postcss.config.mjs
├── components.json                    shadcn config
├── .env.example                       DATABASE_URL, JOB_TOKEN, APP_URL, TREASURY_BASE_URL
├── docker-compose.yml                 postgres · app · worker
├── Dockerfile                         multi-stage: `app` and `worker` targets
│
├── app/                               Next.js App Router — pages + the single API mount
│   ├── layout.tsx
│   ├── providers.tsx                  'use client' — QueryClientProvider
│   ├── globals.css                    Tailwind + Ledger theme tokens
│   ├── page.tsx                       redirect → /portfolio, or /setup if not initialized
│   ├── setup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                 header + section tabs + order-ticket rail
│   │   ├── portfolio/page.tsx
│   │   └── research/page.tsx
│   └── api/[[...route]]/route.ts      export const GET = handle(app), POST = handle(app)
│
├── src/
│   ├── server/                        every file: import 'server-only'
│   │   ├── app.ts                     Hono app: middleware stack + mount routes
│   │   ├── routes.ts                  route table only
│   │   ├── container.ts               composition root (lightweight DI)
│   │   ├── config.ts                  env parsed with zod
│   │   ├── middleware/
│   │   │   ├── request-id.ts
│   │   │   ├── error-handler.ts       DomainError → { error } + status
│   │   │   ├── require-setup.ts
│   │   │   └── require-job-token.ts   (auth.ts slots in here later)
│   │   ├── handlers/                  validate → call service → map to DTO
│   │   │   ├── setup.ts               /setup
│   │   │   ├── balance.ts             /balance, /balance/history, /cashflows, /timeline
│   │   │   ├── holdings.ts            /holdings
│   │   │   ├── orders.ts              /quote, /orders
│   │   │   ├── market-data.ts         /tenors, /yields/curve, /yields/history
│   │   │   ├── jobs.ts                /jobs/*
│   │   │   └── health.ts              /health
│   │   ├── services/                  business logic + transaction boundaries
│   │   │   ├── setup.ts
│   │   │   ├── balance.ts             balance + ledger history reads
│   │   │   ├── timeline.ts            actual + projected series
│   │   │   ├── holdings.ts
│   │   │   ├── orders.ts              quote, submit (idempotent), fillDueOrders
│   │   │   ├── security-resolver.ts   maturity + curve → SecuritySpec (v1 synthetic; later real CUSIP lookup)
│   │   │   ├── execute-order.ts       execution engine (simulated fill; later → broker-client)
│   │   │   ├── cashflows.ts           payDueCashflows
│   │   │   ├── yields.ts              latest curve, history, poll, backfill
│   │   │   └── job-runs.ts            run a job under an advisory lock + record the run
│   │   ├── pricing/                   pure — no I/O, no clock
│   │   │   ├── holidays.ts            hardcoded US bond-market holidays
│   │   │   ├── calendar.ts            business days, rolling, add months
│   │   │   ├── day-count.ts           act/365, act/act for accrued
│   │   │   ├── interpolate.ts         linear across tenors
│   │   │   ├── bill.ts                zero-coupon pricing
│   │   │   ├── coupon.ts              general: any coupon schedule + yield → clean price, accrued
│   │   │   │                          (par is the special case coupon = yield)
│   │   │   ├── schedule.ts            semi-annual coupon dates backward from maturity
│   │   │   └── quote.ts               SecuritySpec + curve + face → Quote (bill | coupon)
│   │   ├── clients/                   external boundaries, each behind an interface
│   │   │   ├── yields-client.ts       interface YieldsClient + CurvePoint
│   │   │   └── treasury-gov-client.ts
│   │   ├── db/                        repositories: single-purpose, optional executor
│   │   │   ├── client.ts              Kysely + pg Pool; Executor type
│   │   │   ├── transaction.ts         withTransaction · withAdvisoryLock
│   │   │   ├── schema.ts              generated (kysely-codegen)
│   │   │   ├── tenors.ts
│   │   │   ├── yields.ts
│   │   │   ├── balance.ts
│   │   │   ├── ledger.ts
│   │   │   ├── orders.ts
│   │   │   ├── securities.ts
│   │   │   ├── holdings.ts
│   │   │   ├── cashflows.ts
│   │   │   └── job-runs.ts
│   │   └── domain/
│   │       ├── types.ts               Cents, Bps, Quote, Fill, … (branded)
│   │       ├── errors.ts              DomainError + codes
│   │       └── money.ts               decimal.js helpers + rounding rules
│   │
│   ├── shared/
│   │   └── contracts.ts               zod request/response schemas (server + browser)
│   │
│   └── client/                        browser-only
│       ├── api.ts                     typed client (hono/client)
│       ├── queries.ts                 TanStack query keys + hooks, polling intervals
│       ├── lib/format.ts              cents / bps / dates
│       └── components/
│           ├── ui/                    shadcn: button, input, tabs, slider, badge, table, tooltip, card
│           ├── layout/
│           │   ├── app-header.tsx
│           │   ├── section-tabs.tsx   Portfolio | Research
│           │   └── rates-stamp.tsx    "Rates as of … close · Treasury.gov"
│           ├── portfolio/
│           │   ├── kpi-strip.tsx
│           │   ├── cash-timeline.tsx
│           │   ├── cashflow-chips.tsx
│           │   ├── horizon-slider.tsx
│           │   ├── positions-card.tsx Holdings | Orders tabs
│           │   ├── holdings-table.tsx
│           │   ├── orders-table.tsx
│           │   └── status-badge.tsx
│           ├── research/
│           │   ├── spread-kpis.tsx
│           │   ├── yield-curve-chart.tsx  click point → prefill ticket
│           │   ├── curve-compare.tsx      1W / 1M / 6M
│           │   └── tenor-table.tsx
│           ├── ticket/
│           │   ├── ticket-context.tsx     prefill state shared with Research
│           │   ├── order-ticket.tsx
│           │   ├── maturity-field.tsx     date input + tenor chips
│           │   ├── amount-field.tsx
│           │   └── quote-summary.tsx
│           └── setup/
│               ├── setup-wizard.tsx
│               └── backfill-progress.tsx
│
├── worker/                            scheduler only — no DB, no src/server imports
│   ├── index.ts                       wait for /health, start loops, graceful shutdown
│   └── schedule.ts                    [{ path, every, runOnStart }]
│
├── db/
│   ├── migrate.ts                     Kysely Migrator (up / down / latest)
│   └── migrations/
│       └── 0001_init.ts               all tables + tenor reference rows
│
└── test/
    ├── stubs/empty.ts                 `server-only` alias target
    ├── helpers/
    │   ├── recording-db.ts            compile-only Kysely that records SQL + params
    │   └── fake-clock.ts
    └── fixtures/
        ├── treasury-response.xml      captured feed sample for client parsing tests
        └── curves.ts                  known curves for pricing tests
```

Unit tests sit next to their source as `*.test.ts` (e.g. `pricing/bill.test.ts`,
`services/orders.test.ts`, `db/ledger.test.ts`, `handlers/orders.test.ts` via `app.request()`).
Priority coverage: `pricing/*`, `services/{orders,execute-order,cashflows,timeline}`, `db/*` SQL
shape, `clients/treasury-gov-client` parsing. `test/integration/` comes later.

### Dependency rules
`handlers → services → { db, pricing, clients }`. `pricing` imports nothing with I/O.
`db` never imports services. Frontend imports only `shared/` and `client/` — it always goes
through the HTTP API, never calls services from Server Components, so the API stays the single
boundary.

Isolation is enforced, not just conventional:
- Every module under `src/server/` starts with `import 'server-only'`, so any accidental import
  from a Client Component fails the Next build. `src/client/` modules that must stay client-side
  use `import 'client-only'`.
- Vitest aliases `server-only` to an empty module (the real package throws outside the
  `react-server` resolve condition).
- Secrets live only in `src/server/config.ts`; no `NEXT_PUBLIC_*` variables except the API base URL.
- Later: eslint `import/no-restricted-paths` for the layer rules above.

### Repository pattern
Single-purpose functions; the executor is the last param and defaults to the pool:
```ts
export function insertLedgerEntry(entry: NewLedgerEntry, ex: Executor = db) {
  return ex.insertInto('ledger_entries').values(entry).returningAll().executeTakeFirstOrThrow();
}
```
Atomicity is the *service's* job: it opens `withTransaction` and passes `trx` to every call.

### Services as factories
Lightweight DI, no framework: `createOrdersService({ db, executeOrder, yields, clock })`, built
once in `container.ts`. `createExecuteOrder({ yields, clock })` is likewise a service factory;
giving it a `broker` dependency later is the swap point. Replacing the Treasury client is a
one-line change in `container.ts`, and unit tests pass stubs directly instead of module-mocking.
`clock` makes "today" testable.

### Security resolution & pricing
The one place the "not real securities" simplification lives:
```ts
// services/security-resolver.ts
resolve(maturityDate, curve, today): SecuritySpec
  // v1 synthetic:
  //   remaining ≤ 1y → { kind: 'bill', couponRateBps: null }
  //   > 1y          → { kind: note|bond, couponRateBps: interpolatedYield }   // par by construction
  //   maturity rolled to business day; issueDate = today; synthetic: true
  // later: nearest real CUSIP from Treasury securities data → synthetic: false

// pricing/quote.ts
quote(spec, curve, faceCents, settleDate): Quote
  // yield     = interpolate(curve, maturity)            (remaining-maturity assumption)
  // bill      → price = face / (1 + y·days/365)
  // coupon    → schedule(spec) → coupon.price(cashflows, y, settleDate) → clean + accrued
```
Used by both `GET /quote` (estimate) and `execute-order.ts` (fill), so estimate and fill share one
code path and differ only if the stored close changed in between. `pricing/coupon.ts` is general
(any coupon vs. yield), so real off-par securities need no pricing rewrite.

### Fill flow (`orders.fillDueOrders`) — one transaction per order
```
loop up to N:
  withTransaction(trx =>
    order   = orders.claimNextDue(trx)            -- FOR UPDATE SKIP LOCKED, execute_after <= now
    if none → stop
    result  = executeOrder(order)                 -- latest stored close → resolver → pricing.quote → Fill
    if rejection → orders.markRejected(order, reason, trx); return
    balance = balance.getForUpdate(trx)           -- row lock
    if balance < fill.total → orders.markRejected(INSUFFICIENT_FUNDS, trx); return
    security = securities.insert(fill.security, trx)   -- synthetic row; later: find-or-insert by CUSIP
    holding  = holdings.insert({ securityId, … }, trx)
    cashflows.insertMany(schedule, trx)
    ledger.insert({ -total, balanceAfter }, trx)
    balance.update(…, trx)
    orders.markExecuted(order, fill, holding.id, trx))
  on throw → tx rolled back (order still pending) → orders.markFailed(order.id, err) in its own write
```
One bad order can't roll back others. With a *real* broker, execution can't be rolled back, so
the flow becomes "reserve funds → send → record fill" with an outbox/reconciliation step (see
Future work). The v1 engine is synchronous and deterministic, so calling it inside the tx is safe.

---

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

## Future work / v2 hardening (→ README)

Collected as we go; the README gets this list.

**Product scope**
- Auth (Hono middleware slot already exists), then multi-user and multi-institution:
  `institution_id` on balance/ledger/holdings/orders, per-user roles (trader vs. viewer, maker/checker approvals).
- Sells / early liquidation at market; realized vs. unrealized P&L.
- Real securities: resolve a requested maturity to an actual CUSIP (coupon, dated date, price ≠ par)
  inside `security-resolver.ts`; also snap maturities to real patterns (notes 15th/month-end, bills
  weekly) and price off a bootstrapped zero (spot) curve instead of a single par yield.
  via Treasury's securities data.
- Auction participation (non-competitive bids, pending until issue date).
- Limit orders and a slippage guard ("reject if yield moved > X bps since quote").
- Optional "wait for next close" pricing for after-hours orders instead of filling at the last close.
- Future-obligations cashflow tool: planned outflows, minimum-cash threshold, reinvestment what-ifs.
- Realistic settlement (T+1) and dealer minimums larger than $100.

**Market data**
- Paid intraday vendor behind `YieldsClient` (schema already stores `observed_at` + `source`).
- Monotone cubic interpolation; a proper business-day calendar library instead of the hardcoded list.
- SIFMA bond-market calendar (Good Friday, early/Friday closes) for trade/settle dates and sync
  freshness; the Fed calendar stays for coupon and maturity payment dates.

**Execution & reliability**
- Real broker client called from `execute-order.ts`: reserve funds → send → record fill, with an
  outbox and reconciliation against broker statements.
- Real job queue (e.g. pg-boss, SQS) instead of DB polling; retries with backoff for `failed` orders.
- Server-sent events / websockets instead of client polling.
- Reconciliation job asserting `sum(ledger) = balance` and alerting on drift.

**Engineering**
- Integration tests against docker Postgres (row locks, rollback, ledger invariant, idempotency).
- eslint layer-boundary rules; OpenAPI spec generated from the zod contracts.
- Structured logging, metrics and tracing; job-run dashboards.
