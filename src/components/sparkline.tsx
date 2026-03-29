import type { PricePoint } from "@/lib/contracts";

type SparklineProps = {
  prices: PricePoint[];
};

export function Sparkline({ prices }: SparklineProps) {
  const closes = prices.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const width = 640;
  const height = 220;

  const points = prices
    .map((point, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y = height - ((point.close - min) / (max - min || 1)) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Price trend chart">
        <defs>
          <linearGradient id="sparklineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(26, 117, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(26, 117, 255, 0.02)" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="var(--accent-strong)" strokeWidth="5" points={points} />
        <polygon
          fill="url(#sparklineFill)"
          points={`0,${height} ${points} ${width},${height}`}
        />
      </svg>
      <div className="chart-axis">
        <span>{prices[0]?.date}</span>
        <span>{prices[prices.length - 1]?.date}</span>
      </div>
    </div>
  );
}

