import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { findHoldingsWithSecurity } from './holdings';

describe('holdings repository', () => {
  it('joins the security and sums scheduled cashflows, soonest maturity first', async () => {
    const { db, queries } = createRecordingDb();

    await findHoldingsWithSecurity('active', db);

    const sql = queries[0]?.sql.replace(/\s+/g, ' ') ?? '';
    expect(sql).toContain(
      'inner join "securities" on "securities"."id" = "holdings"."security_id"',
    );
    expect(sql).toContain(
      '( select coalesce(sum(c.amount_cents), 0)::bigint from scheduled_cashflows c where c.holding_id = holdings.id ) as "cashflow_total_cents"',
    );
    expect(sql).toContain('where "holdings"."status" = $1');
    expect(sql).toContain('order by "securities"."maturity_date", "holdings"."purchased_at"');
    expect(queries[0]?.parameters).toEqual(['active']);
  });

  it('omits the status filter for all holdings', async () => {
    const { db, queries } = createRecordingDb();

    await findHoldingsWithSecurity('all', db);

    expect(queries[0]?.sql).not.toContain('"holdings"."status"');
  });
});
