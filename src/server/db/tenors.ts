import 'server-only';
import type { Selectable } from 'kysely';
import type { Executor } from './client';
import type { Tenors } from './schema';

export type Tenor = Selectable<Tenors>;

export function findTenors(ex: Executor): Promise<Tenor[]> {
  return ex.selectFrom('tenors').selectAll().orderBy('months').execute();
}
