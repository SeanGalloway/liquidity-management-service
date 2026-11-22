import 'server-only';
import type { DateRange, IsoDate } from '../domain/types';

export type CurvePoint = {
  tenorCode: string;
  asOfDate: IsoDate;
  observedAt: Date;
  yieldBps: string;
  source: string;
};

export interface YieldsClient {
  fetchParYieldCurve(range: DateRange): Promise<CurvePoint[]>;
}

export function isInRange(point: CurvePoint, range: DateRange) {
  return point.asOfDate >= range.from && point.asOfDate <= range.to;
}
