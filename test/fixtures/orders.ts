import type { Order } from '@server/db/orders';

export const PENDING_ORDER: Order = {
  id: '01936f2a-0000-7000-8000-000000000001',
  idempotencyKey: 'ticket-key-0001',
  requestHash: 'hash-placeholder',
  side: 'buy',
  status: 'pending',
  maturityDate: '2027-03-18',
  faceCents: 75_000_000,
  quotedYieldBps: '432',
  quotedTotalCents: 73_992_886,
  quotedAsOf: new Date('2026-11-20T20:30:00Z'),
  executeAfter: new Date('2026-11-22T17:00:03Z'),
  executedAt: null,
  executedYieldBps: null,
  executedTotalCents: null,
  pricedAsOf: null,
  rejectReason: null,
  failureMessage: null,
  createdAt: new Date('2026-11-22T17:00:00Z'),
  updatedAt: new Date('2026-11-22T17:00:00Z'),
};
