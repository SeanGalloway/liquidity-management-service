import { Badge } from '@client/components/ui/badge';
import { formatKind } from '@client/lib/format';
import { cn } from '@client/lib/utils';
import type { OrderStatus, SecurityKind } from '@client/types';

const KIND_STYLES: Record<SecurityKind, string> = {
  bill: 'bg-bill-soft text-bill',
  note: 'bg-note-soft text-note',
  bond: 'bg-bond-soft text-bond',
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-pending-soft text-pending',
  executed: 'bg-positive-soft text-positive',
  rejected: 'bg-negative-soft text-negative',
  failed: 'bg-negative-soft text-negative',
};

const BASE = 'rounded px-2 py-0.5 text-xs font-semibold';

export function KindBadge({ kind }: { kind: SecurityKind }) {
  return <Badge className={cn(BASE, KIND_STYLES[kind])}>{formatKind(kind)}</Badge>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge className={cn(BASE, STATUS_STYLES[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
