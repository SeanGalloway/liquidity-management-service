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

    const entry = await db.transaction().execute((trx) =>
      createBalanceService().postLedgerEntry(trx, {
        reason: 'buy',
        amountCents: -600_00,
        orderId: 'order-1',
      }),
    );

    expect(entry.id).toBe('entry-1');
    expect(sql()).toEqual([
      'begin',
      'select * from "balance" for update',
      'insert into "ledger_entries" ("reason", "amount_cents", "order_id", "balance_after_cents") values ($1, $2, $3, $4) returning *',
      'update "balance" set "amount_cents" = $1, "updated_at" = now() returning *',
      'commit',
    ]);
    expect(queries[2]?.parameters).toEqual(['buy', -600_00, 'order-1', 400_00]);
  });

  it('rejects a movement that would make the balance negative, before writing', async () => {
    const { db, sql } = createRecordingDb([[BALANCE]]);

    const attempt = db
      .transaction()
      .execute((trx) =>
        createBalanceService().postLedgerEntry(trx, { reason: 'buy', amountCents: -1_000_01 }),
      );

    await expect(attempt).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
    expect(sql()).toEqual(['begin', 'select * from "balance" for update', 'rollback']);
  });
});
