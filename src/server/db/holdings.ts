import 'server-only';
import type { Insertable, Selectable } from 'kysely';
import type { Executor } from './client';
import type { Holdings } from './schema';

export type Holding = Selectable<Holdings>;
export type NewHolding = Insertable<Holdings>;

export function insertHolding(holding: NewHolding, ex: Executor): Promise<Holding> {
  return ex.insertInto('holdings').values(holding).returningAll().executeTakeFirstOrThrow();
}
