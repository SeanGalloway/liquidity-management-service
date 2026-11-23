import 'server-only';
import { addMonths } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { Curve, IsoDate, SecurityKind, SecuritySpec } from '../domain/types';
import { rollForwardToBusinessDay } from '../pricing/calendar';
import { interpolateYield } from '../pricing/interpolate';
import { calculateCouponSchedule } from '../pricing/schedule';

const MAX_TERM_MONTHS = 360;
const BILL_MAX_MONTHS = 12;
const NOTE_MAX_MONTHS = 120;

export function createSecurityResolver() {
  function resolveSecurity(
    requestedMaturity: IsoDate,
    curve: Curve,
    settleDate: IsoDate,
  ): SecuritySpec {
    rejectOutOfRange(requestedMaturity, settleDate);

    const rolledMaturity = rollForwardToBusinessDay(requestedMaturity);
    const kind = classifyByTerm(settleDate, rolledMaturity);

    if (kind === 'bill') {
      return synthetic({
        kind,
        issueDate: settleDate,
        maturityDate: rolledMaturity,
        couponRateBps: null,
      });
    }

    const { yieldBps } = interpolateYield(curve.points, settleDate, requestedMaturity);
    const { previousCouponDate } = calculateCouponSchedule(settleDate, requestedMaturity);

    return synthetic({
      kind,
      issueDate: previousCouponDate,
      maturityDate: requestedMaturity,
      couponRateBps: yieldBps,
    });
  }

  return { resolveSecurity };
}

export type SecurityResolver = ReturnType<typeof createSecurityResolver>;

function rejectOutOfRange(requestedMaturity: IsoDate, settleDate: IsoDate) {
  if (requestedMaturity <= settleDate) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Maturity must be after settlement on ${settleDate}`,
    );
  }

  if (requestedMaturity > addMonths(settleDate, MAX_TERM_MONTHS)) {
    throw new DomainError('VALIDATION_FAILED', 'Maturity must be within 30 years');
  }
}

function classifyByTerm(settleDate: IsoDate, maturityDate: IsoDate): SecurityKind {
  if (maturityDate <= addMonths(settleDate, BILL_MAX_MONTHS)) return 'bill';
  if (maturityDate <= addMonths(settleDate, NOTE_MAX_MONTHS)) return 'note';
  return 'bond';
}

function synthetic(spec: Omit<SecuritySpec, 'cusip' | 'synthetic'>): SecuritySpec {
  return { ...spec, cusip: null, synthetic: true };
}
