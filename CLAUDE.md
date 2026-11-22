# Liquidity Management Service

Design decisions and scope live in [docs/PLAN.md](docs/PLAN.md). Read it before changing architecture.

## Code conventions

- **Comments:** short and rare. No multi-line wrapping prose comments; let names carry intent.
- **Naming:** descriptive function names with consistent verbs:
  - `find*` — database queries (`findLatestCurve`, `findDueOrders`)
  - `fetch*` — external API calls and their stubs (`fetchParYieldCurve`)
  - `insert*` / `update*` / `mark*` — database writes
  - `calculate*` — pure computation (`calculateBillPrice`)
- **Readability:** separate logical groups of statements with blank lines.
- **Complexity:** cyclomatic complexity ≤ 10 per function. Exception: monetary calculations that
  implement a clearly published algorithm (cite the source in one line).
- **Abstractions:** don't introduce one for a concept with fewer than three instances.
- **No excessive callbacks or configurability.** High-level orchestration reads as a linear
  procedure of named steps:
  ```ts
  const order = await findNextDueOrder(trx);
  const fill = await executeOrder(order);
  const holding = await insertHolding(fill, trx);
  ```

## Architecture rules (summary)

- `handlers → services → { db, pricing, clients }`. `pricing/` is pure.
- Every file in `src/server/` starts with `import 'server-only'`.
- Repository functions take the executor (`db` or `trx`) as the last parameter, defaulting to `db`.
  Services own transactions.
- Money is `bigint` cents in the DB and integer cents in JSON; rates are bps. Use `decimal.js` for math.
