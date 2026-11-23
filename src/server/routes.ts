import 'server-only';
import type { Container } from './container';
import { balanceRoutes } from './handlers/balance';
import { cashflowRoutes } from './handlers/cashflows';
import { healthRoutes } from './handlers/health';
import { holdingRoutes } from './handlers/holdings';
import { jobRoutes } from './handlers/jobs';
import { orderRoutes } from './handlers/orders';
import { quoteRoutes } from './handlers/quotes';
import { setupRoutes } from './handlers/setup';
import { tenorRoutes } from './handlers/tenors';
import { timelineRoutes } from './handlers/timeline';
import { yieldRoutes } from './handlers/yields';
import { createRouter } from './openapi';

// prettier-ignore
export function createRoutes(container: Container) {
  return createRouter()
    .route('/health',    healthRoutes(container))
    .route('/setup',     setupRoutes(container))
    .route('/balance',   balanceRoutes())
    .route('/cashflows', cashflowRoutes())
    .route('/timeline',  timelineRoutes())
    .route('/holdings',  holdingRoutes())
    .route('/quote',     quoteRoutes(container))
    .route('/orders',    orderRoutes(container))
    .route('/tenors',    tenorRoutes(container))
    .route('/yields',    yieldRoutes(container))
    .route('/jobs',      jobRoutes(container));
}

export type ApiRoutes = ReturnType<typeof createRoutes>;
