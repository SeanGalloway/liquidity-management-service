import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import type { DB } from '@server/db/schema';

export type RecordedQuery = { sql: string; parameters: readonly unknown[] };

export function createRecordingDb() {
  const queries: RecordedQuery[] = [];

  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
    log: (event) => {
      queries.push({ sql: event.query.sql, parameters: event.query.parameters });
    },
  });

  return { db, queries };
}
