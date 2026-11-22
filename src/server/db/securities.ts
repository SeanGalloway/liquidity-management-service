import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { Executor } from './client';
import type { Securities } from './schema';

export type Security = Selectable<Securities>;
export type NewSecurity = Insertable<Securities>;

export function insertSecurity(security: NewSecurity, ex: Executor): Promise<Security> {
  return ex.insertInto('securities').values(security).returningAll().executeTakeFirstOrThrow();
}
