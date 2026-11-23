'use client';

import 'client-only';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { fromUtcMs, toUtcMs } from '@client/lib/dates';
import { formatCents, formatCompactDollars, formatDate, formatMonthTick } from '@client/lib/format';
import {
  calculateMaturityMarkers,
  calculateTimelineSeries,
  type TimelinePoint,
} from '@client/lib/portfolio';
import type { Timeline } from '@client/types';

const ACCENT = '#1e4fd8';
const GRID = '#ebeef2';
const AXIS_TICK = { fontSize: 12, fill: '#5b6472' };

function TimelineTooltip({
  active,
  payload,
  timeline,
}: TooltipContentProps & { timeline: Timeline }) {
  const point = payload?.[0]?.payload as TimelinePoint | undefined;
  if (!active || !point) return null;

  const date = fromUtcMs(point.t);
  const events = timeline.events.filter((event) => event.date === date);
  const balance = point.projected ?? point.actual ?? 0;

  return (
    <div className="rounded-md bg-ink px-2.5 py-2 text-xs leading-relaxed text-white shadow-lg">
      <div className="font-semibold">{formatDate(date)}</div>
      {events.map((event) => (
        <div key={`${event.holdingId}-${event.kind}`}>
          {event.kind === 'coupon' ? 'Coupon' : 'Maturity'} +{formatCents(event.amountCents)}
        </div>
      ))}
      <div>
        {point.actual !== undefined && point.projected === undefined ? 'Balance' : 'Projected'}{' '}
        {formatCents(balance)}
      </div>
    </div>
  );
}

export function TimelineChart({ timeline, horizon }: { timeline: Timeline; horizon: string }) {
  const series = calculateTimelineSeries(timeline, horizon);
  const markers = calculateMaturityMarkers(timeline);
  const today = toUtcMs(timeline.today);
  const end = series.at(-1)?.t ?? today;

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
          <ReferenceArea x1={today} x2={end} fill="#f7f9fd" fillOpacity={1} ifOverflow="hidden" />
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
            tickFormatter={formatCompactDollars}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={(props) => <TimelineTooltip {...props} timeline={timeline} />}
            cursor={{ stroke: '#9aa3b0', strokeDasharray: '3 3' }}
          />
          <Area
            dataKey="actual"
            type="stepAfter"
            stroke={ACCENT}
            strokeWidth={2}
            fill={ACCENT}
            fillOpacity={0.08}
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 4 }}
          />
          <Line
            dataKey="projected"
            type="stepAfter"
            stroke={ACCENT}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 4 }}
          />
          <ReferenceLine
            x={today}
            stroke="#14171c"
            label={{
              value: 'Today',
              position: 'insideTopLeft',
              fontSize: 12,
              fontWeight: 600,
              fill: '#14171c',
              offset: 4,
              dy: -16,
            }}
          />
          {markers.map((marker) => (
            <ReferenceDot
              key={marker.date}
              x={marker.t}
              y={marker.balanceCents}
              r={5}
              fill="#fff"
              stroke={ACCENT}
              strokeWidth={2}
              ifOverflow="visible"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
