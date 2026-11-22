import 'server-only';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { z } from 'zod';
import { ErrorResponse } from '@shared/contracts';
import { DomainError } from './domain/errors';

export function createRouter() {
  return new OpenAPIHono({
    defaultHook: (result) => {
      if (!result.success) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Request validation failed',
          result.error.issues,
        );
      }
    },
  });
}

export function jsonBody<T extends z.ZodType>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

export function errorBody(description: string) {
  return jsonBody(ErrorResponse, description);
}
