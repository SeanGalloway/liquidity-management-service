import { describe, expect, it, vi } from 'vitest';
import { PENDING_ORDER } from '@test/fixtures/orders';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createCurveQuotes } from '@test/helpers/quotes';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createBalanceService } from './balance';
import { createExecuteOrder, type ExecuteOrder } from './execute-order';
import { createOrdersService } from './orders';

const clock = createFakeClock('2026-11-22T17:00:00Z');
const quotes = createCurveQuotes(clock);
const REQUEST = { maturityDate: '2027-03-18', faceCents: 75_000_000 };
const DIFFERENT_REQUEST_HASH = '0a3c37f0c1cd3a7cf0ea0c0f0a6ef8d0c41c8e5c6e2a52a5f6f30a8d3a8a0d0e';

type Scripted = Parameters<typeof createRecordingDb>[0];

function createService(scripted: Scripted, executeOrder?: ExecuteOrder) {
  const recording = createRecordingDb(scripted);
  const service = createOrdersService({
    db: recording.db,
    clock,
    quotes,
    executeOrder: executeOrder ?? createExecuteOrder({ quotes, clock }),
    balance: createBalanceService(),
  });

  return { service, ...recording };
}

async function submittedHash() {
  const { service, queries } = createService([[], [{ ...PENDING_ORDER }]]);
  await service.submitOrder('probe', REQUEST);
  return String(queries[1]?.parameters[1]);
}

describe('submitOrder', () => {
  it('quotes and inserts a pending order that executes 2–5 seconds later', async () => {
    const { service, queries } = createService([[], [{ ...PENDING_ORDER }]]);

    const { order, replayed } = await service.submitOrder('ticket-key-0001', REQUEST);

    expect(replayed).toBe(false);
    expect(order.holdingId).toBeNull();

    const [key, hash, maturity, face, yieldBps, total, asOf, executeAfter] =
      queries[1]?.parameters ?? [];
    expect([key, maturity, face, yieldBps, total, asOf]).toEqual([
      'ticket-key-0001',
      '2027-03-18',
      75_000_000,
      '432',
      73_992_886,
      new Date('2026-11-20T20:30:00Z'),
    ]);
    expect(String(hash)).toMatch(/^[0-9a-f]{64}$/);

    const delayMs = (executeAfter as Date).getTime() - clock.now().getTime();
    expect(delayMs).toBeGreaterThanOrEqual(2_000);
    expect(delayMs).toBeLessThanOrEqual(5_000);
  });

  it('replays an earlier order for the same key and request without re-quoting', async () => {
    const requestHash = await submittedHash();
    const spy = vi.spyOn(quotes, 'quoteOrder');
    const { service, queries } = createService([
      [{ ...PENDING_ORDER, requestHash, holdingId: null }],
    ]);

    const { replayed } = await service.submitOrder('ticket-key-0001', REQUEST);

    expect(replayed).toBe(true);
    expect(queries).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects reuse of a key with a different request', async () => {
    const { service } = createService([
      [{ ...PENDING_ORDER, requestHash: DIFFERENT_REQUEST_HASH }],
    ]);

    await expect(service.submitOrder('ticket-key-0001', REQUEST)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('resolves a lost insert race by replaying the winner', async () => {
    const requestHash = await submittedHash();
    const { service } = createService([
      [],
      [],
      [{ ...PENDING_ORDER, requestHash, holdingId: null }],
    ]);

    const { replayed } = await service.submitOrder('ticket-key-0001', REQUEST);

    expect(replayed).toBe(true);
  });
});

describe('fillNextDueOrder', () => {
  it('debits cash, records the security, holding and cashflows, then marks executed — in one transaction', async () => {
    const { service, sql } = createService([
      [PENDING_ORDER],
      [{ id: 1, amountCents: 1_500_000_000 }],
      [{ id: 'entry-1' }],
      [{ id: 1 }],
      [{ id: 'security-1' }],
      [{ id: 'holding-1' }],
      [{ id: 'cashflow-1' }],
      [{ ...PENDING_ORDER, status: 'executed' }],
    ]);

    expect(await service.fillNextDueOrder()).toBe('executed');
    expect(sql().map((statement) => statement.split(' (')[0]?.split(' where')[0])).toEqual([
      'begin',
      'select * from "orders"',
      'select * from "balance"',
      'insert into "ledger_entries"',
      'update "balance" set "amount_cents" = $1, "updated_at" = now()',
      'insert into "securities"',
      'insert into "holdings"',
      'insert into "scheduled_cashflows"',
      'update "orders" set "executed_at" = $1, "executed_yield_bps" = $2, "executed_total_cents" = $3, "priced_as_of" = $4, "status" = $5, "updated_at" = now()',
      'commit',
    ]);
  });

  it('rejects for insufficient funds without creating a holding', async () => {
    const { service, sql } = createService([
      [PENDING_ORDER],
      [{ id: 1, amountCents: 100_00 }],
      [{ ...PENDING_ORDER, status: 'rejected' }],
    ]);

    expect(await service.fillNextDueOrder()).toBe('rejected');
    expect(sql()).toHaveLength(5);
    expect(sql()[3]).toContain('update "orders" set "status" = $1, "reject_reason" = $2');
    expect(sql()[4]).toBe('commit');
  });

  it('records the engine rejection reason', async () => {
    const executeOrder = vi.fn(async () => ({
      status: 'rejected' as const,
      reason: 'NO_MARKET_DATA',
    }));
    const { service, queries } = createService(
      [[PENDING_ORDER], [{ ...PENDING_ORDER, status: 'rejected' }]],
      executeOrder,
    );

    expect(await service.fillNextDueOrder()).toBe('rejected');
    expect(queries[2]?.parameters).toContain('NO_MARKET_DATA');
  });

  it('rolls back and marks the order failed on an unexpected error', async () => {
    const executeOrder = vi.fn(async () => {
      throw new Error('connection reset');
    });
    const { service, sql } = createService(
      [[PENDING_ORDER], [{ id: PENDING_ORDER.id }]],
      executeOrder,
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await service.fillNextDueOrder()).toBe('failed');
    expect(sql().slice(2)).toEqual([
      'rollback',
      'update "orders" set "status" = $1, "failure_message" = $2, "updated_at" = now() where "id" = $3 and "status" = $4 returning *',
    ]);
  });

  it('returns none when nothing is due', async () => {
    const { service, sql } = createService([[]]);

    expect(await service.fillNextDueOrder()).toBe('none');
    expect(sql()).toEqual(['begin', expect.stringContaining('for update skip locked'), 'commit']);
  });
});

describe('fillDueOrders', () => {
  it('keeps claiming until nothing is due and tallies outcomes', async () => {
    const executeOrder = vi.fn(async () => ({
      status: 'rejected' as const,
      reason: 'NO_MARKET_DATA',
    }));
    const { service } = createService(
      [[PENDING_ORDER], [{}], [PENDING_ORDER], [{}], []],
      executeOrder,
    );

    expect(await service.fillDueOrders()).toEqual({
      claimed: 2,
      executed: 0,
      rejected: 2,
      failed: 0,
    });
  });
});

describe('listOrders', () => {
  it('returns a cursor only when another page exists', async () => {
    const rows = [1, 2, 3].map((n) => ({
      ...PENDING_ORDER,
      id: `order-${n}`,
      holdingId: null,
    }));
    const { service } = createService([rows]);

    const page = await service.listOrders({ limit: 2 });

    expect(page.orders.map((order) => order.id)).toEqual(['order-1', 'order-2']);
    expect(Buffer.from(page.nextCursor ?? '', 'base64url').toString()).toBe(
      '2026-11-22T17:00:00.000Z|order-2',
    );
  });

  it('rejects a malformed cursor', async () => {
    const { service } = createService([]);

    await expect(service.listOrders({ limit: 2, cursor: 'nope' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
