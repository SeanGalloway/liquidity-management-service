import 'server-only';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DomainError } from '../domain/errors';

export function handleError(error: Error, c: Context) {
  if (error instanceof DomainError) {
    return c.json(errorBody(error.code, error.message, error.details), error.status);
  }

  if (error instanceof HTTPException && error.status === 401) {
    return c.json(errorBody('UNAUTHORIZED', 'Missing or invalid job token'), 401);
  }

  console.error({ requestId: c.get('requestId'), error });
  return c.json(errorBody('INTERNAL', 'Unexpected server error'), 500);
}

export function handleNotFound(c: Context) {
  return c.json(errorBody('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`), 404);
}

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } };
}
