'use client';

import 'client-only';
import { KpiGroup, KpiTile } from '@client/components/kpi';
import { calculateSpreads, type TenorRow } from '@client/lib/curve';
import { formatBpsAsPercent, formatBpsChange } from '@client/lib/format';
import { ChangeText } from './change-text';

function YieldValue({ row }: { row: TenorRow | null }) {
  if (!row) return '—';
  return (
    <>
      {formatBpsAsPercent(row.yieldBps)}{' '}
      {row.change1mBps !== null && (
        <span className="text-[13px] font-semibold">
          <ChangeText bps={row.change1mBps} /> 1M
        </span>
      )}
    </>
  );
}

function formatSpread(bps: number | null) {
  return bps === null ? '—' : formatBpsChange(bps);
}

export function SpreadKpis({ rows }: { rows: TenorRow[] }) {
  const spreads = calculateSpreads(rows);

  return (
    <KpiGroup label="Spreads">
      <KpiTile label="3-month" value={<YieldValue row={spreads.threeMonth} />} />
      <KpiTile label="10-year" value={<YieldValue row={spreads.tenYear} />} />
      <KpiTile label="10Y − 3M spread" value={formatSpread(spreads.tenMinusThreeBps)} />
      <KpiTile label="10Y − 2Y spread" value={formatSpread(spreads.tenMinusTwoBps)} />
    </KpiGroup>
  );
}
