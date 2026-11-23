import Decimal from 'decimal.js';
import type { Curve } from '@server/domain/types';

const NOV_20_2026_PERCENT: [string, number, number][] = [
  ['1M', 1, 4.19],
  ['1.5M', 1.5, 4.26],
  ['2M', 2, 4.28],
  ['3M', 3, 4.32],
  ['4M', 4, 4.32],
  ['6M', 6, 4.38],
  ['1Y', 12, 4.51],
  ['2Y', 24, 4.63],
  ['3Y', 36, 4.65],
  ['5Y', 60, 4.71],
  ['7Y', 84, 4.8],
  ['10Y', 120, 4.92],
  ['20Y', 240, 5.34],
  ['30Y', 360, 5.31],
];

export const NOV_20_2026_CURVE: Curve = {
  asOfDate: '2026-11-20',
  observedAt: new Date('2026-11-20T20:30:00Z'),
  source: 'treasury.gov',
  points: NOV_20_2026_PERCENT.map(([tenorCode, months, percent]) => ({
    tenorCode,
    months,
    yieldBps: new Decimal(percent).times(100),
  })),
};
