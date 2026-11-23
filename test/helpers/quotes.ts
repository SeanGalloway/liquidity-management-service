import { createQuotesService } from '@server/services/quotes';
import { createSecurityResolver } from '@server/services/security-resolver';
import type { YieldsService } from '@server/services/yields';
import { NOV_20_2026_CURVE } from '@test/fixtures/curves';
import type { Clock } from '@server/domain/types';

export function createCurveQuotes(clock: Clock) {
  const yields = { getCurve: async () => NOV_20_2026_CURVE } as unknown as YieldsService;
  return createQuotesService({ clock, yields, securityResolver: createSecurityResolver() });
}
