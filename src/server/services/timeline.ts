import 'server-only';
import { findBalance } from '../db/balance';
import { findCashflows, type ScheduledCashflow } from '../db/cashflows';
import type { Database } from '../db/client';
import { findLedgerEntries, type LedgerEntry } from '../db/ledger';
import { toNewYorkDate } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { CashflowKind, Clock, IsoDate } from '../domain/types';

export type BalancePoint = { date: IsoDate; balanceCents: number };

export type TimelineEvent = {
  date: IsoDate;
  kind: CashflowKind;
  holdingId: string;
  amountCents: number;
};

export type Timeline = {
  today: IsoDate;
  lastMaturity: IsoDate | null;
  actual: BalancePoint[];
  projected: BalancePoint[];
  events: TimelineEvent[];
};

export function createTimelineService({ db, clock }: { db: Database; clock: Clock }) {
  async function getTimeline(to?: IsoDate): Promise<Timeline> {
    const today = clock.today();

    const entries = await findLedgerEntries({}, db);
    const balance = await findBalance(db);
    if (!balance) throw new DomainError('NOT_INITIALIZED', 'Run setup first');

    const scheduled = await findCashflows({ status: 'scheduled' }, db);
    const lastMaturity = calculateLastMaturity(scheduled);
    const horizon = to ?? lastMaturity ?? today;

    const events = scheduled
      .map((cashflow) => toEvent(cashflow, today))
      .filter((event) => event.date <= horizon);

    return {
      today,
      lastMaturity,
      actual: calculateDailyBalances(entries),
      projected: calculateProjection(balance.amountCents, today, events),
      events,
    };
  }

  return { getTimeline };
}

export type TimelineService = ReturnType<typeof createTimelineService>;

export function calculateDailyBalances(entries: LedgerEntry[]): BalancePoint[] {
  const closingByDate = new Map<IsoDate, number>();

  for (const entry of entries) {
    closingByDate.set(toNewYorkDate(entry.occurredAt), entry.balanceAfterCents);
  }

  return [...closingByDate].map(([date, balanceCents]) => ({ date, balanceCents }));
}

export function calculateProjection(
  balanceCents: number,
  today: IsoDate,
  events: TimelineEvent[],
): BalancePoint[] {
  const points: BalancePoint[] = [{ date: today, balanceCents }];
  let running = balanceCents;

  for (const event of events) {
    running += event.amountCents;

    const last = points[points.length - 1];
    if (last?.date === event.date) last.balanceCents = running;
    else points.push({ date: event.date, balanceCents: running });
  }

  return points;
}

function calculateLastMaturity(cashflows: ScheduledCashflow[]): IsoDate | null {
  const principalDates = cashflows
    .filter((cashflow) => cashflow.kind === 'principal')
    .map((cashflow) => cashflow.payDate);

  return principalDates.sort().at(-1) ?? null;
}

function toEvent(cashflow: ScheduledCashflow, today: IsoDate): TimelineEvent {
  return {
    date: cashflow.payDate < today ? today : cashflow.payDate,
    kind: cashflow.kind,
    holdingId: cashflow.holdingId,
    amountCents: cashflow.amountCents,
  };
}
