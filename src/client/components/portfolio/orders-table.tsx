'use client';

import 'client-only';
import { StatusBadge } from '@client/components/badges';
import { Button } from '@client/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/components/ui/table';
import {
  formatBpsAsPercent,
  formatCents,
  formatDate,
  formatDateTime,
  formatRejectReason,
  formatInstantDate,
  formatWholeDollars,
} from '@client/lib/format';
import type { useOrders } from '@client/queries';
import type { Order } from '@client/types';

function describeFill(order: Order) {
  if (order.fill) {
    return `${formatBpsAsPercent(order.fill.yieldBps)} · ${formatCents(order.fill.totalCents)}`;
  }
  if (order.status === 'pending') {
    return `Filling at ${formatInstantDate(order.quote.pricedAsOf)} close…`;
  }
  if (order.status === 'rejected') return formatRejectReason(order.rejectReason);
  return 'Execution failed';
}

function OrderRow({ order }: { order: Order }) {
  return (
    <TableRow>
      <TableCell>{formatDateTime(order.createdAt)}</TableCell>
      <TableCell>Buy</TableCell>
      <TableCell>{formatDate(order.maturityDate)}</TableCell>
      <TableCell className="text-right">{formatWholeDollars(order.faceCents)}</TableCell>
      <TableCell>
        <StatusBadge status={order.status} />
      </TableCell>
      <TableCell className="text-muted">{describeFill(order)}</TableCell>
    </TableRow>
  );
}

export function OrdersTable({ orders }: { orders: ReturnType<typeof useOrders> }) {
  const rows = orders.data?.pages.flatMap((page) => page.data) ?? [];

  if (orders.isPending) return <p className="px-3 py-8 text-center text-sm text-muted">Loading…</p>;
  if (orders.error && !orders.data) {
    return <p className="px-3 py-8 text-center text-sm text-negative">{orders.error.message}</p>;
  }
  if (rows.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted">No orders yet.</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Placed</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Maturity</TableHead>
            <TableHead className="text-right">Face</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fill</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </TableBody>
      </Table>
      {orders.hasNextPage && (
        <div className="flex justify-center py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void orders.fetchNextPage()}
            disabled={orders.isFetchingNextPage}
          >
            {orders.isFetchingNextPage ? 'Loading…' : 'Load more orders'}
          </Button>
        </div>
      )}
    </>
  );
}
