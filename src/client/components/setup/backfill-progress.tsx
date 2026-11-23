'use client';

import 'client-only';
import Link from 'next/link';
import { formatDate } from '@client/lib/format';
import type { SetupStatus } from '@client/types';

const HEADLINES = {
  idle: 'Starting the yield backfill…',
  running: 'Loading a year of Treasury par yield closes…',
  done: 'Yields loaded. Opening your portfolio…',
  failed: 'The yield backfill failed',
};

function describeCoverage(yields: SetupStatus['yields']) {
  if (!yields.earliest || !yields.latest) return 'No closes stored yet';
  return `${formatDate(yields.earliest)} → ${formatDate(yields.latest)}`;
}

export function BackfillProgress({ yields }: { yields: SetupStatus['yields'] }) {
  const failed = yields.backfill === 'failed';

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <p className="text-[15px] font-semibold">{HEADLINES[yields.backfill]}</p>

      {!failed && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-divider"
          role="progressbar"
          aria-label="Yield backfill"
          aria-valuetext={`${yields.rows} rows stored`}
        >
          <div
            className={
              yields.backfill === 'done'
                ? 'h-full w-full bg-accent'
                : 'h-full w-1/3 animate-pulse rounded-full bg-accent'
            }
          />
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Source</dt>
        <dd>Treasury.gov daily par yield curve</dd>
        <dt className="text-muted">Rows stored</dt>
        <dd className="font-semibold">{yields.rows.toLocaleString('en-US')}</dd>
        <dt className="text-muted">Coverage</dt>
        <dd>{describeCoverage(yields)}</dd>
      </dl>

      {failed && (
        <p className="rounded-md bg-negative-soft px-4 py-3 text-sm text-negative">
          Your balance is saved. Check the server log, then retry the backfill with{' '}
          <code className="font-mono text-[13px]">POST /api/v1/jobs/sync-yields</code> (job token)
          and reload this page.
        </p>
      )}
      {failed && (
        <Link
          href="/portfolio"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:text-accent-hover"
        >
          Continue to portfolio without yield history →
        </Link>
      )}
    </div>
  );
}
