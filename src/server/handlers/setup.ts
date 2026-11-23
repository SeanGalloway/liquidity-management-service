import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { SetupRequest, SetupStatus } from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';

const getSetup = createRoute({
  method: 'get',
  path: '/',
  tags: ['Setup'],
  summary: 'Initialization and yield backfill progress (polled by the setup wizard)',
  responses: { 200: jsonBody(SetupStatus, 'Current setup status') },
});

const postSetup = createRoute({
  method: 'post',
  path: '/',
  tags: ['Setup'],
  summary: 'Create the balance with a starting deposit and start the yield backfill',
  request: { body: { content: { 'application/json': { schema: SetupRequest } }, required: true } },
  responses: {
    202: jsonBody(SetupStatus, 'Balance created; backfill started'),
    400: errorBody('Invalid starting balance'),
    409: errorBody('ALREADY_INITIALIZED'),
  },
});

const resetSetup = createRoute({
  method: 'post',
  path: '/reset',
  tags: ['Setup'],
  summary:
    'Erase balance, holdings, orders and ledger (yields kept); desk returns to uninitialized. Requires ENABLE_SIMULATION',
  responses: {
    200: jsonBody(SetupStatus, 'Portfolio erased; run setup again'),
    404: errorBody('NOT_FOUND — reset is disabled'),
  },
});

export function setupRoutes({ setup }: Container) {
  return createRouter()
    .openapi(getSetup, async (c) => {
      return c.json(await setup.getSetupStatus(), 200);
    })
    .openapi(postSetup, async (c) => {
      const { startingBalanceCents } = c.req.valid('json');
      return c.json(await setup.initializeDesk(startingBalanceCents), 202);
    })
    .openapi(resetSetup, async (c) => {
      return c.json(await setup.resetPortfolio(), 200);
    });
}
