const DAY_MS = 86_400_000;

export function toUtcMs(isoDate: string) {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function fromUtcMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function getTodayInNewYork(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

export function addDays(isoDate: string, days: number) {
  return fromUtcMs(toUtcMs(isoDate) + days * DAY_MS);
}

export function addMonths(isoDate: string, months: number) {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const whole = Math.floor(months);
  const lastDayOfTarget = new Date(Date.UTC(year, month - 1 + whole + 1, 0)).getUTCDate();
  const target = Date.UTC(year, month - 1 + whole, Math.min(day, lastDayOfTarget));

  return addDays(fromUtcMs(target), Math.round((months - whole) * 30));
}

export function calculateEarliestMaturity(today: string) {
  let date = addDays(today, 2);
  while ([0, 6].includes(new Date(toUtcMs(date)).getUTCDay())) date = addDays(date, 1);
  return date;
}

export function calculateDaysBetween(from: string, to: string) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}
