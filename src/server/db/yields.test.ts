import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { findLatestYieldDate } from './yields';

describe('findLatestYieldDate', () => {
  it('selects the most recent as_of_date', async () => {
    const { db, queries } = createRecordingDb();

    const result = await findLatestYieldDate(db);

    expect(result).toBeNull();
    expect(queries).toEqual([
      {
        sql: 'select "as_of_date" from "yields" order by "as_of_date" desc limit $1',
        parameters: [1],
      },
    ]);
  });
});
