import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { findNextDueOrderForUpdate, findOrders, insertOrder, markOrderFailed } from './orders';

describe('orders repository', () => {
  it('ignores a duplicate idempotency key on insert', async () => {
    const { db, sql } = createRecordingDb();

    await insertOrder(
      {
        idempotencyKey: 'k',
        requestHash: 'h',
        maturityDate: '2027-03-18',
        faceCents: 10_000,
        quotedYieldBps: '432',
        quotedTotalCents: 9_866,
        quotedAsOf: new Date(),
        executeAfter: new Date(),
      },
      db,
    );

    expect(sql()[0]).toContain('on conflict ("idempotency_key") do nothing returning *');
  });

  it('claims the next due pending order without blocking on locked rows', async () => {
    const { db, sql } = createRecordingDb();

    await db.transaction().execute((trx) => findNextDueOrderForUpdate(new Date(), trx));

    expect(sql()[1]).toBe(
      'select * from "orders" where "status" = $1 and "execute_after" <= $2 ' +
        'order by "execute_after" limit $3 for update skip locked',
    );
  });

  it('pages newest first with a (created_at, id) keyset and joins the holding', async () => {
    const { db, queries } = createRecordingDb();
    const after = { createdAt: new Date('2026-11-22T17:00:00Z'), id: 'order-9' };

    await findOrders({ status: 'executed', after, limit: 26 }, db);

    expect(queries[0]?.sql).toBe(
      'select "orders".*, "holdings"."id" as "holding_id" from "orders" ' +
        'left join "holdings" on "holdings"."order_id" = "orders"."id" ' +
        'where "orders"."status" = $1 and ("orders"."created_at", "orders"."id") < ($2, $3) ' +
        'order by "orders"."created_at" desc, "orders"."id" desc limit $4',
    );
    expect(queries[0]?.parameters).toEqual(['executed', after.createdAt, 'order-9', 26]);
  });

  it('only marks an order failed while it is still pending', async () => {
    const { db, sql } = createRecordingDb();

    await markOrderFailed('order-1', 'boom', db);

    expect(sql()[0]).toContain('where "id" = $3 and "status" = $4');
  });
});
