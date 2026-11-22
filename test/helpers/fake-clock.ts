import { toNewYorkDate } from '@server/domain/dates';
import type { Clock } from '@server/domain/types';

export function createFakeClock(isoInstant: string): Clock & { advanceMs: (ms: number) => void } {
  let current = new Date(isoInstant);

  return {
    now: () => new Date(current),
    today: () => toNewYorkDate(current),
    advanceMs: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
