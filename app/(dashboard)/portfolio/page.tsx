import { Suspense } from 'react';
import { CashTimeline } from '@client/components/portfolio/cash-timeline';
import { KpiStrip } from '@client/components/portfolio/kpi-strip';
import { PositionsCard } from '@client/components/portfolio/positions-card';

export default function PortfolioPage() {
  return (
    <>
      <h1 className="sr-only">Portfolio</h1>
      <KpiStrip />
      <Suspense>
        <CashTimeline />
      </Suspense>
      <PositionsCard />
    </>
  );
}
