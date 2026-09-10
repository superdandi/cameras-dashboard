import { useMemo } from 'react';

interface Props {
  events: { ts: string }[];
  width?: number;
  height?: number;
}

export default function HourlyChart({ events, width = 240, height = 60 }: Props) {
  const buckets = useMemo(() => {
    const now = new Date();
    const hours: number[] = new Array(24).fill(0);
    const labels: string[] = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600000);
      labels.push(`${String(d.getHours()).padStart(2, '0')}`);
    }
    events.forEach((e) => {
      const d = new Date(e.ts);
      const diff = now.getTime() - d.getTime();
      const h = Math.floor(diff / 3600000);
      if (h >= 0 && h < 24) hours[23 - h]++;
    });
    return { hours, labels };
  }, [events]);

  const max = Math.max(...buckets.hours, 1);
  const barW = (width - 4) / 24;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {buckets.hours.map((count, i) => {
        const barH = (count / max) * (height - 14);
        const x = 2 + i * barW;
        const y = height - 10 - barH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW - 1}
              height={barH}
              rx={1}
              fill="rgb(80,220,120)"
              opacity={count > 0 ? 0.7 : 0.1}
            />
            {i % 4 === 0 && (
              <text x={x + barW / 2} y={height - 1} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="6" fontFamily="var(--font-mono)">
                {buckets.labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
