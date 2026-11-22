export function createFakeClock(isoInstant: string) {
  let current = new Date(isoInstant);

  return {
    now: () => new Date(current),
    advanceMs: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
