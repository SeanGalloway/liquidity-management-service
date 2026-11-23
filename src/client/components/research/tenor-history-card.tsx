'use client';

import 'client-only';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { addMonths, toUtcMs } from '@client/lib/dates';
import {
  formatBpsAsPercent,
  formatBpsChange,
  formatDate,
  formatMonthTick,
  formatTenorName,
} from '@client/lib/format';
import { useYieldHistory } from '@client/queries';
import type { Tenor } from '@client/types';

const ACCENT = '#1e4fd8';
const GRID = '#ebeef2';
const AXIS_TICK = { fontSize: 12, fill: '#5b6472' };
const DEFAULT_TENOR = '10Y';
const LOOKBACK_MONTHS = 12;
const AXIS_STEP_BPS = 25;

function roundDownToStep(bps: number) {
  return Math.floor(bps / AXIS_STEP_BPS) * AXIS_STEP_BPS;
}

function roundUpToStep(bps: number) {
  return Math.ceil(bps / AXIS_STEP_BPS) * AXIS_STEP_BPS;
}

type HistoryPoint = { t: number; date: string; yieldBps: number };

function HistoryTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as HistoryPoint | undefined;
  if (!active || !point) return null;

  return (
    <div className="rounded-md bg-ink px-2.5 py-2 text-xs leading-relaxed text-white shadow-lg">
      <div className="font-semibold">{formatDate(point.date)}</div>
      <div>{formatBpsAsPercent(point.yieldBps)}</div>
    </div>
  );
}

function HistoryStats({ points }: { points: HistoryPoint[] }) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  const yields = points.map((point) => point.yieldBps);

  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
      <div className="flex gap-1.5">
        <dt className="text-muted">Latest</dt>
        <dd className="font-semibold">{formatBpsAsPercent(last.yieldBps)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-muted">12M change</dt>
        <dd className="font-semibold">{formatBpsChange(last.yieldBps - first.yieldBps)}</dd>
      </div>
      <div className="flex gap-1.5">
        <dt className="text-muted">Range</dt>
        <dd className="font-semibold">
          {formatBpsAsPercent(Math.min(...yields))} – {formatBpsAsPercent(Math.max(...yields))}
        </dd>
      </div>
    </dl>
  );
}

export function TenorHistoryCard({ tenors, asOf }: { tenors: Tenor[]; asOf: string }) {
  const [tenor, setTenor] = useState(DEFAULT_TENOR);
  const history = useYieldHistory([tenor], addMonths(asOf, -LOOKBACK_MONTHS));
  const points: HistoryPoint[] = (history.data?.[0]?.points ?? []).map((point) => ({
    t: toUtcMs(point.date),
    date: point.date,
    yieldBps: point.yieldBps,
  }));

  return (
    <section
      aria-label="Yield history"
      className="rounded-card border border-border bg-surface px-4 pt-5 pb-6 sm:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Yield history</h2>
          <p className="mt-1 text-[13px] text-muted">Daily closes over the last 12 months</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Tenor
          <select
            value={tenor}
            onChange={(event) => setTenor(event.target.value)}
            className="h-9 rounded-md border border-control bg-surface px-2.5 text-[13px] font-medium text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:h-11"
          >
            {tenors.map((option) => (
              <option key={option.code} value={option.code}>
                {formatTenorName(option.code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <HistoryStats points={points} />
      {history.error && (
        <p className="mt-4 text-sm text-negative">
          Could not load history: {history.error.message}
        </p>
      )}

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatMonthTick}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(bps: number) => formatBpsAsPercent(bps)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[roundDownToStep, roundUpToStep]}
              tickCount={5}
            />
            <Tooltip
              content={HistoryTooltip}
              cursor={{ stroke: '#9aa3b0', strokeDasharray: '3 3' }}
            />
            <Line
              dataKey="yieldBps"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
