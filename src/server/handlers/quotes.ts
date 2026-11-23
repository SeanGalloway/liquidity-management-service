import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Quote, QuoteQuery } from '@shared/contracts';
import { notImplemented } from '../domain/errors';
import { createRouter, errorBody, jsonBody } from '../openapi';

const getQuote = createRoute({
  method: 'get',
  path: '/',
  tags: ['Orders'],
  summary: 'Side-effect-free estimate at the latest stored close',
  request: { query: QuoteQuery },
  responses: {
    200: jsonBody(Quote, 'Estimate for the ticket'),
    400: errorBody('VALIDATION_FAILED'),
    503: errorBody('NO_MARKET_DATA'),
  },
});

export function quoteRoutes() {
  return createRouter().openapi(getQuote, () => notImplemented('GET /quote'));
}
