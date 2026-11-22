import 'server-only';
import type { Database } from '../db/client';
import { findLatestJobRun, insertJobRun, markJobRunFinished } from '../db/job-runs';
import type { Json } from '../db/schema';
import { withAdvisoryLock } from '../db/transaction';

export const JOBS = {
  backfillYields: 'backfill-yields',
  pollYields: 'poll-yields',
  payCashflows: 'pay-cashflows',
} as const;

export type JobStatus = 'idle' | 'running' | 'done' | 'failed';

export type ExclusiveJobOutcome<T> = { status: 'skipped' } | { status: 'succeeded'; result: T };

const RUN_STATUS_TO_JOB_STATUS: Record<string, JobStatus> = {
  running: 'running',
  succeeded: 'done',
  failed: 'failed',
};

export function createJobRunsService({ db }: { db: Database }) {
  async function runExclusiveJob<T extends Json>(
    job: string,
    work: () => Promise<T>,
  ): Promise<ExclusiveJobOutcome<T>> {
    const locked = await withAdvisoryLock(db, job, () => runRecordedJob(job, work));

    return locked.acquired ? { status: 'succeeded', result: locked.result } : { status: 'skipped' };
  }

  async function runRecordedJob<T extends Json>(job: string, work: () => Promise<T>) {
    const run = await insertJobRun(job, db);

    try {
      const result = await work();
      await markJobRunFinished(run.id, { status: 'succeeded', result }, db);
      return result;
    } catch (error) {
      await markJobRunFinished(run.id, { status: 'failed', error: String(error) }, db);
      throw error;
    }
  }

  async function getJobStatus(job: string): Promise<JobStatus> {
    const run = await findLatestJobRun(job, db);
    return run ? (RUN_STATUS_TO_JOB_STATUS[run.status] ?? 'idle') : 'idle';
  }

  return { runExclusiveJob, getJobStatus };
}

export type JobRunsService = ReturnType<typeof createJobRunsService>;
