'use client';

import 'client-only';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@client/api';
import { Button } from '@client/components/ui/button';
import { formatDollarInput, formatInstantDate, parseDollarInput } from '@client/lib/format';
import { cn } from '@client/lib/utils';
import {
  useBalance,
  useOrder,
  usePlaceOrder,
  useQuote,
  useRefreshPortfolioOnBalanceChange,
} from '@client/queries';
import type { CreateOrderRequest, Quote } from '@client/types';
import { AmountField } from './amount-field';
import { ConfirmOrderDialog } from './confirm-order-dialog';
import { MaturityField } from './maturity-field';
import { OrderResult } from './order-result';
import { QuoteSummary } from './quote-summary';
import { focusFaceInput, TICKET_ID, useTicket } from './ticket-context';

const QUOTE_DEBOUNCE_MS = 300;
const FACE_STEP_CENTS = 10_000;
const DEFAULT_FACE_CENTS = 10_000_000;

type Submission = { key: string; request: CreateOrderRequest };
type PlaceOrder = ReturnType<typeof usePlaceOrder>;

function parseFaceCents(text: string) {
  const cents = parseDollarInput(text);
  if (cents === null || cents < FACE_STEP_CENTS || cents % FACE_STEP_CENTS !== 0) return null;
  return cents;
}

function useDebouncedOrderRequest(request: CreateOrderRequest | null) {
  const [debounced, setDebounced] = useState(request);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(request), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request]);

  return debounced;
}

function chooseSubmission(previous: Submission | null, request: CreateOrderRequest) {
  const unchanged =
    previous?.request.maturityDate === request.maturityDate &&
    previous.request.faceCents === request.faceCents;
  return unchanged ? previous : { key: crypto.randomUUID(), request };
}

type QuotePanelProps = { quote: ReturnType<typeof useQuote>; current: boolean };

function QuotePanel({ quote, current }: QuotePanelProps) {
  const balance = useBalance();

  if (quote.error) {
    return (
      <p role="alert" className="rounded-md bg-negative-soft px-4 py-3 text-sm text-negative">
        {quote.error.message}
      </p>
    );
  }
  if (!quote.data) return null;

  return (
    <div className={cn('transition-opacity', !current && 'opacity-60')}>
      <QuoteSummary
        quote={quote.data.quote}
        faceCents={quote.data.request.faceCents}
        balance={balance.data}
      />
    </div>
  );
}

function isRetryable(error: Error | null) {
  return error !== null && !(error instanceof ApiError && error.status < 500);
}

function SubmitControls({ placeOrder, ready }: { placeOrder: PlaceOrder; ready: boolean }) {
  const retryable = isRetryable(placeOrder.error);
  const label = retryable ? 'Retry order' : 'Place order';

  return (
    <>
      {placeOrder.error && (
        <p role="alert" className="text-sm text-negative">
          Order not sent: {placeOrder.error.message}
          {retryable && '. Retrying is safe: it reuses the same order key.'}
        </p>
      )}
      <Button type="submit" disabled={!ready || placeOrder.isPending}>
        {placeOrder.isPending ? 'Placing…' : label}
      </Button>
    </>
  );
}

function PricingNote({ quote }: { quote: Quote }) {
  return (
    <p className="text-xs leading-normal text-muted">
      Priced at the {formatInstantDate(quote.pricedAsOf)} close. Market order — fills in a few
      seconds at the latest stored close, which may differ from this estimate if new rates arrive
      first.
    </p>
  );
}

type TicketFormProps = {
  faceText: string;
  onFaceTextChange: (text: string) => void;
  placeOrder: PlaceOrder;
};

function TicketForm({ faceText, onFaceTextChange, placeOrder }: TicketFormProps) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [confirming, setConfirming] = useState<Submission | null>(null);
  const { maturityDate, prefillCount } = useTicket();
  const faceCents = parseFaceCents(faceText);
  const request = useMemo(
    () => (faceCents !== null && maturityDate ? { maturityDate, faceCents } : null),
    [maturityDate, faceCents],
  );
  const quoteRequest = useDebouncedOrderRequest(request);
  const quote = useQuote(quoteRequest);
  useEffect(() => {
    if (prefillCount > 0) focusFaceInput();
  }, [prefillCount]);
  const current = Boolean(quote.data) && !quote.isPlaceholderData && request === quoteRequest;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || !current) return;

    const next = chooseSubmission(submission, request);
    setSubmission(next);
    setConfirming(next);
  }

  function confirm() {
    if (!confirming) return;

    placeOrder.mutate(confirming);
    setConfirming(null);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]" noValidate>
      <MaturityField />
      <AmountField value={faceText} invalid={faceCents === null} onChange={onFaceTextChange} />
      {request && <QuotePanel quote={quote} current={current} />}
      <SubmitControls placeOrder={placeOrder} ready={current} />
      {quote.data && <PricingNote quote={quote.data.quote} />}
      {confirming && quote.data && (
        <ConfirmOrderDialog
          quote={quote.data.quote}
          faceCents={confirming.request.faceCents}
          onConfirm={confirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </form>
  );
}

export function OrderTicket() {
  const [faceText, setFaceText] = useState(formatDollarInput(DEFAULT_FACE_CENTS));
  const placeOrder = usePlaceOrder();
  const order = useOrder(placeOrder.data?.id ?? null);
  const { prefillCount } = useTicket();
  const handledPrefill = useRef(prefillCount);
  const { isPending, reset } = placeOrder;
  useRefreshPortfolioOnBalanceChange();

  useEffect(() => {
    if (prefillCount === handledPrefill.current) return;
    handledPrefill.current = prefillCount;
    if (!isPending) reset();
  }, [prefillCount, isPending, reset]);

  return (
    <aside
      id={TICKET_ID}
      aria-label="New order"
      className="flex scroll-mt-4 flex-col gap-[18px] rounded-card border border-border bg-surface px-6 pt-5 pb-6"
    >
      <div>
        <h2 className="text-base font-semibold">New order</h2>
        <p className="mt-1 text-[13px] text-muted">Buy · secondary market · held to maturity</p>
      </div>

      {order.data ? (
        <OrderResult order={order.data} onReset={placeOrder.reset} />
      ) : (
        <TicketForm faceText={faceText} onFaceTextChange={setFaceText} placeOrder={placeOrder} />
      )}
    </aside>
  );
}
