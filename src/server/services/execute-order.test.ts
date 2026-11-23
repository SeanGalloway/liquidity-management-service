import { describe, expect, it } from 'vitest';
import { DomainError } from '@server/domain/errors';
import { PENDING_ORDER } from '@test/fixtures/orders';
import { createFakeClock } from '@test/helpers/fake-clock';
import { createCurveQuotes } from '@test/helpers/quotes';
import { createExecuteOrder } from './execute-order';
import type { QuotesService } from './quotes';

const clock = createFakeClock('2026-11-22T17:00:05Z');

function failingQuotes(error: Error): QuotesService {
  return {
    quoteOrder: async () => {
      throw error;
    },
  };
}

describe('executeOrder', () => {
  it('fills at the latest close, re-priced at execution time', async () => {
    const executeOrder = createExecuteOrder({ quotes: createCurveQuotes(clock), clock });

    const execution = await executeOrder(PENDING_ORDER);

    expect(execution.status).toBe('filled');
    if (execution.status !== 'filled') return;
    expect(execution.fill.executedAt).toEqual(clock.now());
    expect(execution.fill.totalCents).toBe(73_992_886);
    expect(execution.fill.security.kind).toBe('bill');
  });

  it('rejects when there is no market data', async () => {
    const quotes = failingQuotes(new DomainError('NO_MARKET_DATA', 'empty'));

    const execution = await createExecuteOrder({ quotes, clock })(PENDING_ORDER);

    expect(execution).toEqual({ status: 'rejected', reason: 'NO_MARKET_DATA' });
  });

  it('rejects when the maturity is no longer valid at execution time', async () => {
    const quotes = failingQuotes(new DomainError('VALIDATION_FAILED', 'too soon'));

    const execution = await createExecuteOrder({ quotes, clock })(PENDING_ORDER);

    expect(execution).toEqual({ status: 'rejected', reason: 'MATURITY_NO_LONGER_VALID' });
  });

  it('rethrows unexpected errors so the fill can be marked failed', async () => {
    const quotes = failingQuotes(new Error('connection reset'));

    await expect(createExecuteOrder({ quotes, clock })(PENDING_ORDER)).rejects.toThrow(
      'connection reset',
    );
  });
});
