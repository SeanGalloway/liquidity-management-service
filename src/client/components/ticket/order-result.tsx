'use client';

import 'client-only';
import { StatusBadge } from '@client/components/badges';
import { Button } from '@client/components/ui/button';
import {
  formatBpsAsPercent,
  formatCents,
  formatDate,
  formatDateTime,
  formatInstantDate,
  formatRejectReason,
  formatWholeDollars,
} from '@client/lib/format';
import type { Order } from '@client/types';

function describeOutcome(order: Order) {
  if (order.status === 'pending') {
    return `Filling at the ${formatInstantDate(order.quote.pricedAsOf)} close…`;
  }
  if (order.status === 'executed' && order.fill) {
    const { yieldBps, totalCents, executedAt } = order.fill;
    return `Filled at ${formatBpsAsPercent(yieldBps)} for ${formatCents(totalCents)} · ${formatDateTime(executedAt)}`;
  }
  if (order.status === 'rejected') {
    return `${formatRejectReason(order.rejectReason)} — no cash moved.`;
  }
  return 'Execution failed — no cash moved. Try again.';
}

export function OrderResult({ order, onReset }: { order: Order; onReset: () => void }) {
  const pending = order.status === 'pending';

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-2.5 rounded-md border border-divider bg-subtle px-4 py-3.5 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold">
            Buy {formatWholeDollars(order.faceCents)} · {formatDate(order.maturityDate)}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <p className={pending ? 'animate-pulse text-muted' : 'text-muted'}>
          {describeOutcome(order)}
        </p>
      </div>

      <Button type="button" variant="outline" onClick={onReset}>
        New order
      </Button>
      {pending && (
        <p className="text-xs text-muted">
          You can start another order now; this one keeps filling and shows in the Orders tab.
        </p>
      )}
    </div>
  );
}
