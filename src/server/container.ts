import 'server-only';
import { createTreasuryGovClient } from './clients/treasury-gov-client';
import { loadConfig, type Config } from './config';
import { getDatabase, type Database } from './db/client';
import { createSystemClock } from './domain/dates';
import type { Clock } from './domain/types';
import { createBalanceService, type BalanceService } from './services/balance';
import { createCashflowsService, type CashflowsService } from './services/cashflows';
import { createExecuteOrder } from './services/execute-order';
import { createHoldingsService, type HoldingsService } from './services/holdings';
import { createJobRunsService, type JobRunsService } from './services/job-runs';
import { createOrdersService, type OrdersService } from './services/orders';
import { createQuotesService, type QuotesService } from './services/quotes';
import { createSecurityResolver } from './services/security-resolver';
import { createSetupService, type SetupService } from './services/setup';
import { createTimelineService, type TimelineService } from './services/timeline';
import { createYieldsService, type YieldsService } from './services/yields';

export type Container = {
  config: Config;
  db: Database;
  clock: Clock;
  jobRuns: JobRunsService;
  balance: BalanceService;
  yields: YieldsService;
  setup: SetupService;
  quotes: QuotesService;
  orders: OrdersService;
  holdings: HoldingsService;
  cashflows: CashflowsService;
  timeline: TimelineService;
};

export function createContainer(): Container {
  const config = loadConfig();
  const db = getDatabase(config.databaseUrl);
  const clock = createSystemClock();

  const yieldsClient = createTreasuryGovClient({ baseUrl: config.treasuryBaseUrl });

  const jobRuns = createJobRunsService({ db });
  const balance = createBalanceService({ db });
  const yields = createYieldsService({ db, clock, yieldsClient });
  const setup = createSetupService({ db, balance, yields, jobRuns });
  const securityResolver = createSecurityResolver();
  const quotes = createQuotesService({ clock, yields, securityResolver });
  const executeOrder = createExecuteOrder({ quotes, clock });
  const orders = createOrdersService({ db, clock, quotes, executeOrder, balance });

  const holdings = createHoldingsService({ db });
  const cashflows = createCashflowsService({ db, clock, balance });
  const timeline = createTimelineService({ db, clock });

  return {
    config,
    db,
    clock,
    jobRuns,
    balance,
    yields,
    setup,
    quotes,
    orders,
    holdings,
    cashflows,
    timeline,
  };
}
