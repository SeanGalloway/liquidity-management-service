import { describe, expect, it } from 'vitest';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createBalanceService } from './balance';
import { createCashflowsService } from './cashflows';

const clock = createFakeClock('2026-12-15T17:00:00Z');

const COUPON = {
  id: 'cashflow-1',
  holdingId: 'holding-1',
  payDate: '2026-12-15',
  kind: 'coupon',
  amountCents: 2_288_635,
  status: 'scheduled',
  paidAt: null,
};

const PRINCIPAL = {
  ...COUPON,
  id: 'cashflow-5',
  payDate: '2028-06-15',
  kind: 'principal',
  amountCents: 100_000_000,
};

function createService(scripted: Parameters<typeof createRecordingDb>[0]) {
  const recording = createRecordingDb(scripted);
  const service = createCashflowsService({
    db: recording.db,
    clock,
    balance: createBalanceService({ db: recording.db }),
  });

  return { service, ...recording };
}

const PAYMENT_SCRIPT = (cashflow: typeof COUPON) => [
  [cashflow],
  [{ id: 1, amountCents: 1_000_000_00 }],
  [{ id: 'entry-1' }],
  [{ id: 1 }],
  [{ ...cashflow, status: 'paid' }],
];

describe('payNextDueCashflow', () => {
  it('credits a due coupon to the ledger and marks it paid in one transaction', async () => {
    const { service, sql, queries } = createService(PAYMENT_SCRIPT(COUPON));

    const paid = await service.payNextDueCashflow();

    expect(paid?.status).toBe('paid');
    expect(sql().map((statement) => statement.split(' (')[0]?.split(' where')[0])).toEqual([
      'begin',
      'select * from "scheduled_cashflows"',
      'select * from "balance"',
      'insert into "ledger_entries"',
      'update "balance" set "amount_cents" = $1, "updated_at" = now()',
      'update "scheduled_cashflows" set "status" = $1, "paid_at" = now()',
      'commit',
    ]);
    expect(queries[1]?.parameters).toEqual(['scheduled', '2026-12-15', 1]);
    expect(queries[3]?.parameters).toEqual(['coupon', 2_288_635, 'cashflow-1', 1_022_886_35]);
  });

  it('also marks the holding matured when the principal is paid', async () => {
    const { service, sql } = createService([...PAYMENT_SCRIPT(PRINCIPAL), [{ id: 'holding-1' }]]);

    await service.payNextDueCashflow();

    expect(sql().at(-2)).toBe(
      'update "holdings" set "status" = $1, "matured_at" = now() where "id" = $2 returning *',
    );
  });

  it('does nothing when no cashflow is due', async () => {
    const { service, sql } = createService([[]]);

    expect(await service.payNextDueCashflow()).toBeUndefined();
    expect(sql()).toHaveLength(3);
  });
});

describe('payDueCashflows', () => {
  it('pays every due cashflow and totals the amounts', async () => {
    const { service } = createService([
      ...PAYMENT_SCRIPT(COUPON),
      ...PAYMENT_SCRIPT({ ...COUPON, id: 'cashflow-2', amountCents: 905_000 }),
      [],
    ]);

    expect(await service.payDueCashflows()).toEqual({ paid: 2, totalCents: 2_288_635 + 905_000 });
  });
});
