interface Props {
  value: number;
  max?: number;
  label?: string;
  size?: number;
}

export default function Gauge({ value, max = 30, label = 'FPS', size = 90 }: Props) {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2 + 4;

  const color = pct > 0.67 ? 'rgb(80,220,100)' : pct > 0.33 ? 'rgb(220,180,40)' : 'rgb(220,60,60)';

  const toXY = (deg: number) => ({
    x: cx + r * Math.cos((Math.PI * (180 - deg)) / 180),
    y: cy - r * Math.sin((Math.PI * (180 - deg)) / 180),
  });

  const start = toXY(0);
  const end = toXY(angle);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {angle > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="16" fontFamily="var(--font-mono)" fontWeight="bold">
        {value}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="8" fontFamily="var(--font-mono)">
        {label}
      </text>
    </svg>
  );
}
