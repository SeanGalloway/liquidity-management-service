import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTreasuryGovClient, parseParYieldCsv } from './treasury-gov-client';

const FIXTURE = readFileSync(
  new URL('../../../test/fixtures/treasury-par-curve.csv', import.meta.url),
  'utf8',
);

describe('parseParYieldCsv', () => {
  const points = parseParYieldCsv(FIXTURE);

  it('emits one point per non-blank cell', () => {
    expect(points).toHaveLength(2 * 14 + 2 * 13);
  });

  it('converts percent to bps and dates to ISO with the 15:30 ET close', () => {
    expect(points[0]).toEqual({
      tenorCode: '1M',
      asOfDate: '2026-11-20',
      observedAt: new Date('2026-11-20T20:30:00Z'),
      yieldBps: '419',
      source: 'treasury.gov',
    });
  });

  it('skips blank cells such as 1.5M before it existed', () => {
    const january = points.filter((point) => point.asOfDate === '2025-01-03');

    expect(january.map((point) => point.tenorCode)).not.toContain('1.5M');
    expect(january).toHaveLength(13);
  });

  it('rejects an unexpected header', () => {
    expect(() => parseParYieldCsv('Foo,Bar\n1,2')).toThrow('Unexpected Treasury CSV header');
  });
});

describe('createTreasuryGovClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches each year in range and keeps only points inside it', async () => {
    const fetchMock = vi.fn(async () => new Response(FIXTURE));
    vi.stubGlobal('fetch', fetchMock);

    const client = createTreasuryGovClient({ baseUrl: 'https://treasury.test' });
    const points = await client.fetchParYieldCurve({ from: '2025-12-01', to: '2026-11-19' });

    const requestedUrls = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain(
      '/daily-treasury-rates.csv/2025/all?type=daily_treasury_yield_curve',
    );
    expect(new Set(points.map((point) => point.asOfDate))).toEqual(new Set(['2026-11-19']));
  });

  it('throws on a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    );

    const client = createTreasuryGovClient({ baseUrl: 'https://treasury.test' });

    await expect(
      client.fetchParYieldCurve({ from: '2026-01-01', to: '2026-02-01' }),
    ).rejects.toThrow('503');
  });
});
