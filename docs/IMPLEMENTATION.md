# Implementation plan — API verticals

UI is out of scope here; it is built afterwards on the finished API. Each vertical lands
db → service → handler → tests and ends with its endpoints live in Swagger.

| # | Vertical | Endpoints | Jobs |
|---|---|---|---|
| 1 | Setup & market data | `GET/POST /setup`, `/tenors`, `/yields/curve`, `/yields/history` | `backfill-yields`, `poll-yields` |
| 2 | Quotes | `GET /quote` | — |
| 3 | Orders & fills | `POST/GET /orders`, `GET /orders/{id}` | `fill-orders` |
| 4 | Portfolio reads | `/balance`, `/balance/history`, `/holdings`, `/holdings/{id}` | — |
| 5 | Cashflows & timeline | `/cashflows`, `/timeline` | `pay-cashflows` |

## Conventions used below

- **Repository functions** (`src/server/db/*`): one query each, executor last (`ex = db` or `trx`),
  returning an entity (`Selectable<Table>`) or a named composite entity reused in several places.
- **Entities** are exported from the repository file that owns the table, e.g.
  `export type Order = Selectable<Orders>`.
- **Service verbs:** `get*` reads one thing and throws `NOT_FOUND` / `NO_MARKET_DATA` when absent;
  `list*` reads collections; other verbs name the business action (`submitOrder`, `payDueCashflows`).
- **Service factories** receive `{ db, clock, …otherServices }`; `clock.now()` / `clock.today()`
  are the only time sources.
- **DTO mapping** (entity → contract) happens in handlers, via small `to*Dto` functions next to them.

---

## Vertical 1 — Setup & market data

**Done when:** `POST /setup` creates the desk and backfills ~12 months of real curves; `/yields/curve`
returns the latest close; the worker's `poll-yields` picks up new closes; all visible in Swagger.

### Step 0 — Confirm the Treasury feed
- Fetch one month of the daily par yield curve CSV from Treasury.gov; record the exact URL pattern,
  header names (`1 Mo`, `1.5 Month`, `2 Mo`, …, `30 Yr`), date format, and blank-cell behavior.
- Save a trimmed sample as `test/fixtures/treasury-par-curve.csv`.

### `clients/yields-client.ts`
- `type CurvePoint = { tenorCode, asOfDate, observedAt, yieldBps: string, source: 'treasury.gov' }`
- `interface YieldsClient { fetchParYieldCurve(range: DateRange): Promise<CurvePoint[]> }`

### `clients/treasury-gov-client.ts`
- `createTreasuryGovClient({ baseUrl })` → `YieldsClient`
- `fetchParYieldCurve(range)`
  - for each year touched by `range`: `fetchParYieldCsv(year)`
  - `parseParYieldCsv(text)` each, flatten, keep points inside `range`
- `fetchParYieldCsv(year)` — one GET; returns raw CSV text
- `parseParYieldCsv(text)` → `CurvePoint[]`
  - map headers to tenor codes; skip blank cells
  - percent → bps (`4.02` → `"402"`), date → `asOfDate`, `observedAt` = 15:30 America/New_York

### `db/tenors.ts`
- `findTenors(ex)` → `Tenor[]` — all tenors ordered by `months`

### `db/yields.ts`
- `insertYieldObservations(rows, ex)` → `number` inserted — one multi-row insert,
  `on conflict do nothing` (tenor code resolved via `tenor_id` subselect)
- `findYieldCoverage(ex)` → `YieldCoverage { earliest, latest, rows }` — `min/max/count`;
  used by health, setup status, backfill and poll (replaces `findLatestYieldDate`)
- `findCurveObservations(onOrBefore: IsoDate, ex)` → `CurveObservation[]` — all tenors' rows for
  the latest `as_of_date <= onOrBefore`, joined to `tenors` (`YieldObservation & { tenorCode, months, kind }`)
- `findYieldHistory(tenorCodes, range, ex)` → `CurveObservation[]` — ordered by tenor, date

### `db/job-runs.ts`
- `insertJobRun(job, ex)` → `JobRun` (status `running`)
- `markJobRunFinished(id, { status, result, error }, ex)` → `JobRun`
- `findLatestJobRun(job, ex)` → `JobRun | undefined`

### `db/balance.ts`
- `findBalance(ex)` → `Balance | undefined`
- `insertBalance(ex)` → `Balance` — inserts the single row with `amount_cents = 0`;
  unique violation means already initialized

### `db/ledger.ts`
- `insertLedgerEntry(entry, ex)` → `LedgerEntry`

### `db/transaction.ts` (change)
- `withAdvisoryLock(db, name, work)` switches to a **session** lock on a dedicated connection
  (`pg_try_advisory_lock` … `pg_advisory_unlock` in `finally`), so long jobs don't hold a
  transaction open and their `job_runs` row is visible while running.

### `services/job-runs.ts` — `createJobRunsService({ db })`
- `runExclusiveJob(job, work)` → `{ status: 'skipped' } | { status: 'succeeded', result }`
  - acquire advisory lock named `job`; if taken → `skipped`
  - `insertJobRun(job)`
  - `result = await work()`
  - `markJobRunFinished(succeeded, result)`; on throw `markJobRunFinished(failed, message)` and rethrow
- `getJobStatus(job)` → `'idle' | 'running' | 'done' | 'failed'` from `findLatestJobRun`

### `services/balance.ts` — `createBalanceService({ db })` (first function; grows in V3/V4)
- `postLedgerEntry(trx, { reason, amountCents, orderId?, cashflowId? })` → `LedgerEntry`
  — the one atomic cash movement, reused by deposit, buy fill, coupon and principal payment
  - `findBalanceForUpdate(trx)` (row lock)
  - `next = balance + amount`; below zero → throw `INSUFFICIENT_FUNDS`
  - `insertLedgerEntry({ …, balanceAfterCents: next }, trx)`
  - `updateBalanceAmount(next, trx)`
- adds to `db/balance.ts`: `findBalanceForUpdate(trx)` → `Balance`, `updateBalanceAmount(amountCents, trx)` → `Balance`

### `services/yields.ts` — `createYieldsService({ db, yieldsClient, clock })`
- `backfillYields()` → `BackfillResult`
  - `points = yieldsClient.fetchParYieldCurve(last 12 months)`
  - `inserted = insertYieldObservations(points)`
  - `coverage = findYieldCoverage()` → `{ fetched, inserted, earliest, latest }`
- `pollLatestYields()` → `PollYieldsResult`
  - `coverage = findYieldCoverage()`
  - `range = { from: coverage.latest + 1 day ?? today − 12 months, to: today }`; nothing to do if `from > today`
  - `points = yieldsClient.fetchParYieldCurve(range)`; `insertYieldObservations(points)`
  - `findYieldCoverage()` → `{ fetched, inserted, latestAsOf }`
- `getCurve(date | 'latest')` → `Curve { asOfDate, observedAt, source, points: { tenor, yieldBps: Decimal }[] }`
  - `findCurveObservations(date ?? today)`; none → `NO_MARKET_DATA`
- `listYieldHistory(tenorCodes, range)` → series per tenor
  - `findTenors()` to reject unknown codes (`VALIDATION_FAILED`)
  - `findYieldHistory(codes, range)` → group by tenor
- `listTenors()` → `findTenors()`

### `services/setup.ts` — `createSetupService({ db, balance, yields, jobRuns })`
- `getSetupStatus()` → `SetupStatus`
  - `findBalance()`, `findYieldCoverage()`, `jobRuns.getJobStatus('backfill-yields')`
- `initializeDesk(startingBalanceCents)` → `SetupStatus`
  - transaction: `insertBalance(trx)` (conflict → `ALREADY_INITIALIZED`), `balance.postLedgerEntry(trx, deposit)`
  - start `jobRuns.runExclusiveJob('backfill-yields', yields.backfillYields)` without awaiting; log failures
  - `getSetupStatus()`

### Middleware
- `middleware/require-setup.ts`: `findBalance()`; missing → `NOT_INITIALIZED`. Mounted on cash,
  holdings and order routes (added as those verticals land).

### Handlers
- `setup.ts`: GET → `getSetupStatus`; POST → `initializeDesk` → `202`
- `market-data.ts`: `/tenors`, `/yields/curve`, `/yields/history`
- `jobs.ts`: `backfill-yields`, `poll-yields` → `runExclusiveJob(...)`; `skipped` returns `200 { skipped: true }`
- `health.ts`: switch to `findYieldCoverage`

### Tests
- `parseParYieldCsv` against the fixture (headers, blanks, bps conversion, 15:30 ET instant)
- repository SQL shape for each `db/*` function (recording db)
- `yields`, `setup`, `job-runs` services with stub clients and a **scripted** recording db
  (extend `createRecordingDb` to return queued result rows per query)

---

## Vertical 2 — Quotes

**Done when:** `GET /quote` returns correct bill and coupon quotes for any maturity, verified against
Treasury's published pricing examples.

### `pricing/holidays.ts`
- `US_BOND_MARKET_HOLIDAYS: ReadonlySet<IsoDate>` — 2025–2056, generated once by a throwaway
  script from SIFMA rules and committed as a literal list

### `pricing/calendar.ts`
- `isBusinessDay(date)`
- `rollForwardToBusinessDay(date)`
- `addMonths(date, months)` — end-of-month aware
- `calculateDaysBetween(start, end)`

### `pricing/interpolate.ts`
- `interpolateYield(curve, settleDate, maturityDate)` → `{ yieldBps: Decimal, interpolatedFrom: [code, code] }`
  - months to maturity; find bracketing tenors; linear; flat beyond 1M / 30Y

### `pricing/schedule.ts`
- `calculateCouponSchedule(settleDate, maturityDate)` → `{ previousCouponDate, couponDates[] }`
  - step back 6 months from maturity until on/before settle; payment dates rolled to business days

### `pricing/bill.ts`
- `calculateBillPrice(faceCents, yieldBps, days)` → `{ pricePer100, totalCents }`
  - Treasury investment-rate formula: simple for ≤ 182 days, quadratic form beyond (published
    in Treasury's "Formulas for Calculating Pricing" — cited in one line)

### `pricing/coupon.ts`
- `calculateCouponPrice({ faceCents, couponRateBps, yieldBps, schedule, settleDate })`
  → `{ pricePer100, cleanCents, accruedCents }`
  - standard street-convention price with fractional first period; accrued act/act
  - complexity exception applies (published algorithm)

### `pricing/quote.ts`
- `calculateQuote(spec, curve, faceCents, settleDate)` → `Quote`
  - `interpolateYield`; bill → `calculateBillPrice`; else `calculateCouponSchedule` → `calculateCouponPrice`
  - cashflows: coupons (`face × rate / 2`) + principal; `interestToMaturity = Σ cashflows − total`

### `services/security-resolver.ts` — `createSecurityResolver()`
- `resolveSecurity(maturityDate, curve, today)` → `SecuritySpec`
  - roll maturity to a business day; reject ≤ today + 1 business day or > 30 years (`VALIDATION_FAILED`)
  - ≤ 1y → bill; ≤ 10y → note; else bond; coupon = interpolated yield (par)
  - `issueDate = today`, `synthetic = true`, `cusip = null`

### `services/quotes.ts` — `createQuotesService({ yields, securityResolver, clock })`
New file: the one pricing path shared by `GET /quote`, `submitOrder` and `executeOrder`.
- `quoteOrder(maturityDate, faceCents)` → `{ quote, security: SecuritySpec }`
  - `curve = yields.getCurve('latest')`
  - `settleDate = today` (T+0 simplification)
  - `security = resolveSecurity(maturityDate, curve, today)`
  - `quote = calculateQuote(security, curve, faceCents, settleDate)`

### Handlers
- `orders.ts`: `GET /quote` → `quoteOrder`

### Tests
- calendar: holidays, weekend roll, month-end `addMonths`
- interpolation: exact tenor, between tenors, extrapolation
- bill: Treasury's published ≤182-day and >182-day examples to the cent
- coupon: published note example; accrued on a short first period
- quote: bill vs. note branch, cashflow schedule, interest-to-maturity

---

## Vertical 3 — Orders & fills

**Done when:** a submitted order goes `pending → executed` via the worker, creating a security,
holding, cashflow schedule, ledger debit and balance change atomically; rejections and idempotent
replays behave per contract.

### `db/orders.ts`
- `insertOrder(newOrder, ex)` → `Order | undefined` — `on conflict (idempotency_key) do nothing returning *`
- `findOrderByIdempotencyKey(key, ex)` → `Order | undefined`
- `findOrder(id, ex)` → `Order | undefined`
- `findOrders({ status, cursor, limit }, ex)` → `Order[]` — keyset on `(created_at, id)`, fetches `limit + 1`
- `findNextDueOrderForUpdate(now, trx)` → `Order | undefined` — `pending`, `execute_after <= now`,
  `for update skip locked limit 1`
- `markOrderExecuted(id, fill, trx)` → `Order`
- `markOrderRejected(id, reason, trx)` → `Order`
- `markOrderFailed(id, message, ex)` → `Order | undefined` — only while still `pending`
- `findPendingOrderTotals(ex)` → `{ count, faceCents }` (used in V4 balance)

### `db/securities.ts`
- `insertSecurity(spec, trx)` → `Security`

### `db/holdings.ts`
- `insertHolding(newHolding, trx)` → `Holding`

### `db/cashflows.ts`
- `insertScheduledCashflows(rows, trx)` → `ScheduledCashflow[]` — one multi-row insert

### `services/execute-order.ts` — `createExecuteOrder({ quotes, clock })`
- `executeOrder(order)` → `{ status: 'filled', executedAt, quote, security } | { status: 'rejected', reason }`
  - `quotes.quoteOrder(order.maturityDate, order.faceCents)`
  - `NO_MARKET_DATA` → rejected `NO_MARKET_DATA`; maturity now too close → rejected `MATURITY_TOO_SOON`
  - later: delegate to `clients/broker-client.ts`

### `services/orders.ts` — `createOrdersService({ db, quotes, executeOrder, balance, clock })`
- `submitOrder(idempotencyKey, request)` → `{ order, replayed }`
  - `requestHash = sha256(canonical request)`
  - `existing = findOrderByIdempotencyKey(key)` → hash mismatch `IDEMPOTENCY_CONFLICT`, else replay
  - `{ quote } = quotes.quoteOrder(...)`
  - `order = insertOrder({ …request, quote fields, executeAfter: now + 2–5 s })`
  - lost a race on the key → re-read and compare as above
- `getOrder(id)` → `Order` (`NOT_FOUND`)
- `listOrders(query)` → `{ orders, nextCursor }`
- `fillDueOrders(limit = 20)` → `FillOrdersResult` — calls `fillNextDueOrder` until `none` or limit; tallies
- `fillNextDueOrder()` → `'none' | 'executed' | 'rejected' | 'failed'`
  - transaction:
    - `order = findNextDueOrderForUpdate(now)`; none → `none`
    - `result = executeOrder(order)`; rejected → `markOrderRejected` → `rejected`
    - `balance.postLedgerEntry(trx, buy −total)`; `INSUFFICIENT_FUNDS` → `markOrderRejected` → `rejected`
    - `security = insertSecurity(result.security)`
    - `holding = insertHolding({ orderId, securityId, … })`
    - `insertScheduledCashflows(result.quote.cashflows for holding)`
    - `markOrderExecuted(order.id, fill)` → `executed`
  - unexpected error → transaction rolled back → `markOrderFailed(order.id, message)` → `failed`

### Handlers / jobs
- `orders.ts`: `POST /orders` (`202`, or `200` on replay), `GET /orders`, `GET /orders/{id}`
- `jobs.ts`: `fill-orders` → `fillDueOrders()` directly. Not wrapped in `runExclusiveJob` and not
  recorded in `job_runs`: `SKIP LOCKED` already makes concurrent runs safe, and a 10 s cadence
  would flood the table.

### Tests
- `submitOrder`: new, replay, conflicting replay, key race
- `fillNextDueOrder`: executed path (all writes in order), insufficient funds, venue rejection, failure rollback
- repository SQL shape, including `for update skip locked` and keyset pagination

---

## Vertical 4 — Portfolio reads

**Done when:** balance, ledger history and holdings (with security and interest to maturity) are served.

### `db/ledger.ts`
- `findLedgerEntries(range, ex)` → `LedgerEntry[]` — ordered by `occurred_at`

### `db/holdings.ts`
- `findHoldingsWithSecurity(status, ex)` → `HoldingWithSecurity[]`
  - `HoldingWithSecurity = Holding & { security: Security; cashflowTotalCents }` — one join + lateral sum;
    reused by list, detail and V5
- `findHoldingWithSecurity(id, ex)` → `HoldingWithSecurity | undefined`

### `db/cashflows.ts`
- `findCashflowsForHolding(holdingId, ex)` → `ScheduledCashflow[]`

### `services/balance.ts` (additions)
- `getBalance()` → `{ balance, pendingOrders }`
  - `findBalance()`, `findPendingOrderTotals()`
- `listBalanceHistory(range)` → `findLedgerEntries(range)`

### `services/holdings.ts` — `createHoldingsService({ db })`
- `listHoldings(status)` → `findHoldingsWithSecurity(status)`
- `getHolding(id)` → `{ holding, cashflows }`
  - `findHoldingWithSecurity(id)` (`NOT_FOUND`), `findCashflowsForHolding(id)`

### Handlers
- `balance.ts`: `/balance`, `/balance/history`; `holdings.ts`: list + detail. Interest to maturity
  (`cashflowTotalCents − cleanCost − accruedPaid`) computed in the DTO mapper.

### Tests
- DTO mappers (interest, nullable coupon), service `NOT_FOUND`, repository SQL shape

---

## Vertical 5 — Cashflows & timeline

**Done when:** due coupons and principal are paid exactly once into the ledger, matured holdings
close, and `/timeline` returns actual + projected series.

### `db/cashflows.ts` (additions)
- `findCashflows({ status, range }, ex)` → `ScheduledCashflow[]`
- `findNextDueCashflowForUpdate(today, trx)` → `ScheduledCashflow | undefined` — `scheduled`,
  `pay_date <= today`, `for update skip locked limit 1`
- `markCashflowPaid(id, paidAt, trx)` → `ScheduledCashflow`

### `db/holdings.ts` (addition)
- `markHoldingMatured(id, maturedAt, trx)` → `Holding`

### `services/cashflows.ts` — `createCashflowsService({ db, balance, clock })`
- `payDueCashflows()` → `PayCashflowsResult` — calls `payNextDueCashflow` until none; tallies
- `payNextDueCashflow()` → `ScheduledCashflow | undefined`
  - transaction:
    - `cashflow = findNextDueCashflowForUpdate(today)`; none → `undefined`
    - `balance.postLedgerEntry(trx, { reason: cashflow.kind, amountCents, cashflowId })`
    - `markCashflowPaid(cashflow.id, now)`
    - principal → `markHoldingMatured(cashflow.holdingId, now)`
- `listCashflows(query)` → `findCashflows(query)`

### `services/timeline.ts` — `createTimelineService({ db, clock })`
- `getTimeline(to?)` → `Timeline`
  - `entries = findLedgerEntries(all)`
  - `balance = findBalance()`
  - `scheduled = findCashflows({ status: 'scheduled' })`
  - `horizon = to ?? last principal date`
  - `actual = calculateDailyBalances(entries)`
  - `projected = calculateProjection(balance, scheduled, horizon)`
  - `events = scheduled within horizon`
- `calculateDailyBalances(entries)` — last `balanceAfterCents` per date (pure)
- `calculateProjection(balance, cashflows, horizon)` — running sum by pay date (pure)

### Handlers / jobs
- `balance.ts`: `/cashflows`, `/timeline`
- `jobs.ts`: `pay-cashflows` → `runExclusiveJob('pay-cashflows', payDueCashflows)`

### Tests
- `payNextDueCashflow`: coupon, principal + maturity, nothing due
- projection and daily-balance helpers
- repository SQL shape

---

## Changes to earlier decisions (supersede PLAN.md where they differ)

1. `fill-orders` runs without an advisory lock and without `job_runs` rows; the other three jobs
   always record a run.
2. Advisory locks are session-level on a dedicated connection, not transaction-scoped.
3. New `services/quotes.ts` — the single pricing path for quote, submit and fill.
4. `services/balance.ts#postLedgerEntry` is the only way cash moves (4 callers). The balance row
   starts at 0 and the setup deposit is a normal ledger entry.
5. ~~Seed CSV~~ — removed: a year of closes is one request, so backfill is fully live.
6. Settlement is trade date (T+0); T+1 stays in Future work.
7. Service unit tests use a scripted recording db (queued result rows) instead of module mocks.
8. `findLatestYieldDate` is replaced by `findYieldCoverage`.
9. The Treasury client fetches **per year** (`/daily-treasury-rates.csv/{year}/all`), not per month:
   a full backfill is two requests. `fetchParYieldCsv(baseUrl, year)` replaces the monthly variant.
10. **One URL prefix per handler module**, mounted in a flat table in `routes.ts`. Handlers are
    `health`, `setup`, `balance`, `cashflows`, `timeline`, `holdings`, `quotes`, `orders`,
    `tenors`, `yields`, `jobs`; route paths inside each are relative (`/`, `/history`, `/{id}`).
11. Repository functions take the executor as a **required** last parameter (no module-level `db`
    exists to default to; the container owns it).
12. Holidays are **computed from Federal Reserve (Fedwire) rules** (`calculateFederalReserveHolidays(year)`,
    cached per year) instead of a committed 30-year literal list: ~40 lines, testable, no expiry.
    Sunday holidays move to Monday; Saturday holidays are not observed.
13. Only **bills** roll their maturity to a business day. Notes and bonds keep their nominal maturity
    so coupon dates stay on schedule (e.g. month-end); only *payment* dates roll forward.
14. Settlement is `rollForwardToBusinessDay(today)`, so weekend quotes settle Monday.
15. `quoteOrder` returns one `Quote` that carries its `SecuritySpec`; no separate `{ quote, security }`.
    No `pricing/day-count.ts`: act/act accrual is one line inside `coupon.ts`.
16. `syncYields` skips the Treasury request when no business day has passed since the latest
    stored close.
17. Order reads return the composite `OrderWithHolding` (`Order & { holdingId }`, one left join),
    reused by `findOrder`, `findOrderByIdempotencyKey` and `findOrders`, because the order→holding
    link lives on `holdings.order_id`. Writes return plain `Order`.
18. `findPendingOrderTotals` moves to Vertical 4, its only consumer.
19. `require-setup` is mounted in `app.ts` on `/balance/*`, `/cashflows/*`, `/timeline/*`,
    `/holdings/*` and `/orders/*` (Hono's `/x/*` also matches the bare `/x`). `/quote` stays open.
20. `executeOrder` maps `NO_MARKET_DATA` → rejection `NO_MARKET_DATA` and a maturity that became
    invalid while pending → `MATURITY_NO_LONGER_VALID`; any other error propagates so the fill
    transaction rolls back and the order is marked `failed`.
21. `HoldingWithSecurity` is a **flat** composite (`Holding & SecurityTerms & { cashflowTotalCents }`):
    one join plus a scalar subquery, no JSON nesting in SQL. The handler nests `security` for the contract.
22. `createBalanceService` now takes `{ db }` (reads added). History ranges are New York calendar days,
    inclusive of `to`, converted to instants in the service.
23. `toCashflowDto` lives in `handlers/cashflows.ts` and is reused by the holding detail.

## Changes from PR review (Vertical 1)

- Backfill and poll merged into one `syncYields` job (`POST /jobs/sync-yields`, lock `sync-yields`):
  fetches from 12 months ago when empty, otherwise re-fetches from the latest stored close (so a
  same-day correction is picked up) through today. Setup triggers it; the worker runs it on start
  and every 15 minutes. `SyncYieldsResult = { fetched, stored, earliest, latest }`.
- Yields are **upserted** (`do update … where yield_bps is distinct from excluded.yield_bps`).
- `POST /setup` reports `backfill: 'running'` (the sync has been started but not yet recorded).
- A job that takes its lock first marks leftover `running` rows for that job as `failed`
  (`markStaleJobRunsFailed`), so a crash can't leave setup status spinning forever.
- `withSessionAdvisoryLock` moved to `db/advisory-lock.ts`; cleanup failures are logged and never
  replace the job's original error; stored job errors include the stack.
- CSV parser: empty body → no data; every known tenor header must be present; non-numeric cells skipped.
- `postLedgerEntry(movement, trx)` — executor last, like repositories. Balance lock/update target `id = 1`.
- Tenor `kind` narrowed in the repository (`SecurityKind`), no cast in the handler.
- History: tenor list trimmed, must be non-empty; `from > to` rejected.
- Round 2: parser requires `Date` plus at least one known tenor and rejects only unknown
  *tenor-like* headers (older years lack `1.5 Month`); bad date rows fail with the row named;
  Treasury requests time out after 30 s; health goes through `yields.getCoverage()`; job run
  status is narrowed in the repository. Declined: a `source` filter on curve queries (single
  source today — add with the second vendor) and renaming setup's `backfill` field (UI contract).

## Changes from PR review (Vertical 2)

- Clean cents are computed from the **published six-decimal price** (Treasury convention), so
  price × face always equals the amount charged.
- Bill vs. note is decided on the requested (nominal) maturity; a bill's maturity rolls forward to a
  business day, or back if rolling forward would cross one year.
- `calculateQuote` branches on `security.kind`; coupon pricing reads the rate from the security and
  throws if a coupon security has none or no coupon dates remain.
- Declined: T+1 settlement (T+0 is the agreed simplification; T+1 in Future work, now pinned by a
  weekday test); reusing the resolver's yield in the quote (a real off-par security's yield ≠ coupon);
  dating synthetic notes at settlement (seasoned-security model is intentional).
- Round 2 declined: a separate SIFMA bond-market calendar (Good Friday) — recorded in Future work.
- Round 3: coupon pricer's citation corrected — it is SIFMA street convention (secondary market),
  not Treasury's auction formula (App. B, simple-interest first period); accrued per 100 rounded to six
  decimals before cents, like the clean price; `Quote.settleDate` exposed.

## Changes from PR review (Vertical 3)

- Order paging keys on the time-ordered `uuidv7` id alone (`id < cursor`, `order by id desc`); the
  cursor is the last order id. The old `(created_at, id)` cursor lost microseconds through JS `Date`.
  Migration `0002` adds `(status, id desc)` and drops the unused `(created_at, id)` index.
- Funds are checked against the order's quoted total **before** the execution engine is called, so a
  real broker is never asked to buy what the ledger can't pay for; the debit check remains a backstop.
- The engine returns only fill facts (`Fill`: security, yield, clean/accrued/total cents, times); the
  orders service derives the cashflow schedule with the pure `calculateCashflows`.
- Failing to mark an order `failed` is logged and no longer aborts the batch.
- `fill-orders` no longer advertises a `skipped` response; order status is narrowed in the repository.
- Declined: moving the engine call outside the DB transaction (claim → execute → settle with
  reconciliation) — that is the real-broker flow already in Future work; mixed app/DB timestamps.
- Round 2: a fill whose failure can't be recorded stops the batch (`stalled`) instead of being
  re-claimed; fill test asserts ledger/holding/cashflow values; backstop debit rejection tested;
  `OrderStatus` derived from the contract enum. Declined: tolerance on the quoted-total pre-check
  (intentionally conservative), un-exporting `fillNextDueOrder` (test seam), CUSIP find-or-insert
  (Future work).
- Round 3: the funds pre-check reads the balance without locking (the debit's locked read decides),
  so concurrent fills don't serialize on the balance row during execution; a failure that another
  worker already settled counts as `skipped`, not `failed`; a stalled batch still counts its claim.

## Changes from PR review (Vertical 4)

- `pendingOrders` adds `quotedTotalCents` (cash the pending orders are expected to take) beside
  `faceCents`; balance and pending totals are read in one `repeatable read` snapshot.
- Ledger history rejects `from > to`; paging is Future work (no default window, so existing callers
  still get the full ledger).
- `kind`/`status`/`reason` are narrowed in the holdings, ledger and cashflow repositories (no DTO
  casts); the cashflow-total subquery uses the typed builder; `SecurityTerms` inlined.
- Round 2: shared `rejectInvertedRange` in `domain/dates` (yields + balance, and cashflows next);
  narrowing types declared once and reused for entity + `$narrowType`; `SecurityKind` and the
  ledger reason derived from the contract; 400s documented on history and holdings list.
- Round 3: `toNewYorkInstant` resolves the UTC offset at the target wall-clock time (midnight on
  DST changeover days was off by an hour); the recording db records isolation levels; holdings sort
  ends on `id`; `GET /balance` mapping tested.
