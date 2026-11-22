import 'server-only';
import { z } from 'zod';

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  JOB_TOKEN: z.string().min(16),
  TREASURY_BASE_URL: z.string().url().default('https://home.treasury.gov'),
});

export type Config = {
  databaseUrl: string;
  jobToken: string;
  treasuryBaseUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    jobToken: parsed.JOB_TOKEN,
    treasuryBaseUrl: parsed.TREASURY_BASE_URL,
  };
}
