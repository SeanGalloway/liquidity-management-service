import { describe, expect, it, vi } from 'vitest';
import { createRecordingDb } from '@test/helpers/recording-db';
import { createJobRunsService } from './job-runs';

describe('runExclusiveJob', () => {
  it('skips without recording when another run holds the lock', async () => {
    const { db, sql } = createRecordingDb([[{ acquired: false }]]);
    const work = vi.fn();

    const outcome = await createJobRunsService({ db }).runExclusiveJob('sync-yields', work);

    expect(outcome).toEqual({ status: 'skipped' });
    expect(work).not.toHaveBeenCalled();
    expect(sql()).toHaveLength(1);
  });

  it('records the run, stores its result and releases the lock', async () => {
    const { db, sql, queries } = createRecordingDb([
      [{ acquired: true }],
      [],
      [{ id: 'run-1' }],
      [{ id: 'run-1' }],
      [],
    ]);

    const outcome = await createJobRunsService({ db }).runExclusiveJob('sync-yields', async () => ({
      inserted: 14,
    }));

    expect(outcome).toEqual({ status: 'succeeded', result: { inserted: 14 } });
    expect(sql()[1]).toBe(
      'update "job_runs" set "status" = $1, "finished_at" = now(), "error" = $2 where "job" = $3 and "status" = $4 returning *',
    );
    expect(sql()[2]).toContain('insert into "job_runs"');
    expect(queries[3]?.parameters).toContain('{"inserted":14}');
    expect(sql()[4]).toContain('pg_advisory_unlock');
  });

  it('marks the run failed and rethrows', async () => {
    const { db, queries, sql } = createRecordingDb([
      [{ acquired: true }],
      [],
      [{ id: 'run-1' }],
      [{ id: 'run-1' }],
      [],
    ]);

    const attempt = createJobRunsService({ db }).runExclusiveJob('sync-yields', async () => {
      throw new Error('treasury down');
    });

    await expect(attempt).rejects.toThrow('treasury down');
    expect(queries[3]?.parameters).toContain('failed');
    expect(String(queries[3]?.parameters[2])).toContain('Error: treasury down');
    expect(sql()[4]).toContain('pg_advisory_unlock');
  });

  it('keeps the original error when recording the failure also fails', async () => {
    const { db } = createRecordingDb([[{ acquired: true }], [], [{ id: 'run-1' }]]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const attempt = createJobRunsService({ db }).runExclusiveJob('sync-yields', async () => {
      throw new Error('treasury down');
    });

    await expect(attempt).rejects.toThrow('treasury down');
    expect(consoleError).toHaveBeenCalledWith(
      'failed to record sync-yields failure',
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('maps the latest run to a job status', async () => {
    const { db } = createRecordingDb([[{ status: 'succeeded' }], []]);
    const service = createJobRunsService({ db });

    expect(await service.getJobStatus('sync-yields')).toBe('done');
    expect(await service.getJobStatus('sync-yields')).toBe('idle');
  });
});
