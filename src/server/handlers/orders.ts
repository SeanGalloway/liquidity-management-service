import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import {
  CreateOrderRequest,
  IdempotencyHeaders,
  IdParam,
  Order,
  OrderList,
  OrdersQuery,
} from '@shared/contracts';
import type { Container } from '../container';
import type { OrderWithHolding } from '../db/orders';
import { createRouter, errorBody, jsonBody } from '../openapi';

const createOrder = createRoute({
  method: 'post',
  path: '/',
  tags: ['Orders'],
  summary: 'Submit a market buy; fills asynchronously at the latest stored close',
  request: {
    headers: IdempotencyHeaders,
    body: { content: { 'application/json': { schema: CreateOrderRequest } }, required: true },
  },
  responses: {
    200: jsonBody(Order, 'Replay of an earlier request with the same Idempotency-Key'),
    202: jsonBody(Order, 'Order accepted as pending'),
    400: errorBody('VALIDATION_FAILED'),
    409: errorBody('IDEMPOTENCY_CONFLICT or NOT_INITIALIZED'),
    503: errorBody('NO_MARKET_DATA'),
  },
});

const listOrders = createRoute({
  method: 'get',
  path: '/',
  tags: ['Orders'],
  summary: 'Order history, newest first',
  request: { query: OrdersQuery },
  responses: {
    200: jsonBody(OrderList, 'Page of orders'),
    400: errorBody('VALIDATION_FAILED'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

const getOrder = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Orders'],
  summary: 'One order (the ticket polls this while pending)',
  request: { params: IdParam },
  responses: {
    200: jsonBody(Order, 'Order'),
    404: errorBody('NOT_FOUND'),
    409: errorBody('NOT_INITIALIZED'),
  },
});

export function orderRoutes({ orders }: Container) {
  return createRouter()
    .openapi(createOrder, async (c) => {
      const idempotencyKey = c.req.valid('header')['idempotency-key'];
      const { order, replayed } = await orders.submitOrder(idempotencyKey, c.req.valid('json'));

      return replayed ? c.json(toOrderDto(order), 200) : c.json(toOrderDto(order), 202);
    })
    .openapi(listOrders, async (c) => {
      const page = await orders.listOrders(c.req.valid('query'));
      return c.json({ data: page.orders.map(toOrderDto), nextCursor: page.nextCursor }, 200);
    })
    .openapi(getOrder, async (c) => {
      const order = await orders.getOrder(c.req.valid('param').id);
      return c.json(toOrderDto(order), 200);
    });
}

function toOrderDto(order: OrderWithHolding) {
  return {
    id: order.id,
    side: 'buy' as const,
    status: order.status,
    maturityDate: order.maturityDate,
    faceCents: order.faceCents,
    quote: {
      yieldBps: Number(order.quotedYieldBps),
      totalCents: order.quotedTotalCents,
      pricedAsOf: order.quotedAsOf.toISOString(),
    },
    fill: toFillDto(order),
    rejectReason: order.rejectReason,
    createdAt: order.createdAt.toISOString(),
  };
}

function toFillDto(order: OrderWithHolding) {
  if (order.status !== 'executed' || !order.holdingId) return null;

  return {
    executedAt: order.executedAt!.toISOString(),
    yieldBps: Number(order.executedYieldBps),
    totalCents: order.executedTotalCents!,
    pricedAsOf: order.pricedAsOf!.toISOString(),
    holdingId: order.holdingId,
  };
}
