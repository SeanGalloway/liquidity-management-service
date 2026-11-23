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
import { notImplemented } from '../domain/errors';
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
  responses: { 200: jsonBody(OrderList, 'Page of orders') },
});

const getOrder = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Orders'],
  summary: 'One order (the ticket polls this while pending)',
  request: { params: IdParam },
  responses: { 200: jsonBody(Order, 'Order'), 404: errorBody('NOT_FOUND') },
});

export function orderRoutes() {
  return createRouter()
    .openapi(createOrder, () => notImplemented('POST /orders'))
    .openapi(listOrders, () => notImplemented('GET /orders'))
    .openapi(getOrder, () => notImplemented('GET /orders/{id}'));
}
