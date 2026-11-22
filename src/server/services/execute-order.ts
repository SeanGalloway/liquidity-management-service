import 'server-only';
import type { Order } from '../db/orders';
import { DomainError } from '../domain/errors';
import type { Clock } from '../domain/types';
import type { Quote } from '../pricing/quote';
import type { QuotesService } from './quotes';

export type Execution =
  { status: 'filled'; executedAt: Date; quote: Quote } | { status: 'rejected'; reason: string };

const REJECTION_BY_ERROR: Record<string, string> = {
  NO_MARKET_DATA: 'NO_MARKET_DATA',
  VALIDATION_FAILED: 'MATURITY_NO_LONGER_VALID',
};

export function createExecuteOrder({ quotes, clock }: { quotes: QuotesService; clock: Clock }) {
  return async function executeOrder(order: Order): Promise<Execution> {
    try {
      const quote = await quotes.quoteOrder(order.maturityDate, order.faceCents);
      return { status: 'filled', executedAt: clock.now(), quote };
    } catch (error) {
      const reason = error instanceof DomainError ? REJECTION_BY_ERROR[error.code] : undefined;
      if (!reason) throw error;

      return { status: 'rejected', reason };
    }
  };
}

export type ExecuteOrder = ReturnType<typeof createExecuteOrder>;
