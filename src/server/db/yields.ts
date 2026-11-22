import 'server-only';
import type { Executor } from './client';

export async function findLatestYieldDate(ex: Executor): Promise<string | null> {
  const row = await ex
    .selectFrom('yields')
    .select('asOfDate')
    .orderBy('asOfDate', 'desc')
    .limit(1)
    .executeTakeFirst();

  return row?.asOfDate ?? null;
}
