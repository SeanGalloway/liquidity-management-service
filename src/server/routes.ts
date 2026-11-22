import 'server-only';
import type { Container } from './container';
import { balanceRoutes } from './handlers/balance';
import { healthRoutes } from './handlers/health';
import { holdingRoutes } from './handlers/holdings';
import { jobRoutes } from './handlers/jobs';
import { marketDataRoutes } from './handlers/market-data';
import { orderRoutes } from './handlers/orders';
import { setupRoutes } from './handlers/setup';
import { createRouter } from './openapi';

// prettier-ignore
export function createRoutes(container: Container) {
  return createRouter()
    .route('/health',   healthRoutes(container))
    .route('/setup',    setupRoutes())
    .route('/',         balanceRoutes())
    .route('/holdings', holdingRoutes())
    .route('/',         orderRoutes())
    .route('/',         marketDataRoutes())
    .route('/jobs',     jobRoutes());
}

export type ApiRoutes = ReturnType<typeof createRoutes>;
