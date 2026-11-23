'use client';

import 'client-only';
import type { ReactNode } from 'react';
import { KindBadge } from '@client/components/badges';
import {
  formatBpsAsPercent,
  formatCents,
  formatDate,
  formatSignedCents,
  formatWholeDollars,
} from '@client/lib/format';
import type { Quote } from '@client/types';

function Row({
  label,
  children,
  strong,
}: {
  label: ReactNode;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={strong ? 'flex justify-between gap-4 font-semibold' : 'flex justify-between gap-4'}
    >
      <span className={strong ? undefined : 'text-muted'}>{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function calculateCouponTotal(quote: Quote) {
  return quote.cashflows
    .filter((cashflow) => cashflow.kind === 'coupon')
    .reduce((total, cashflow) => total + cashflow.amountCents, 0);
}

function PlainSummary({ quote, faceCents }: { quote: Quote; faceCents: number }) {
  const coupons = calculateCouponTotal(quote);

  return (
    <p className="pb-1 leading-normal">
      Pay about <strong>{formatWholeDollars(quote.totalCents)}</strong> today, receive{' '}
      <strong>{formatWholeDollars(faceCents)}</strong> on{' '}
      <strong>{formatDate(quote.maturityDate)}</strong>
      {coupons > 0 && (
        <>
          {' '}
          plus <strong>{formatWholeDollars(coupons)}</strong> in coupons along the way
        </>
      )}
      .
    </p>
  );
}

type QuoteSummaryProps = { quote: Quote; faceCents: number; balanceCents: number | undefined };

export function QuoteSummary({ quote, faceCents, balanceCents }: QuoteSummaryProps) {
  const cashAfter = balanceCents === undefined ? null : balanceCents - quote.totalCents;
  const interpolation = quote.interpolatedFrom.join('–');

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-divider bg-subtle px-4 py-3.5 text-sm">
      <PlainSummary quote={quote} faceCents={faceCents} />
      <Row label="Instrument">
        <KindBadge kind={quote.kind} /> {quote.days} days
      </Row>
      <Row
        label={
          <>
            Yield <span className="text-xs">({interpolation} interp.)</span>
          </>
        }
      >
        <span className="font-semibold">{formatBpsAsPercent(quote.yieldBps)}</span>
      </Row>
      {quote.couponRateBps !== null && (
        <Row label="Coupon">{formatBpsAsPercent(quote.couponRateBps, 3)} semi-annual</Row>
      )}
      <Row label="Price per $100">{quote.pricePer100}</Row>
      <Row label="Accrued interest">{formatCents(quote.accruedCents)}</Row>
      <div className="h-px bg-border" />
      <Row label="Estimated cost" strong>
        {formatCents(quote.totalCents)}
      </Row>
      <Row label="Interest to maturity">
        <span className="text-positive">{formatSignedCents(quote.interestToMaturityCents)}</span>
      </Row>
      {cashAfter !== null && (
        <Row label="Cash after">
          <span className={cashAfter < 0 ? 'font-semibold text-negative' : undefined}>
            {formatCents(cashAfter)}
          </span>
        </Row>
      )}
      {cashAfter !== null && cashAfter < 0 && (
        <p className="text-[13px] text-negative">
          More than your cash balance — this order would be rejected.
        </p>
      )}
    </div>
  );
}
