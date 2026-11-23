# Liquidity Management Service

A prototype Treasury desk for a single institution. It pulls the U.S. Treasury par yield curve,
plots it, lets you buy Treasuries on the secondary market by maturity date and face amount,
and tracks holdings, orders and cash over time.

Design decisions, API shape, schema and future work: [docs/PLAN.md](docs/PLAN.md).

## Quick start

Requires Node 22, pnpm and Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

In a second terminal, start the job scheduler:

```bash
pnpm worker
```

API health check: <http://localhost:3000/api/v1/health>

## Scripts

| Script                               | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`       | Next.js app (UI + `/api/v1`)                                    |
| `pnpm worker`                        | Scheduler that triggers `/api/v1/jobs/*` — never touches the DB |
| `pnpm db:up`                         | Start Postgres 18 via docker-compose                            |
| `pnpm db:migrate` / `db:rollback`    | Kysely migrations                                               |
| `pnpm db:codegen`                    | Regenerate `src/server/db/schema.ts` from the live DB           |
| `pnpm test`                          | Unit tests (Vitest, no DB required)                             |
| `pnpm typecheck` / `lint` / `format` | Static checks                                                   |

Run the full stack in containers with `docker compose --profile full up --build`.

### Demo tools

`ENABLE_SIMULATION=true` (set in `.env.example`) shows an orange **Simulation** panel on Portfolio
and enables `POST /api/v1/setup/reset`, which erases the balance, holdings, orders and ledger
(stored yields are kept) and returns the desk to setup. The reset `TRUNCATE`s the append-only
ledger, so keep the flag off anywhere real.

## Status

Scaffold only: database schema, API skeleton (`/health`, token-protected `/jobs/*` returning
`501`), worker scheduler and placeholder pages. Pricing, orders, yields and UI come next.
