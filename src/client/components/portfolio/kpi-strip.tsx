'use client';

import 'client-only';
import { KpiGroup, KpiTile } from '@client/components/kpi';
import { calculateDaysBetween, getTodayInNewYork } from '@client/lib/dates';
import {
  formatBpsAsPercent,
  formatCents,
  formatDate,
  formatSignedWholeDollars,
  formatWholeDollars,
} from '@client/lib/format';
import { calculatePortfolioSummary, type PortfolioSummary } from '@client/lib/portfolio';
import { useBalance, useHoldings } from '@client/queries';
import type { Balance } from '@client/types';

function describePending(balance: Balance | undefined) {
  const { count, faceCents } = balance?.pendingOrders ?? { count: 0, faceCents: 0 };
  if (count === 0) return 'No orders pending';
  return `${count} ${count === 1 ? 'order' : 'orders'} pending · ${formatWholeDollars(faceCents)}`;
}

function describeHoldings(summary: PortfolioSummary) {
  const count = `${summary.holdingCount} ${summary.holdingCount === 1 ? 'holding' : 'holdings'}`;
  if (summary.averageYieldBps === null) return count;
  return `${count} · avg yield ${formatBpsAsPercent(summary.averageYieldBps)}`;
}

function describeNextMaturity(summary: PortfolioSummary) {
  if (!summary.nextMaturity) return 'Nothing scheduled';
  const days = calculateDaysBetween(getTodayInNewYork(), summary.nextMaturity.date);
  return `${formatDate(summary.nextMaturity.date)} · in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function KpiStrip() {
  const balance = useBalance();
  const holdings = useHoldings();
  const summary = calculatePortfolioSummary(holdings.data ?? []);
  const placeholder = holdings.data ? null : '—';

  return (
    <KpiGroup label="Summary">
      <KpiTile
        label="Cash balance"
        value={balance.data ? formatCents(balance.data.amountCents) : '—'}
        detail={describePending(balance.data)}
      />
      <KpiTile
        label="Invested (face)"
        value={placeholder ?? formatWholeDollars(summary.investedFaceCents)}
        detail={describeHoldings(summary)}
      />
      <KpiTile
        label="Next maturity"
        value={placeholder ?? formatWholeDollars(summary.nextMaturity?.faceCents ?? 0)}
        detail={describeNextMaturity(summary)}
      />
      <KpiTile
        label="Interest to maturity"
        value={placeholder ?? formatSignedWholeDollars(summary.interestToMaturityCents)}
        valueClass="text-positive"
        detail="Discount accretion + coupons"
      />
    </KpiGroup>
  );
}
