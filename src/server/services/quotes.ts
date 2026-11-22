import 'server-only';
import type { Clock, IsoDate } from '../domain/types';
import { rollForwardToBusinessDay } from '../pricing/calendar';
import { calculateQuote, type Quote } from '../pricing/quote';
import type { SecurityResolver } from './security-resolver';
import type { YieldsService } from './yields';

type Dependencies = {
  clock: Clock;
  yields: YieldsService;
  securityResolver: SecurityResolver;
};

export function createQuotesService({ clock, yields, securityResolver }: Dependencies) {
  async function quoteOrder(maturityDate: IsoDate, faceCents: number): Promise<Quote> {
    const curve = await yields.getCurve('latest');
    const settleDate = rollForwardToBusinessDay(clock.today());

    const security = securityResolver.resolveSecurity(maturityDate, curve, settleDate);

    return calculateQuote({ security, curve, faceCents, settleDate });
  }

  return { quoteOrder };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
