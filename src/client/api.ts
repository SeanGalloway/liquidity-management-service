import 'client-only';
import { hc } from 'hono/client';
import type { ApiRoutes } from '@server/routes';
import type {
  Balance,
  CreateOrderRequest,
  Curve,
  Holding,
  Order,
  OrderList,
  Quote,
  SetupStatus,
  Tenor,
  Timeline,
  YieldSeries,
} from './types';

const api = hc<ApiRoutes>('/api/v1');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string } };

async function readBody<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body as T;

  const error = (body as ErrorBody | null)?.error;
  throw new ApiError(
    response.status,
    error?.code ?? 'HTTP_ERROR',
    error?.message ?? `Request failed (${response.status})`,
  );
}

export async function fetchSetupStatus() {
  return readBody<SetupStatus>(await api.setup.$get());
}

export async function postSetup(startingBalanceCents: number) {
  return readBody<SetupStatus>(await api.setup.$post({ json: { startingBalanceCents } }));
}

export async function fetchBalance() {
  return readBody<Balance>(await api.balance.$get());
}

export async function fetchTimeline(to: string | undefined) {
  return readBody<Timeline>(await api.timeline.$get({ query: { to } }));
}

export async function fetchHoldings() {
  const list = await readBody<{ data: Holding[] }>(
    await api.holdings.$get({ query: { status: 'active' } }),
  );
  return list.data;
}

export async function fetchOrders(cursor: string | undefined) {
  return readBody<OrderList>(await api.orders.$get({ query: { cursor, limit: '25' } }));
}

export async function fetchOrder(id: string) {
  return readBody<Order>(await api.orders[':id'].$get({ param: { id } }));
}

export async function postOrder(request: CreateOrderRequest, idempotencyKey: string) {
  const response = await api.orders.$post({
    json: request,
    header: { 'idempotency-key': idempotencyKey },
  });
  return readBody<Order>(response);
}

export async function fetchQuote(request: CreateOrderRequest) {
  const query = { maturityDate: request.maturityDate, faceCents: String(request.faceCents) };
  return readBody<Quote>(await api.quote.$get({ query }));
}

export async function fetchTenors() {
  const list = await readBody<{ data: Tenor[] }>(await api.tenors.$get());
  return list.data;
}

export async function fetchCurve(date: string) {
  return readBody<Curve>(await api.yields.curve.$get({ query: { date } }));
}

export async function fetchYieldHistory(tenors: string[], from: string) {
  const history = await readBody<{ series: YieldSeries[] }>(
    await api.yields.history.$get({ query: { tenors: tenors.join(','), from } }),
  );
  return history.series;
}
