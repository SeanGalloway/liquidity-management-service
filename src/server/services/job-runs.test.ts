import { describe, expect, it, vi } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createJobRunsService } from './job-runs';

describe('runExclusiveJob', () => {
  it('skips without recording when another run holds the lock', async () => {
    const { db, sql } = createRecordingDb([[{ acquired: false }]]);
    const work = vi.fn();

    const outcome = await createJobRunsService({ db }).runExclusiveJob('poll-yields', work);

    expect(outcome).toEqual({ status: 'skipped' });
    expect(work).not.toHaveBeenCalled();
    expect(sql()).toHaveLength(1);
  });

  it('records the run, stores its result and releases the lock', async () => {
    const { db, sql, queries } = createRecordingDb([
      [{ acquired: true }],
      [{ id: 'run-1' }],
      [{ id: 'run-1' }],
      [],
    ]);

    const outcome = await createJobRunsService({ db }).runExclusiveJob('poll-yields', async () => ({
      inserted: 14,
    }));

    expect(outcome).toEqual({ status: 'succeeded', result: { inserted: 14 } });
    expect(sql()[1]).toContain('insert into "job_runs"');
    expect(queries[2]?.parameters).toContain('{"inserted":14}');
    expect(sql()[3]).toContain('pg_advisory_unlock');
  });

  it('marks the run failed and rethrows', async () => {
    const { db, queries, sql } = createRecordingDb([
      [{ acquired: true }],
      [{ id: 'run-1' }],
      [{ id: 'run-1' }],
      [],
    ]);

    const attempt = createJobRunsService({ db }).runExclusiveJob('poll-yields', async () => {
      throw new Error('treasury down');
    });

    await expect(attempt).rejects.toThrow('treasury down');
    expect(queries[2]?.parameters).toContain('failed');
    expect(sql()[3]).toContain('pg_advisory_unlock');
  });

  it('maps the latest run to a job status', async () => {
    const { db } = createRecordingDb([[{ status: 'succeeded' }], []]);
    const service = createJobRunsService({ db });

    expect(await service.getJobStatus('backfill-yields')).toBe('done');
    expect(await service.getJobStatus('backfill-yields')).toBe('idle');
  });
});
