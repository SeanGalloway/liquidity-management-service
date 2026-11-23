import type { YieldsClient } from '@server/clients/yields-client';
import type { Container } from '@server/container';
import type { Database } from '@server/db/client';
import { createBalanceService } from '@server/services/balance';
import { createCashflowsService } from '@server/services/cashflows';
import { createExecuteOrder } from '@server/services/execute-order';
import { createHoldingsService } from '@server/services/holdings';
import { createJobRunsService } from '@server/services/job-runs';
import { createOrdersService } from '@server/services/orders';
import { createQuotesService } from '@server/services/quotes';
import { createSecurityResolver } from '@server/services/security-resolver';
import { createSetupService } from '@server/services/setup';
import { createTimelineService } from '@server/services/timeline';
import { createYieldsService } from '@server/services/yields';
import { createFakeClock } from './fake-clock';

export const TEST_JOB_TOKEN = 'test-job-token-0123456789';

export const emptyYieldsClient: YieldsClient = { fetchParYieldCurve: async () => [] };

export function createTestContainer(db: Database): Container {
  const clock = createFakeClock('2026-11-22T17:00:00Z');
  const jobRuns = createJobRunsService({ db });
  const balance = createBalanceService({ db });
  const yields = createYieldsService({
    db,
    clock,
    yieldsClient: emptyYieldsClient,
  });
  const setup = createSetupService({ db, balance, yields, jobRuns });
  const quotes = createQuotesService({ clock, yields, securityResolver: createSecurityResolver() });

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
    quotes,
    orders: createOrdersService({
      db,
      clock,
      quotes,
      executeOrder: createExecuteOrder({ quotes, clock }),
      balance,
    }),
    holdings: createHoldingsService({ db }),
    cashflows: createCashflowsService({ db, clock, balance }),
    timeline: createTimelineService({ db, clock }),
  };
}
