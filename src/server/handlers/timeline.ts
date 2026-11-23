import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Timeline, TimelineQuery } from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';

const getTimeline = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cash'],
  summary: 'Actual balance history plus projection from scheduled cashflows',
  request: { query: TimelineQuery },
  responses: {
    200: jsonBody(Timeline, 'Chart-ready series'),
    400: errorBody('VALIDATION_FAILED'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function timelineRoutes({ timeline }: Container) {
  return createRouter().openapi(getTimeline, async (c) => {
    return c.json(await timeline.getTimeline(c.req.valid('query').to), 200);
  });
}
