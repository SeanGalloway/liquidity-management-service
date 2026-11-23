import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createBalanceService } from './balance';

const BALANCE = { id: 1, amountCents: 1_000_00 };

describe('postLedgerEntry', () => {
  it('locks the balance, appends the entry with the running balance, then updates the balance', async () => {
    const { db, sql, queries } = createRecordingDb([
      [BALANCE],
      [{ id: 'entry-1', balanceAfterCents: 400_00 }],
      [{ ...BALANCE, amountCents: 400_00 }],
    ]);

    const entry = await db
      .transaction()
      .execute((trx) =>
        createBalanceService({ db }).postLedgerEntry(
          { reason: 'buy', amountCents: -600_00, orderId: 'order-1' },
          trx,
        ),
      );

    expect(entry.id).toBe('entry-1');
    expect(sql()).toEqual([
      'begin',
      'select * from "balance" where "id" = $1 for update',
      'insert into "ledger_entries" ("reason", "amount_cents", "order_id", "balance_after_cents") values ($1, $2, $3, $4) returning *',
      'update "balance" set "amount_cents" = $1, "updated_at" = now() where "id" = $2 returning *',
      'commit',
    ]);
    expect(queries[2]?.parameters).toEqual(['buy', -600_00, 'order-1', 400_00]);
  });

  it('rejects a movement that would make the balance negative, before writing', async () => {
    const { db, sql } = createRecordingDb([[BALANCE]]);

    const attempt = db
      .transaction()
      .execute((trx) =>
        createBalanceService({ db }).postLedgerEntry(
          { reason: 'buy', amountCents: -1_000_01 },
          trx,
        ),
      );

    await expect(attempt).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(sql()).toEqual([
      'begin',
      'select * from "balance" where "id" = $1 for update',
      'rollback',
    ]);
  });
});

describe('balance reads', () => {
  it('combines the balance with pending order exposure', async () => {
    const totals = { count: 2, faceCents: 1_750_000_00, quotedTotalCents: 1_727_000_00 };
    const { db, sql } = createRecordingDb([[{ ...BALANCE, updatedAt: new Date() }], [totals]]);

    const summary = await createBalanceService({ db }).getBalance();

    expect(summary.balance.amountCents).toBe(1_000_00);
    expect(summary.pendingOrders).toEqual(totals);
    expect(sql()[0]).toBe('begin isolation level repeatable read');
    expect(sql()[2]).toContain('sum("quoted_total_cents")');
    expect(sql()[3]).toBe('commit');
  });

  it('rejects an inverted history range without querying, and accepts a single day', async () => {
    const { db, queries } = createRecordingDb([[]]);
    const service = createBalanceService({ db });

    await expect(
      service.listBalanceHistory({ from: '2026-11-22', to: '2026-11-20' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(queries).toHaveLength(0);

    await service.listBalanceHistory({ from: '2026-11-22', to: '2026-11-22' });
    expect(queries).toHaveLength(1);
  });

  it('filters history by New York calendar days, inclusive of the end date', async () => {
    const { db, queries } = createRecordingDb([[]]);

    await createBalanceService({ db }).listBalanceHistory({ from: '2026-11-20', to: '2026-11-22' });

    expect(queries[0]?.sql).toBe(
      'select * from "ledger_entries" where "occurred_at" >= $1 and "occurred_at" < $2 order by "occurred_at", "id"',
    );
    expect(queries[0]?.parameters).toEqual([
      new Date('2026-11-20T05:00:00Z'),
      new Date('2026-11-23T05:00:00Z'),
    ]);
  });
});
