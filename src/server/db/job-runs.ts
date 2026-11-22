import 'server-only';
import { sql, type Selectable } from 'kysely';
import type { Executor } from './client';
import type { JobRuns, Json } from './schema';

export type JobRun = Selectable<JobRuns>;

export type JobRunOutcome =
  { status: 'succeeded'; result: Json } | { status: 'failed'; error: string };

export function insertJobRun(job: string, ex: Executor): Promise<JobRun> {
  return ex
    .insertInto('jobRuns')
    .values({ job, status: 'running' })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function markJobRunFinished(
  id: string,
  outcome: JobRunOutcome,
  ex: Executor,
): Promise<JobRun> {
  return ex
    .updateTable('jobRuns')
    .set({
      status: outcome.status,
      finishedAt: sql`now()`,
      result: outcome.status === 'succeeded' ? JSON.stringify(outcome.result) : null,
      error: outcome.status === 'failed' ? outcome.error : null,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function findLatestJobRun(job: string, ex: Executor): Promise<JobRun | undefined> {
  return ex
    .selectFrom('jobRuns')
    .selectAll()
    .where('job', '=', job)
    .orderBy('startedAt', 'desc')
    .limit(1)
    .executeTakeFirst();
}
