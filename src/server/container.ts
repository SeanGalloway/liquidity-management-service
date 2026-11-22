import 'server-only';
import { loadConfig, type Config } from './config';
import { getDatabase, type Database } from './db/client';

export type Container = {
  config: Config;
  db: Database;
};

export function createContainer(): Container {
  const config = loadConfig();
  const db = getDatabase(config.databaseUrl);

  return { config, db };
}
