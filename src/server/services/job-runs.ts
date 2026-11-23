import 'server-only';
import { withSessionAdvisoryLock } from '../db/advisory-lock';
import type { Database } from '../db/client';
import {
  findLatestJobRun,
  insertJobRun,
  markJobRunFinished,
  markStaleJobRunsFailed,
  type JobRunStatus,
} from '../db/job-runs';
import type { Json } from '../db/schema';

export const JOBS = {
  syncYields: 'sync-yields',
  payCashflows: 'pay-cashflows',
} as const;

export type JobStatus = 'idle' | 'running' | 'done' | 'failed';

export type ExclusiveJobOutcome<T> = { status: 'skipped' } | { status: 'succeeded'; result: T };

const RUN_STATUS_TO_JOB_STATUS: Record<JobRunStatus, JobStatus> = {
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
};

export function createJobRunsService({ db }: { db: Database }) {
  async function runExclusiveJob<T extends Json>(
    job: string,
    work: () => Promise<T>,
  ): Promise<ExclusiveJobOutcome<T>> {
    const locked = await withSessionAdvisoryLock(db, job, () => runRecordedJob(job, work));

    return locked.acquired ? { status: 'succeeded', result: locked.result } : { status: 'skipped' };
  }

  async function runRecordedJob<T extends Json>(job: string, work: () => Promise<T>) {
    await markStaleJobRunsFailed(job, db);
    const run = await insertJobRun(job, db);

    try {
      const result = await work();
      await markJobRunFinished(run.id, { status: 'succeeded', result }, db);
      return result;
    } catch (error) {
      await markJobRunFinished(run.id, { status: 'failed', error: describeError(error) }, db).catch(
        (recordError) => console.error(`failed to record ${job} failure`, recordError),
      );
      throw error;
    }
  }

  async function getJobStatus(job: string): Promise<JobStatus> {
    const run = await findLatestJobRun(job, db);
    return run ? RUN_STATUS_TO_JOB_STATUS[run.status] : 'idle';
  }

  return { runExclusiveJob, getJobStatus };
}

export type JobRunsService = ReturnType<typeof createJobRunsService>;

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
