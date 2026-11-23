import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createHoldingsService } from './holdings';

describe('holdings service', () => {
  it('returns a holding with its cashflow schedule', async () => {
    const { db, sql } = createRecordingDb([
      [{ id: 'holding-1', kind: 'note' }],
      [{ id: 'cashflow-1' }, { id: 'cashflow-2' }],
    ]);

    const detail = await createHoldingsService({ db }).getHolding('holding-1');

    expect(detail.holding.id).toBe('holding-1');
    expect(detail.cashflows).toHaveLength(2);
    expect(sql()[1]).toBe(
      'select * from "scheduled_cashflows" where "holding_id" = $1 order by "pay_date", "kind"',
    );
  });

  it('throws NOT_FOUND for an unknown holding without querying cashflows', async () => {
    const { db, sql } = createRecordingDb([[]]);

    await expect(createHoldingsService({ db }).getHolding('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(sql()).toHaveLength(1);
  });
});
