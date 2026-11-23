import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createTestContainer, TEST_JOB_TOKEN } from '@test/helpers/test-container';
import { createApp } from './app';

function createTestApp(scriptedResults: Parameters<typeof createRecordingDb>[0] = []) {
  const { db } = createRecordingDb(scriptedResults);
  return createApp(createTestContainer(db));
}

describe('api app', () => {
  it('returns a JSON error for unknown routes', async () => {
    const response = await createTestApp().request('/api/v1/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects job calls without the job token', async () => {
    const response = await createTestApp().request('/api/v1/jobs/fill-orders', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('runs the pay-cashflows job and reports what it paid', async () => {
    const app = createTestApp([
      [{ acquired: true }],
      [],
      [{ id: 'run-1' }],
      [],
      [{ id: 'run-1' }],
      [],
    ]);

    const response = await app.request('/api/v1/jobs/pay-cashflows', {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_JOB_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paid: 0, totalCents: 0 });
  });

  it('reports a skipped job when another run holds its lock', async () => {
    const response = await createTestApp([[{ acquired: false }]]).request(
      '/api/v1/jobs/pay-cashflows',
      { method: 'POST', headers: { authorization: `Bearer ${TEST_JOB_TOKEN}` } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: true });
  });

  it('requires setup before order endpoints, including the bare collection path', async () => {
    const response = await createTestApp([[]]).request('/api/v1/orders');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_INITIALIZED' } });
  });

  it('rejects an order cursor that is not an order id', async () => {
    const response = await createTestApp([[{ id: 1 }]]).request('/api/v1/orders?cursor=nope');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('runs the fill-orders job and reports an empty batch', async () => {
    const response = await createTestApp([[]]).request('/api/v1/jobs/fill-orders', {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_JOB_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 0, executed: 0, rejected: 0, failed: 0 });
  });

  it('maps holdings to the contract with a nested security and interest to maturity', async () => {
    const holdingRow = {
      id: 'holding-1',
      orderId: 'order-1',
      securityId: 'security-1',
      faceCents: 100_000_000,
      cleanCostCents: 99_997_253,
      accruedPaidCents: 2_013_499,
      purchaseYieldBps: '458.1',
      purchasedAt: new Date('2026-11-22T23:09:42Z'),
      status: 'active',
      maturedAt: null,
      kind: 'note',
      cusip: null,
      issueDate: '2026-06-15',
      maturityDate: '2028-06-15',
      couponRateBps: '457.727',
      synthetic: true,
      cashflowTotalCents: 109_154_540,
    };
    const app = createTestApp([[{ id: 1 }], [holdingRow]]);

    const response = await app.request('/api/v1/holdings');
    const [holding] = (await response.json()).data;

    expect(response.status).toBe(200);
    expect(holding.security).toEqual({
      id: 'security-1',
      cusip: null,
      kind: 'note',
      issueDate: '2026-06-15',
      maturityDate: '2028-06-15',
      couponRateBps: 457.727,
      synthetic: true,
    });
    expect(holding.purchaseYieldBps).toBe(458.1);
    expect(holding.totalCostCents).toBe(102_010_752);
    expect(holding.interestToMaturityCents).toBe(109_154_540 - 102_010_752);
  });

  it('maps the balance with pending exposure to the contract', async () => {
    const updatedAt = new Date('2026-11-22T23:09:42Z');
    const app = createTestApp([
      [{ id: 1 }],
      [{ id: 1, amountCents: 1_323_996_362, updatedAt }],
      [{ count: 1, faceCents: 75_000_000, quotedTotalCents: 73_992_886 }],
    ]);

    const response = await app.request('/api/v1/balance');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      amountCents: 1_323_996_362,
      updatedAt: '2026-11-22T23:09:42.000Z',
      pendingOrders: { count: 1, faceCents: 75_000_000, quotedTotalCents: 73_992_886 },
    });
  });

  it('labels each ledger entry with what caused it', async () => {
    const entry = (overrides: object) => ({
      id: 'entry',
      occurredAt: new Date('2026-11-22T23:09:42Z'),
      amountCents: -1,
      balanceAfterCents: 0,
      reason: 'buy',
      orderId: null,
      cashflowId: null,
      ...overrides,
    });
    const app = createTestApp([
      [{ id: 1 }],
      [entry({ reason: 'deposit', amountCents: 1 }), entry({ orderId: 'order-1' })],
    ]);

    const response = await app.request('/api/v1/balance/history');
    const refs = (await response.json()).data.map((row: { ref: unknown }) => row.ref);

    expect(refs).toEqual([null, { type: 'order', id: 'order-1' }]);
  });

  it('publishes an OpenAPI document covering every planned endpoint', async () => {
    const response = await createTestApp().request('/api/v1/openapi.json');
    const doc = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(doc.paths)).toHaveLength(17);
    expect(doc.components.schemas).toHaveProperty('Order');
  });

  it('returns VALIDATION_FAILED for a face amount below $100', async () => {
    const response = await createTestApp().request(
      '/api/v1/quote?maturityDate=2027-03-18&faceCents=150',
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('reports health with the latest yield date', async () => {
    const app = createTestApp([[{ earliest: '2025-11-03', latest: '2026-11-20', rows: 3400 }]]);

    const response = await app.request('/api/v1/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: 'up', latestYieldAsOf: '2026-11-20' });
  });

  it('returns NO_MARKET_DATA when no curve is stored', async () => {
    const response = await createTestApp([[]]).request('/api/v1/yields/curve');

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'NO_MARKET_DATA' } });
  });
});
