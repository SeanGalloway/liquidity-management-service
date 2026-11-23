'use client';

import 'client-only';
import { KindBadge } from '@client/components/badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/components/ui/table';
import { calculateDaysBetween, calculateTodayInNewYork } from '@client/lib/dates';
import {
  formatBpsAsPercent,
  formatCents,
  formatInstantDate,
  formatSecurityName,
  formatTermRemaining,
  formatWholeDollars,
} from '@client/lib/format';
import type { useHoldings } from '@client/queries';
import type { Holding } from '@client/types';

function HoldingRow({ holding, today }: { holding: Holding; today: string }) {
  const { security } = holding;

  return (
    <TableRow>
      <TableCell>
        <div className="font-semibold">
          {formatSecurityName(security.kind, security.maturityDate)}
        </div>
        <div className="text-xs text-muted">Bought {formatInstantDate(holding.purchasedAt)}</div>
      </TableCell>
      <TableCell>
        <KindBadge kind={security.kind} />
      </TableCell>
      <TableCell className="text-right">{formatWholeDollars(holding.faceCents)}</TableCell>
      <TableCell className="text-right">{formatCents(holding.totalCostCents)}</TableCell>
      <TableCell className="text-right">{formatBpsAsPercent(holding.purchaseYieldBps)}</TableCell>
      <TableCell className="text-right text-muted">
        {security.couponRateBps === null ? '—' : formatBpsAsPercent(security.couponRateBps, 3)}
      </TableCell>
      <TableCell className="text-right">
        {formatTermRemaining(calculateDaysBetween(today, security.maturityDate))}
      </TableCell>
    </TableRow>
  );
}

export function HoldingsTable({ holdings: query }: { holdings: ReturnType<typeof useHoldings> }) {
  const today = calculateTodayInNewYork();
  const holdings = query.data ?? [];

  if (query.isPending) return <p className="px-3 py-8 text-center text-sm text-muted">Loading…</p>;
  if (query.error && !query.data) {
    return <p className="px-3 py-8 text-center text-sm text-negative">{query.error.message}</p>;
  }
  if (holdings.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted">
        No holdings yet. Place an order from the ticket to buy your first Treasury.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Security</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Face</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Yield</TableHead>
          <TableHead className="text-right">Coupon</TableHead>
          <TableHead className="text-right">Matures in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => (
          <HoldingRow key={holding.id} holding={holding} today={today} />
        ))}
      </TableBody>
    </Table>
  );
}
