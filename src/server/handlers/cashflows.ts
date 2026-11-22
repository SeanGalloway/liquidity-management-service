import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { CashflowList, CashflowQuery } from '@shared/contracts';
import type { ScheduledCashflow } from '../db/cashflows';
import type { Container } from '../container';
import { createRouter, errorBody, jsonBody } from '../openapi';

const listCashflows = createRoute({
  method: 'get',
  path: '/',
  tags: ['Cash'],
  summary: 'Scheduled and paid coupon / principal cashflows',
  request: { query: CashflowQuery },
  responses: {
    200: jsonBody(CashflowList, 'Cashflows by date'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function cashflowRoutes({ cashflows }: Container) {
  return createRouter().openapi(listCashflows, async (c) => {
    const { status, from, to } = c.req.valid('query');
    const rows = await cashflows.listCashflows({ status, range: { from, to } });

    return c.json({ data: rows.map(toCashflowDto) }, 200);
  });
}

export function toCashflowDto(cashflow: ScheduledCashflow) {
  return {
    id: cashflow.id,
    holdingId: cashflow.holdingId,
    date: cashflow.payDate,
    kind: cashflow.kind,
    amountCents: cashflow.amountCents,
    status: cashflow.status,
    paidAt: cashflow.paidAt?.toISOString() ?? null,
  };
}
