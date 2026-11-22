import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Timeline, TimelineQuery } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const getTimeline = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cash'],
  summary: 'Actual balance history plus projection from scheduled cashflows',
  request: { query: TimelineQuery },
  responses: { 200: jsonBody(Timeline, 'Chart-ready series'), 409: errorBody('NOT_INITIALIZED') },
});

export function timelineRoutes() {
  return createRouter().openapi(getTimeline, () => notImplemented('GET /timeline'));
}
