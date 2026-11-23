'use client';

import 'client-only';
import { calculateTenorRows } from '@client/lib/curve';
import { useCurve, useTenors, useYieldHistory } from '@client/queries';
import { CurveCard } from './curve-card';
import { SpreadKpis } from './spread-kpis';
import { TenorTable } from './tenor-table';

export function ResearchView() {
  const curve = useCurve('latest');
  const tenors = useTenors();
  const history = useYieldHistory(curve.data?.points.map((point) => point.tenor) ?? []);

  if (curve.error) {
    return <p className="text-sm text-negative">Could not load rates: {curve.error.message}</p>;
  }
  if (!curve.data || !tenors.data) return null;

  const rows = calculateTenorRows(curve.data, tenors.data, history.data ?? []);

  return (
    <>
      <SpreadKpis rows={rows} />
      <CurveCard curve={curve.data} rows={rows} />
      <TenorTable rows={rows} />
    </>
  );
}
