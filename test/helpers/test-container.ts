import type { YieldsClient } from '@server/clients/yields-client';
import type { Container } from '@server/container';
import type { Database } from '@server/db/client';
import { createBalanceService } from '@server/services/balance';
import { createJobRunsService } from '@server/services/job-runs';
import { createSetupService } from '@server/services/setup';
import { createYieldsService } from '@server/services/yields';
import { createFakeClock } from './fake-clock';

export const TEST_JOB_TOKEN = 'test-job-token-0123456789';

export const emptyYieldsClient: YieldsClient = { fetchParYieldCurve: async () => [] };

export function createTestContainer(db: Database): Container {
  const clock = createFakeClock('2026-11-22T17:00:00Z');
  const jobRuns = createJobRunsService({ db });
  const balance = createBalanceService();
  const yields = createYieldsService({
    db,
    clock,
    yieldsClient: emptyYieldsClient,
  });
  const setup = createSetupService({ db, balance, yields, jobRuns });

  return {
    config: {
      databaseUrl: 'postgres://unused',
      jobToken: TEST_JOB_TOKEN,
      treasuryBaseUrl: 'http://unused',
    },
    db,
    clock,
    jobRuns,
    balance,
    yields,
    setup,
  };
}
