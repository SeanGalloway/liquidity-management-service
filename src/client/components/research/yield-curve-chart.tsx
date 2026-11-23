'use client';

import 'client-only';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { TenorRow } from '@client/lib/curve';
import { addMonths, calculateTodayInNewYork } from '@client/lib/dates';
import {
  formatBpsAsPercent,
  formatBpsChange,
  formatDate,
  formatTenorName,
} from '@client/lib/format';
import type { Curve, SecurityKind } from '@client/types';

const ACCENT = '#1e4fd8';
const COMPARE = '#9aa3b0';
const GRID = '#ebeef2';
const AXIS_TICK = { fontSize: 12, fill: '#5b6472' };
const BAND_LABEL = {
  fontSize: 12,
  fontWeight: 600,
  fill: '#5b6472',
  position: 'insideBottomLeft' as const,
};

export type CurvePoint = TenorRow & { compareBps: number | null };

export function calculateCurvePoints(rows: TenorRow[], compare: Curve | undefined): CurvePoint[] {
  const compareByTenor = new Map(compare?.points.map((p) => [p.tenor, p.yieldBps]) ?? []);
  return rows.map((row) => ({ ...row, compareBps: compareByTenor.get(row.tenor) ?? null }));
}

function findBand(points: CurvePoint[], kind: SecurityKind) {
  const tenors = points.filter((point) => point.kind === kind).map((point) => point.tenor);
  return tenors.length ? { x1: tenors[0], x2: tenors.at(-1) } : null;
}

type CurveTooltipProps = TooltipContentProps & { compareLabel: string | null };

function CurveTooltip({ active, payload, compareLabel }: CurveTooltipProps) {
  const point = payload?.[0]?.payload as CurvePoint | undefined;
  if (!active || !point) return null;

  const maturity = addMonths(calculateTodayInNewYork(), point.months);
  const change = point.compareBps === null ? null : point.yieldBps - point.compareBps;

  return (
    <div className="rounded-lg bg-ink px-3 py-2.5 text-[13px] leading-normal text-white shadow-lg">
      <div className="font-semibold">
        {formatTenorName(point.tenor)} · matures ~{formatDate(maturity)}
      </div>
      <div>
        {formatBpsAsPercent(point.yieldBps)}{' '}
        {change !== null && (
          <span className={change > 0 ? 'text-[#f5aba5]' : 'text-[#9fe3bf]'}>
            {formatBpsChange(change)} vs {compareLabel}
          </span>
        )}
      </div>
      <div className="mt-1.5 font-semibold text-[#b9c6f5]">Click to buy at this maturity →</div>
    </div>
  );
}

type YieldCurveChartProps = {
  points: CurvePoint[];
  compareLabel: string | null;
  onPick: (point: CurvePoint) => void;
};

export function YieldCurveChart({ points, compareLabel, onPick }: YieldCurveChartProps) {
  const bands = [
    { label: 'BILLS', band: findBand(points, 'bill'), fill: '#f2f5fa' },
    { label: 'NOTES', band: findBand(points, 'note'), fill: 'transparent' },
    { label: 'BONDS', band: findBand(points, 'bond'), fill: 'transparent' },
  ];

  function pick(index: number | string | null | undefined) {
    const point = points[Number(index)];
    if (index !== null && index !== undefined && point) onPick(point);
  }

  return (
    <div className="h-80 w-full cursor-pointer">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => pick(state?.activeTooltipIndex)}
        >
          {bands.map(({ label, band, fill }) =>
            band ? (
              <ReferenceArea
                key={label}
                x1={band.x1}
                x2={band.x2}
                fill={fill}
                fillOpacity={1}
                ifOverflow="visible"
                label={{ ...BAND_LABEL, value: label }}
              />
            ) : null,
          )}
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="tenor"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            interval={0}
          />
          <YAxis
            tickFormatter={(bps: number) => formatBpsAsPercent(bps)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[
              (min: number) => Math.floor(min / 20) * 20 - 20,
              (max: number) => Math.ceil(max / 20) * 20 + 20,
            ]}
          />
          <Tooltip
            content={(props) => <CurveTooltip {...props} compareLabel={compareLabel} />}
            cursor={{ stroke: ACCENT, strokeDasharray: '3 3' }}
          />
          <Line
            dataKey="compareBps"
            stroke={COMPARE}
            strokeWidth={1.6}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="yieldBps"
            stroke={ACCENT}
            strokeWidth={2.5}
            dot={{ r: 5, fill: ACCENT, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 8, fill: ACCENT, stroke: '#fff', strokeWidth: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
