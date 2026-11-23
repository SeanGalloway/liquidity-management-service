'use client';

import 'client-only';
import { KindBadge } from '@client/components/badges';
import { useTicket } from '@client/components/ticket/ticket-context';
import { Button } from '@client/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@client/components/ui/table';
import type { TenorRow } from '@client/lib/curve';
import { addMonths, getTodayInNewYork } from '@client/lib/dates';
import { formatBpsAsPercent } from '@client/lib/format';
import { ChangeText } from './change-text';

function formatRange(row: TenorRow) {
  if (row.rangeLowBps === null || row.rangeHighBps === null) return '—';
  return `${(row.rangeLowBps / 100).toFixed(2)}–${formatBpsAsPercent(row.rangeHighBps)}`;
}

export function TenorTable({ rows }: { rows: TenorRow[] }) {
  const { prefillMaturity } = useTicket();
  const today = getTodayInNewYork();

  return (
    <section aria-label="Rates by tenor" className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-[18px] pb-2 sm:px-6">
        <h2 className="text-base font-semibold">Rates by tenor</h2>
        <span className="text-[13px] text-muted">
          Par yields, bond-equivalent basis · 6-month range from stored closes
        </span>
      </div>
      <div className="px-1 pb-2 sm:px-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenor</TableHead>
              <TableHead>Instrument</TableHead>
              <TableHead className="text-right">Yield</TableHead>
              <TableHead className="text-right">1W change</TableHead>
              <TableHead className="text-right">1M change</TableHead>
              <TableHead className="text-right">6M range</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.tenor}>
                <TableCell className="font-semibold">{row.tenor}</TableCell>
                <TableCell>
                  <KindBadge kind={row.kind} />
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatBpsAsPercent(row.yieldBps)}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeText bps={row.change1wBps} />
                </TableCell>
                <TableCell className="text-right">
                  <ChangeText bps={row.change1mBps} />
                </TableCell>
                <TableCell className="text-right text-muted">{formatRange(row)}</TableCell>
                <TableCell className="py-1.5 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Buy ${row.tenor}`}
                    onClick={() => prefillMaturity(addMonths(today, row.months))}
                  >
                    Buy
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
