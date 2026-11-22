import { describe, expect, it, vi } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createBalanceService } from './balance';
import type { JobRunsService } from './job-runs';
import { createSetupService } from './setup';
import type { YieldsService } from './yields';

function createJobRunsStub() {
  return {
    runExclusiveJob: vi.fn(async () => ({ status: 'skipped' as const })),
    getJobStatus: vi.fn(async () => 'running' as const),
  } satisfies JobRunsService;
}

const yields = { backfillYields: vi.fn() } as unknown as YieldsService;

describe('setup service', () => {
  it('creates the balance and the deposit in one transaction, then starts the backfill', async () => {
    const jobRuns = createJobRunsStub();
    const { db, sql } = createRecordingDb([
      [{ id: 1, amountCents: 0 }],
      [{ id: 1, amountCents: 0 }],
      [{ id: 'entry-1' }],
      [{ id: 1, amountCents: 15_000_000_00 }],
      [{ id: 1, amountCents: 15_000_000_00 }],
      [{ earliest: null, latest: null, rows: 0 }],
    ]);

    const setup = createSetupService({ db, balance: createBalanceService(), yields, jobRuns });
    const status = await setup.initializeDesk(15_000_000_00);

    expect(sql().slice(0, 6)).toEqual([
      'begin',
      'insert into "balance" ("amount_cents") values ($1) on conflict ("id") do nothing returning *',
      'select * from "balance" for update',
      'insert into "ledger_entries" ("reason", "amount_cents", "balance_after_cents") values ($1, $2, $3) returning *',
      'update "balance" set "amount_cents" = $1, "updated_at" = now() returning *',
      'commit',
    ]);
    expect(jobRuns.runExclusiveJob).toHaveBeenCalledWith('backfill-yields', yields.backfillYields);
    expect(status).toEqual({
      initialized: true,
      yields: { earliest: null, latest: null, rows: 0, backfill: 'running' },
    });
  });

  it('refuses to initialize twice', async () => {
    const jobRuns = createJobRunsStub();
    const { db, sql } = createRecordingDb([[]]);

    const setup = createSetupService({ db, balance: createBalanceService(), yields, jobRuns });

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
});
