import 'server-only';
import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import type { Container } from './container';
import { handleError, handleNotFound } from './middleware/error-handler';
import { createRoutes } from './routes';

export const API_BASE_PATH = '/api/v1';

export function createApp(container: Container) {
  const app = new Hono().basePath(API_BASE_PATH);

  app.use(requestId());
  app.use(logger());
  app.use('/jobs/*', bearerAuth({ token: container.config.jobToken }));

  app.onError(handleError);
  app.notFound(handleNotFound);

  return app.route('/', createRoutes(container));
}
