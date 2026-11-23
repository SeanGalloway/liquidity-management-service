'use client';

import 'client-only';
import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@client/components/ui/button';
import { useResetPortfolio } from '@client/queries';
import type { SetupStatus } from '@client/types';

function ResetPortfolio() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const reset = useResetPortfolio();

  function confirmReset() {
    reset.mutate(undefined, {
      onSuccess: () => router.replace('/setup'),
      onSettled: () => dialog.current?.close(),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-simulation-line bg-simulation-soft p-4">
      <div>
        <h2 className="text-sm font-semibold text-simulation">Reset portfolio</h2>
        <p className="mt-1 text-[13px] text-simulation">
          Erases the cash balance, holdings, orders and ledger history. Stored Treasury yields are
          kept, so you can set up again right away.
        </p>
      </div>
      {reset.error && (
        <p role="alert" className="text-sm text-negative">
          Reset failed: {reset.error.message}
        </p>
      )}
      <Button
        type="button"
        variant="destructive"
        className="self-start"
        onClick={() => dialog.current?.showModal()}
      >
        Reset portfolio
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="reset-portfolio-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-card border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <h2 id="reset-portfolio-title" className="text-base font-semibold">
          Reset the portfolio?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This permanently deletes the balance, every holding and order, and the ledger. It cannot
          be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reset.isPending}
            onClick={confirmReset}
          >
            {reset.isPending ? 'Resetting…' : 'Reset portfolio'}
          </Button>
        </div>
      </dialog>
    </div>
  );
}

export function ManageDesk({ status }: { status: SetupStatus }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm">
        Your desk is set up with {status.yields.rows.toLocaleString('en-US')} stored yield
        observations.
      </p>
      <Link
        href="/portfolio"
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-[15px] font-semibold text-white hover:bg-accent-hover"
      >
        Open portfolio
      </Link>
      {status.resetEnabled && <ResetPortfolio />}
    </div>
  );
}
