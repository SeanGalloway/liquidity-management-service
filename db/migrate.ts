import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  const direction = process.argv[2] ?? 'latest';
  const db = new Kysely({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: requireDatabaseUrl() }) }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATIONS_DIR }),
  });

  const { error, results } =
    direction === 'down' ? await migrator.migrateDown() : await migrator.migrateToLatest();

  for (const result of results ?? []) {
    console.log(`${result.status.padEnd(7)} ${result.direction.padEnd(4)} ${result.migrationName}`);
  }

  await db.destroy();

  if (error) {
    console.error(error);
    process.exit(1);
  }
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

await main();
