import 'server-only';
import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

export type Database = Kysely<DB>;
export type Executor = Kysely<DB> | Transaction<DB>;

const PG_INT8 = 20;
const PG_DATE = 1082;

pg.types.setTypeParser(PG_INT8, parseSafeInteger);
pg.types.setTypeParser(PG_DATE, (value) => value);

const globalForDb = globalThis as unknown as { liquidityDb?: Database };

export function getDatabase(databaseUrl: string): Database {
  globalForDb.liquidityDb ??= new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl, max: 10 }) }),
    plugins: [new CamelCasePlugin()],
  });

  return globalForDb.liquidityDb;
}

function parseSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`int8 value ${value} exceeds safe integer range`);
  }

  return parsed;
}
