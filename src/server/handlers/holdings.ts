import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { HoldingDetail, HoldingList, HoldingsQuery, IdParam } from '@shared/contracts';
import type { Container } from '../container';
import type { HoldingWithSecurity } from '../db/holdings';
import { toCashflowDto } from './cashflows';
import { createRouter, errorBody, jsonBody } from '../openapi';

const listHoldings = createRoute({
  method: 'get',
  path: '/',
  tags: ['Holdings'],
  summary: 'Lots, soonest maturity first',
  request: { query: HoldingsQuery },
  responses: { 200: jsonBody(HoldingList, 'Holdings'), 409: errorBody('NOT_INITIALIZED') },
});

const getHolding = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Holdings'],
  summary: 'One lot with its security and cashflow schedule',
  request: { params: IdParam },
  responses: { 200: jsonBody(HoldingDetail, 'Holding'), 404: errorBody('NOT_FOUND') },
});

export function holdingRoutes({ holdings }: Container) {
  return createRouter()
    .openapi(listHoldings, async (c) => {
      const rows = await holdings.listHoldings(c.req.valid('query').status);
      return c.json({ data: rows.map(toHoldingDto) }, 200);
    })
    .openapi(getHolding, async (c) => {
      const { holding, cashflows } = await holdings.getHolding(c.req.valid('param').id);
      return c.json({ ...toHoldingDto(holding), cashflows: cashflows.map(toCashflowDto) }, 200);
    });
}

function toHoldingDto(holding: HoldingWithSecurity) {
  const totalCostCents = holding.cleanCostCents + holding.accruedPaidCents;

  return {
    id: holding.id,
    orderId: holding.orderId,
    security: {
      id: holding.securityId,
      cusip: holding.cusip,
      kind: holding.kind as 'bill' | 'note' | 'bond',
      issueDate: holding.issueDate,
      maturityDate: holding.maturityDate,
      couponRateBps: holding.couponRateBps === null ? null : Number(holding.couponRateBps),
      synthetic: holding.synthetic,
    },
    faceCents: holding.faceCents,
    cleanCostCents: holding.cleanCostCents,
    accruedPaidCents: holding.accruedPaidCents,
    totalCostCents,
    purchaseYieldBps: Number(holding.purchaseYieldBps),
    purchasedAt: holding.purchasedAt.toISOString(),
    status: holding.status as 'active' | 'matured',
    maturedAt: holding.maturedAt?.toISOString() ?? null,
    interestToMaturityCents: holding.cashflowTotalCents - totalCostCents,
  };
}
