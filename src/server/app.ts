import 'server-only';
import { swaggerUI } from '@hono/swagger-ui';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import type { Container } from './container';
import { handleError, handleNotFound } from './middleware/error-handler';
import { createRouter } from './openapi';
import { createRoutes } from './routes';

export const API_BASE_PATH = '/api/v1';

export function createApp(container: Container) {
  const app = createRouter().basePath(API_BASE_PATH);

  app.use(requestId());
  app.use(logger());
  app.use('/jobs/*', bearerAuth({ token: container.config.jobToken }));

  app.onError(handleError);
  app.notFound(handleNotFound);

  app.openAPIRegistry.registerComponent('securitySchemes', 'jobToken', {
    type: 'http',
    scheme: 'bearer',
    description: 'JOB_TOKEN — used by the worker scheduler',
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Liquidity Management API', version: '1.0.0' },
    servers: [{ url: '/' }],
  });

  app.get('/docs', swaggerUI({ url: `${API_BASE_PATH}/openapi.json` }));

  return app.route('/', createRoutes(container));
}
