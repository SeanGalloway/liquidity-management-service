import 'server-only';
import type { Selectable } from 'kysely';
import type { SecurityKind } from '../domain/types';
import type { Executor } from './client';
import type { Tenors } from './schema';

export type Tenor = Omit<Selectable<Tenors>, 'kind'> & { kind: SecurityKind };

export function findTenors(ex: Executor): Promise<Tenor[]> {
  return ex
    .selectFrom('tenors')
    .selectAll()
    .orderBy('months')
    .$narrowType<{ kind: SecurityKind }>()
    .execute();
}
