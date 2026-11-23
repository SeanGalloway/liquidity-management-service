import {
  CamelCasePlugin,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { DB } from '@server/db/schema';

export type RecordedQuery = { sql: string; parameters: readonly unknown[] };

type ScriptedResult = Record<string, unknown>[] | QueryResult<Record<string, unknown>> | Error;

export function createRecordingDb(scriptedResults: ScriptedResult[] = []) {
  const queries: RecordedQuery[] = [];
  const pending = [...scriptedResults];

  const connection: DatabaseConnection = {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      queries.push({ sql: compiled.sql, parameters: compiled.parameters });

      const next = pending.shift();
      if (next instanceof Error) throw next;

      return toQueryResult(next) as QueryResult<R>;
    },
    async *streamQuery() {
      throw new Error('streaming is not supported by the recording db');
    },
  };

  const record = (sql: string) => async () => {
    queries.push({ sql, parameters: [] });
  };

  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: record('begin'),
    commitTransaction: record('commit'),
    rollbackTransaction: record('rollback'),
    releaseConnection: async () => {},
    destroy: async () => {},
  };

  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });

  return { db, queries, sql: () => queries.map((query) => query.sql) };
}

function toQueryResult(
  result: Exclude<ScriptedResult, Error> | undefined,
): QueryResult<Record<string, unknown>> {
  if (!result) return { rows: [] };
  return Array.isArray(result) ? { rows: result } : result;
}
