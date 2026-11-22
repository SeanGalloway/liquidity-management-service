import 'server-only';
import Decimal from 'decimal.js';
import { toNewYorkInstant, yearOf } from '../domain/dates';
import type { DateRange } from '../domain/types';
import { isInRange, type CurvePoint, type YieldsClient } from './yields-client';

export const TREASURY_SOURCE = 'treasury.gov';

const CSV_PATH = '/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';
const CLOSE_TIME_ET = '15:30:00';

const HEADER_TO_TENOR: Record<string, string> = {
  '1 Mo': '1M',
  '1.5 Month': '1.5M',
  '2 Mo': '2M',
  '3 Mo': '3M',
  '4 Mo': '4M',
  '6 Mo': '6M',
  '1 Yr': '1Y',
  '2 Yr': '2Y',
  '3 Yr': '3Y',
  '5 Yr': '5Y',
  '7 Yr': '7Y',
  '10 Yr': '10Y',
  '20 Yr': '20Y',
  '30 Yr': '30Y',
};

export function createTreasuryGovClient({ baseUrl }: { baseUrl: string }): YieldsClient {
  return {
    async fetchParYieldCurve(range: DateRange) {
      const points: CurvePoint[] = [];

      for (let year = yearOf(range.from); year <= yearOf(range.to); year++) {
        const csv = await fetchParYieldCsv(baseUrl, year);
        points.push(...parseParYieldCsv(csv));
      }

      return points.filter((point) => isInRange(point, range));
    },
  };
}

export async function fetchParYieldCsv(baseUrl: string, year: number): Promise<string> {
  const url = new URL(`${CSV_PATH}/${year}/all`, baseUrl);
  url.searchParams.set('type', 'daily_treasury_yield_curve');
  url.searchParams.set('field_tdr_date_value', String(year));
  url.searchParams.set('_format', 'csv');

  const response = await fetch(url, { headers: { 'user-agent': 'liquidity-management-service' } });
  if (!response.ok) {
    throw new Error(`Treasury par curve ${year} request failed with ${response.status}`);
  }

  return response.text();
}

export function parseParYieldCsv(csv: string): CurvePoint[] {
  const [headerLine, ...rowLines] = csv.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine ?? '');

  if (headers[0] !== 'Date') throw new Error('Unexpected Treasury CSV header');

  return rowLines.flatMap((line) => parseRow(headers, splitCsvLine(line)));
}

function parseRow(headers: string[], cells: string[]): CurvePoint[] {
  const asOfDate = toIsoDate(cells[0] ?? '');
  const observedAt = toNewYorkInstant(asOfDate, CLOSE_TIME_ET);
  const points: CurvePoint[] = [];

  headers.forEach((header, index) => {
    const tenorCode = HEADER_TO_TENOR[header];
    const percent = cells[index];
    if (!tenorCode || !percent) return;

    const yieldBps = new Decimal(percent).times(100).toString();
    points.push({ tenorCode, asOfDate, observedAt, yieldBps, source: TREASURY_SOURCE });
  });

  return points;
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function toIsoDate(usDate: string): string {
  const [month, day, year] = usDate.split('/');
  return `${year}-${month}-${day}`;
}
