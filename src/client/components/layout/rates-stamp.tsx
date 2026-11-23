'use client';

import 'client-only';
import { formatDate } from '@client/lib/format';
import { useCurve } from '@client/queries';

function formatSource(source: string) {
  return source === 'treasury.gov' ? 'Treasury.gov' : source;
}

export function RatesStamp() {
  const { data: curve, error } = useCurve('latest');
  if (error) return <span className="text-[13px] text-negative">Rates unavailable</span>;
  if (!curve) return null;

  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
      Rates as of {formatDate(curve.asOf)} close · {formatSource(curve.source)}
    </span>
  );
}
