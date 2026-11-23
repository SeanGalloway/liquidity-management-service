import 'server-only';
import { findBalance } from '../db/balance';
import { findCashflows, type ScheduledCashflow } from '../db/cashflows';
import type { Database } from '../db/client';
import { findDailyClosingBalances, type DailyBalance } from '../db/ledger';
import { DomainError } from '../domain/errors';
import type { CashflowKind, Clock, IsoDate } from '../domain/types';

export type TimelineEvent = {
  date: IsoDate;
  kind: CashflowKind;
  holdingId: string;
  amountCents: number;
};

export type Timeline = {
  today: IsoDate;
  lastMaturity: IsoDate | null;
  actual: DailyBalance[];
  projected: DailyBalance[];
  events: TimelineEvent[];
};

export function createTimelineService({ db, clock }: { db: Database; clock: Clock }) {
  async function getTimeline(to?: IsoDate): Promise<Timeline> {
    const today = clock.today();
    if (to && to < today) {
      throw new DomainError('VALIDATION_FAILED', `to (${to}) is before today (${today})`);
    }

    return db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const balance = await findBalance(trx);
        if (!balance) throw new DomainError('NOT_INITIALIZED', 'Run setup first');

        const closes = await findDailyClosingBalances(trx);
        const actual = endAtToday(closes, today, balance.amountCents);
        const scheduled = await findCashflows({ status: 'scheduled' }, trx);

        const lastMaturity = calculateLastMaturity(scheduled);
        const horizon = to ?? lastMaturity ?? today;
        const events = scheduled
          .map((cashflow) => toEvent(cashflow, today))
          .filter((event) => event.date <= horizon);

        const projected = calculateProjection(balance.amountCents, today, horizon, events);

        return { today, lastMaturity, actual, projected, events };
      });
  }

  return { getTimeline };
}

export type TimelineService = ReturnType<typeof createTimelineService>;

export function calculateProjection(
  balanceCents: number,
  today: IsoDate,
  horizon: IsoDate,
  events: TimelineEvent[],
): DailyBalance[] {
  const points: DailyBalance[] = [{ date: today, balanceCents }];
  let running = balanceCents;

  for (const event of events) {
    running += event.amountCents;

    const last = points[points.length - 1];
    if (last?.date === event.date) last.balanceCents = running;
    else points.push({ date: event.date, balanceCents: running });
  }

  const last = points[points.length - 1];
  if (last && last.date < horizon) points.push({ date: horizon, balanceCents: running });

  return points;
}

function calculateLastMaturity(cashflows: ScheduledCashflow[]): IsoDate | null {
  return cashflows.findLast((cashflow) => cashflow.kind === 'principal')?.payDate ?? null;
}

function endAtToday(closes: DailyBalance[], today: IsoDate, balanceCents: number): DailyBalance[] {
  const last = closes[closes.length - 1];
  if (last?.date === today) return closes;

  return [...closes, { date: today, balanceCents }];
}

function toEvent(cashflow: ScheduledCashflow, today: IsoDate): TimelineEvent {
  return {
    date: cashflow.payDate < today ? today : cashflow.payDate,
    kind: cashflow.kind,
    holdingId: cashflow.holdingId,
    amountCents: cashflow.amountCents,
  };
}
