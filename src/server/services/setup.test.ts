import { describe, expect, it, vi } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createBalanceService } from './balance';
import type { JobRunsService } from './job-runs';
import { createSetupService } from './setup';
import type { YieldsService } from './yields';

function createJobRunsStub() {
  return {
    runExclusiveJob: vi.fn(async () => ({ status: 'skipped' as const })),
    getJobStatus: vi.fn(async () => 'idle' as const),
  } satisfies JobRunsService;
}

const yields = { syncYields: vi.fn() } as unknown as YieldsService;

describe('setup service', () => {
  it('creates the balance and the deposit in one transaction, then reports the started sync', async () => {
    const jobRuns = createJobRunsStub();
    const { db, sql } = createRecordingDb([
      [{ id: 1, amountCents: 0 }],
      [{ id: 1, amountCents: 0 }],
      [{ id: 'entry-1' }],
      [{ id: 1, amountCents: 15_000_000_00 }],
      [{ id: 1, amountCents: 15_000_000_00 }],
      [{ earliest: null, latest: null, rows: 0 }],
    ]);

    const setup = createSetupService({
      db,
      resetEnabled: false,
      balance: createBalanceService({ db }),
      yields,
      jobRuns,
    });
    const status = await setup.initializeDesk(15_000_000_00);

    expect(sql().slice(0, 6)).toEqual([
      'begin',
      'insert into "balance" ("amount_cents") values ($1) on conflict ("id") do nothing returning *',
      'select * from "balance" where "id" = $1 for update',
      'insert into "ledger_entries" ("reason", "amount_cents", "balance_after_cents") values ($1, $2, $3) returning *',
      'update "balance" set "amount_cents" = $1, "updated_at" = now() where "id" = $2 returning *',
      'commit',
    ]);
    expect(jobRuns.runExclusiveJob).toHaveBeenCalledWith('sync-yields', yields.syncYields);
    expect(status).toEqual({
      initialized: true,
      resetEnabled: false,
      yields: { earliest: null, latest: null, rows: 0, backfill: 'running' },
    });
  });

  it('refuses to initialize twice', async () => {
    const jobRuns = createJobRunsStub();
    const { db, sql } = createRecordingDb([[]]);

    const setup = createSetupService({
      db,
      resetEnabled: false,
      balance: createBalanceService({ db }),
      yields,
      jobRuns,
    });

    await expect(setup.initializeDesk(100_00)).rejects.toMatchObject({
      code: 'ALREADY_INITIALIZED',
    });
    expect(sql()).toEqual([
      'begin',
      'insert into "balance" ("amount_cents") values ($1) on conflict ("id") do nothing returning *',
      'rollback',
    ]);
    expect(jobRuns.runExclusiveJob).not.toHaveBeenCalled();
  });

  it('erases the portfolio in one statement and reports the desk uninitialized', async () => {
    const { db, sql } = createRecordingDb([
      [],
      [],
      [{ earliest: '2025-11-24', latest: '2026-11-20', rows: 3486 }],
    ]);
    const setup = createSetupService({
      db,
      resetEnabled: true,
      balance: createBalanceService({ db }),
      yields,
      jobRuns: createJobRunsStub(),
    });

    const status = await setup.resetPortfolio();

    expect(sql()[0]?.replace(/\s+/g, ' ').trim()).toBe(
      'truncate table ledger_entries, scheduled_cashflows, holdings, securities, orders, balance',
    );
    expect(status.initialized).toBe(false);
    expect(status.yields.rows).toBe(3486);
  });

  it('refuses to reset when simulation is disabled, without touching the database', async () => {
    const { db, queries } = createRecordingDb();
    const setup = createSetupService({
      db,
      resetEnabled: false,
      balance: createBalanceService({ db }),
      yields,
      jobRuns: createJobRunsStub(),
    });

    await expect(setup.resetPortfolio()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(queries).toHaveLength(0);
  });
});
