import { describe, expect, it } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createApp } from './app';
import type { Container } from './container';

const JOB_TOKEN = 'test-job-token-0123456789';

function createTestApp() {
  const { db } = createRecordingDb();
  const container: Container = {
    config: {
      databaseUrl: 'postgres://unused',
      jobToken: JOB_TOKEN,
      treasuryBaseUrl: 'http://unused',
    },
    db,
  };

  return createApp(container);
}

describe('api app', () => {
  it('returns a JSON error for unknown routes', async () => {
    const response = await createTestApp().request('/api/v1/nope');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects job calls without the job token', async () => {
    const response = await createTestApp().request('/api/v1/jobs/fill-orders', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('accepts job calls with the job token', async () => {
    const response = await createTestApp().request('/api/v1/jobs/fill-orders', {
      method: 'POST',
      headers: { authorization: `Bearer ${JOB_TOKEN}` },
    });

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_IMPLEMENTED' } });
  });

  it('reports health with the latest yield date', async () => {
    const response = await createTestApp().request('/api/v1/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: 'up', latestYieldAsOf: null });
  });
});
