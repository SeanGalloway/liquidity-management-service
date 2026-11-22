import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { SetupRequest, SetupStatus } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
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

export function setupRoutes() {
  return createRouter()
    .openapi(getSetup, () => notImplemented('GET /setup'))
    .openapi(postSetup, () => notImplemented('POST /setup'));
}
