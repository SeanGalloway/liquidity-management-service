import 'server-only';
import { createMiddleware } from 'hono/factory';
import type { Database } from '../db/client';
import { findBalance } from '../db/balance';
import { DomainError } from '../domain/errors';

export function requireSetup(db: Database) {
  return createMiddleware(async (_c, next) => {
    const balance = await findBalance(db);
    if (!balance) throw new DomainError('NOT_INITIALIZED', 'Run setup before using this endpoint');

    await next();
  });
}
