import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { Quote, QuoteQuery } from '@shared/contracts';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';
import type { Quote as QuoteValue } from '../pricing/quote';

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

export function quoteRoutes({ quotes }: Container) {
  return createRouter().openapi(getQuote, async (c) => {
    const { maturityDate, faceCents } = c.req.valid('query');
    const quote = await quotes.quoteOrder(maturityDate, faceCents);

    return c.json(toQuoteDto(quote), 200);
  });
}

function toQuoteDto(quote: QuoteValue) {
  return {
    kind: quote.security.kind,
    settleDate: quote.settleDate,
    maturityDate: quote.security.maturityDate,
    days: quote.days,
    yieldBps: quote.yieldBps.toNumber(),
    interpolatedFrom: quote.interpolatedFrom,
    couponRateBps: quote.security.couponRateBps?.toNumber() ?? null,
    pricePer100: quote.pricePer100.toFixed(6),
    cleanPriceCents: quote.cleanCents,
    accruedCents: quote.accruedCents,
    totalCents: quote.totalCents,
    interestToMaturityCents: quote.interestToMaturityCents,
    cashflows: quote.cashflows,
    pricedAsOf: quote.pricedAsOf.toISOString(),
    source: quote.source,
  };
}
