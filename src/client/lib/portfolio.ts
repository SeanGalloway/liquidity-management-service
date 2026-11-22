import type { Holding, Timeline, TimelineEvent } from '../types';
import { formatKind } from './format';
import { toUtcMs } from './dates';

export type PortfolioSummary = {
  holdingCount: number;
  investedFaceCents: number;
  averageYieldBps: number | null;
  interestToMaturityCents: number;
  nextMaturity: { date: string; faceCents: number } | null;
};

export type CashflowChip = { date: string; label: string; amountCents: number };

export type TimelinePoint = { t: number; actual?: number; projected?: number };

export type MaturityMarker = { t: number; date: string; amountCents: number; balanceCents: number };

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function calculateNextMaturity(holdings: Holding[]) {
  const dates = holdings.map((holding) => holding.security.maturityDate).sort();
  const date = dates[0];
  if (!date) return null;

  const maturing = holdings.filter((holding) => holding.security.maturityDate === date);
  return { date, faceCents: sum(maturing.map((holding) => holding.faceCents)) };
}

export function calculatePortfolioSummary(holdings: Holding[]): PortfolioSummary {
  const investedFaceCents = sum(holdings.map((holding) => holding.faceCents));
  const weightedYield = sum(
    holdings.map((holding) => holding.purchaseYieldBps * holding.faceCents),
  );

  return {
    holdingCount: holdings.length,
    investedFaceCents,
    averageYieldBps: investedFaceCents > 0 ? weightedYield / investedFaceCents : null,
    interestToMaturityCents: sum(holdings.map((holding) => holding.interestToMaturityCents)),
    nextMaturity: calculateNextMaturity(holdings),
  };
}

function labelCashflowGroup(events: TimelineEvent[], kindByHolding: Map<string, string>) {
  if (events[0]?.kind === 'coupon') return events.length > 1 ? 'Coupons' : 'Coupon';

  const kinds = new Set(events.map((event) => kindByHolding.get(event.holdingId) ?? 'Maturity'));
  return kinds.size === 1 ? [...kinds][0]! : 'Maturities';
}

export function calculateCashflowChips(
  events: TimelineEvent[],
  holdings: Holding[],
  limit = 6,
): CashflowChip[] {
  const kindByHolding = new Map(holdings.map((h) => [h.id, formatKind(h.security.kind)]));
  const groups = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const key = `${event.date}|${event.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.values()].slice(0, limit).map((group) => ({
    date: group[0]!.date,
    label: labelCashflowGroup(group, kindByHolding),
    amountCents: sum(group.map((event) => event.amountCents)),
  }));
}

export function calculateTimelineSeries(timeline: Timeline, horizon: string): TimelinePoint[] {
  const points = new Map<number, TimelinePoint>();
  const upsert = (t: number, patch: Partial<TimelinePoint>) =>
    points.set(t, { ...points.get(t), t, ...patch });

  for (const point of timeline.actual) upsert(toUtcMs(point.date), { actual: point.balanceCents });
  for (const point of timeline.projected) {
    upsert(toUtcMs(point.date), { projected: point.balanceCents });
  }

  const last = timeline.projected.at(-1);
  if (last && horizon > last.date) upsert(toUtcMs(horizon), { projected: last.balanceCents });

  return [...points.values()].sort((a, b) => a.t - b.t);
}

export function calculateMaturityMarkers(timeline: Timeline): MaturityMarker[] {
  const balanceByDate = new Map(timeline.projected.map((p) => [p.date, p.balanceCents]));
  const markers = new Map<string, MaturityMarker>();

  for (const event of timeline.events.filter((e) => e.kind === 'principal')) {
    const existing = markers.get(event.date);
    markers.set(event.date, {
      t: toUtcMs(event.date),
      date: event.date,
      amountCents: (existing?.amountCents ?? 0) + event.amountCents,
      balanceCents: balanceByDate.get(event.date) ?? 0,
    });
  }

  return [...markers.values()];
}

export function calculateProjectedBalance(timeline: Timeline) {
  return timeline.projected.at(-1)?.balanceCents ?? timeline.actual.at(-1)?.balanceCents ?? 0;
}
