import 'server-only';
import type Decimal from 'decimal.js';
import type { Order } from '../db/orders';
import { DomainError } from '../domain/errors';
import type { Clock, IsoDate, SecuritySpec } from '../domain/types';
import type { QuotesService } from './quotes';

export type Fill = {
  executedAt: Date;
  settleDate: IsoDate;
  security: SecuritySpec;
  yieldBps: Decimal;
  cleanCents: number;
  accruedCents: number;
  totalCents: number;
  pricedAsOf: Date;
};

export type Execution = { status: 'filled'; fill: Fill } | { status: 'rejected'; reason: string };

const REJECTION_BY_ERROR: Record<string, string> = {
  NO_MARKET_DATA: 'NO_MARKET_DATA',
  VALIDATION_FAILED: 'MATURITY_NO_LONGER_VALID',
};

export function createExecuteOrder({ quotes, clock }: { quotes: QuotesService; clock: Clock }) {
  return async function executeOrder(order: Order): Promise<Execution> {
    try {
      const quote = await quotes.quoteOrder(order.maturityDate, order.faceCents);

      return {
        status: 'filled',
        fill: {
          executedAt: clock.now(),
          settleDate: quote.settleDate,
          security: quote.security,
          yieldBps: quote.yieldBps,
          cleanCents: quote.cleanCents,
          accruedCents: quote.accruedCents,
          totalCents: quote.totalCents,
          pricedAsOf: quote.pricedAsOf,
        },
      };
    } catch (error) {
      const reason = error instanceof DomainError ? REJECTION_BY_ERROR[error.code] : undefined;
      if (!reason) throw error;

      return { status: 'rejected', reason };
    }
  };
}

export type ExecuteOrder = ReturnType<typeof createExecuteOrder>;
