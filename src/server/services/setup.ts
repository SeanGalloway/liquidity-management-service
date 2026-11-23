import 'server-only';
import { findBalance, insertBalance } from '../db/balance';
import type { Database } from '../db/client';
import { deletePortfolio } from '../db/portfolio';
import { withTransaction } from '../db/transaction';
import { findYieldCoverage, type YieldCoverage } from '../db/yields';
import { DomainError } from '../domain/errors';
import type { BalanceService } from './balance';
import { JOBS, type JobRunsService, type JobStatus } from './job-runs';
import type { YieldsService } from './yields';

export type SetupStatus = {
  initialized: boolean;
  resetEnabled: boolean;
  yields: YieldCoverage & { backfill: JobStatus };
};

type Dependencies = {
  db: Database;
  resetEnabled: boolean;
  balance: BalanceService;
  yields: YieldsService;
  jobRuns: JobRunsService;
};

export function createSetupService({ db, resetEnabled, balance, yields, jobRuns }: Dependencies) {
  async function getSetupStatus(): Promise<SetupStatus> {
    const existingBalance = await findBalance(db);
    const coverage = await findYieldCoverage(db);
    const backfill = await jobRuns.getJobStatus(JOBS.syncYields);

    return {
      initialized: Boolean(existingBalance),
      resetEnabled,
      yields: { ...coverage, backfill },
    };
  }

  async function initializeDesk(startingBalanceCents: number): Promise<SetupStatus> {
    await withTransaction(db, async (trx) => {
      const created = await insertBalance(trx);
      if (!created) throw new DomainError('ALREADY_INITIALIZED', 'The desk is already set up');

      await balance.postLedgerEntry({ reason: 'deposit', amountCents: startingBalanceCents }, trx);
    });

    startYieldSync();

    const status = await getSetupStatus();
    return { ...status, yields: { ...status.yields, backfill: 'running' } };
  }

  function startYieldSync() {
    jobRuns
      .runExclusiveJob(JOBS.syncYields, yields.syncYields)
      .catch((error) => console.error('yield sync after setup failed', error));
  }

  async function resetPortfolio(): Promise<SetupStatus> {
    if (!resetEnabled) throw new DomainError('NOT_FOUND', 'Portfolio reset is not enabled');

    await deletePortfolio(db);
    return getSetupStatus();
  }

  return { getSetupStatus, initializeDesk, resetPortfolio };
}

export type SetupService = ReturnType<typeof createSetupService>;
