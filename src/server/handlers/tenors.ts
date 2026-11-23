import 'server-only';
import { createRoute } from '@hono/zod-openapi';
import { TenorList } from '@shared/contracts';
import type { Container } from '../container';
import type { Tenor } from '../db/tenors';
import { createRouter, jsonBody } from '../openapi';

const listTenors = createRoute({
  method: 'get',
  path: '/',
  tags: ['Market data'],
  summary: 'Reference tenors on the par yield curve',
  responses: { 200: jsonBody(TenorList, 'Tenors, shortest first') },
});

export function tenorRoutes({ yields }: Container) {
  return createRouter().openapi(listTenors, async (c) => {
    const tenors = await yields.listTenors();
    return c.json({ data: tenors.map(toTenorDto) }, 200);
  });
}

function toTenorDto(tenor: Tenor) {
  return {
    code: tenor.code,
    months: Number(tenor.months),
    kind: tenor.kind,
  };
}
