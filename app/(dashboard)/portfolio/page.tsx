import { Suspense } from 'react';
import { CashTimeline } from '@client/components/portfolio/cash-timeline';
import { KpiStrip } from '@client/components/portfolio/kpi-strip';
import { PositionsCard } from '@client/components/portfolio/positions-card';
import { SimulationPanel } from '@client/components/portfolio/simulation-panel';

export default function PortfolioPage() {
  return (
    <>
      <h1 className="sr-only">Portfolio</h1>
      <KpiStrip />
      <SimulationPanel />
      <Suspense>
        <CashTimeline />
      </Suspense>
      <PositionsCard />
    </>
  );
}
