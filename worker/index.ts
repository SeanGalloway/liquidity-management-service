import { SCHEDULE, type ScheduledJob } from './schedule';

const API_BASE = `${requireEnv('APP_URL')}/api/v1`;
const JOB_TOKEN = requireEnv('JOB_TOKEN');
const HEALTH_RETRY_MS = 2000;

const timers = new Set<NodeJS.Timeout>();
let stopping = false;

async function main() {
  await waitForHealthyApp();

  for (const job of SCHEDULE) {
    scheduleNextRun(job, job.runOnStart ? 0 : job.everyMs);
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`worker started: ${SCHEDULE.map((job) => job.path).join(', ')}`);
}

function scheduleNextRun(job: ScheduledJob, delayMs: number) {
  if (stopping) return;

  const timer = setTimeout(async () => {
    timers.delete(timer);
    await triggerJob(job);
    scheduleNextRun(job, job.everyMs);
  }, delayMs);

  timers.add(timer);
}

async function triggerJob(job: ScheduledJob) {
  const startedAt = Date.now();

  try {
    const response = await fetch(`${API_BASE}${job.path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${JOB_TOKEN}` },
    });
    const body = await response.text();

    console.log(`${job.path} ${response.status} ${Date.now() - startedAt}ms ${body}`);
  } catch (error) {
    console.error(`${job.path} failed`, error);
  }
}

async function waitForHealthyApp() {
  while (!stopping) {
    const healthy = await fetch(`${API_BASE}/health`)
      .then((response) => response.ok)
      .catch(() => false);

    if (healthy) return;

    console.log(`waiting for ${API_BASE}/health`);
    await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_MS));
  }
}

function stop() {
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  console.log('worker stopped');
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

await main();
