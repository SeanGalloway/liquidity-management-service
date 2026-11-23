import { formatBpsChange } from '@client/lib/format';

function toneFor(bps: number) {
  if (Math.round(bps) < 0) return 'text-positive';
  if (Math.round(bps) > 0) return 'text-negative';
  return 'text-muted';
}

export function ChangeText({ bps }: { bps: number | null }) {
  if (bps === null) return <span className="text-muted">—</span>;
  return <span className={toneFor(bps)}>{formatBpsChange(bps)}</span>;
}
