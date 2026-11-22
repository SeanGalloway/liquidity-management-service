import 'server-only';
import { Hono } from 'hono';
import type { Container } from './container';
import { healthRoutes } from './handlers/health';
import { jobRoutes } from './handlers/jobs';

export function createRoutes(container: Container) {
  return new Hono().route('/health', healthRoutes(container)).route('/jobs', jobRoutes());
}

export type ApiRoutes = ReturnType<typeof createRoutes>;
