export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="6" fill="currentColor" />
        <path
          d="M7 19 L12 13 L16 16 L21 9"
          stroke="#fff"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-base font-bold tracking-tight">Liquidity</span>
      <span className="text-[13px] text-muted">Treasury desk</span>
    </div>
  );
}
