export type ScheduledJob = {
  path: string;
  everyMs: number;
  runOnStart: boolean;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

export const SCHEDULE: ScheduledJob[] = [
  { path: '/jobs/fill-orders', everyMs: 10 * SECOND, runOnStart: true },
  { path: '/jobs/sync-yields', everyMs: 15 * MINUTE, runOnStart: true },
  { path: '/jobs/pay-cashflows', everyMs: DAY, runOnStart: true },
];
