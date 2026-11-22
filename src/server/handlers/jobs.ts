import 'server-only';
import { Hono } from 'hono';
import { DomainError } from '../domain/errors';

export function jobRoutes() {
  return new Hono()
    .post('/fill-orders', () => notImplemented('fill-orders'))
    .post('/poll-yields', () => notImplemented('poll-yields'))
    .post('/pay-cashflows', () => notImplemented('pay-cashflows'))
    .post('/backfill-yields', () => notImplemented('backfill-yields'));
}

function notImplemented(job: string): never {
  throw new DomainError('NOT_IMPLEMENTED', `Job ${job} is not implemented yet`);
}
