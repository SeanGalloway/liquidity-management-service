'use client';

import 'client-only';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@client/components/ui/button';
import {
  formatBpsAsPercent,
  formatCents,
  formatInstantDate,
  formatSecurityName,
} from '@client/lib/format';
import type { Quote } from '@client/types';

type ConfirmOrderDialogProps = {
  quote: Quote;
  faceCents: number;
  onConfirm: () => void;
  onCancel: () => void;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function ConfirmOrderDialog({
  quote,
  faceCents,
  onConfirm,
  onCancel,
}: ConfirmOrderDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onCancel}
      aria-labelledby="confirm-order-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <h2 id="confirm-order-title" className="text-base font-semibold">
        Confirm buy order
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Review before sending. Orders can&apos;t be cancelled once placed.
      </p>

      <dl className="mt-4 flex flex-col gap-2 rounded-md border border-divider bg-subtle px-4 py-3 text-sm">
        <Row label="Security">{formatSecurityName(quote.kind, quote.maturityDate)}</Row>
        <Row label="Face amount">{formatCents(faceCents)}</Row>
        <Row label="Yield">{formatBpsAsPercent(quote.yieldBps)}</Row>
        <Row label="Estimated cost">{formatCents(quote.totalCents)}</Row>
        <Row label="Priced at">{formatInstantDate(quote.pricedAsOf)} close</Row>
      </dl>

      <p className="mt-3 text-xs leading-normal text-muted">
        Market order: it fills within seconds at the latest stored close, so the final cost can
        differ from this estimate if new rates arrive first.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
          Cancel
        </Button>
        <Button type="button" autoFocus onClick={onConfirm}>
          Confirm order
        </Button>
      </div>
    </dialog>
  );
}
