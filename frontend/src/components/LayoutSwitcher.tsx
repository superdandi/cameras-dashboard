interface Props {
  value: number;
  onChange: (n: number) => void;
}

const PRESETS: [number, string][] = [
  [1, '1'],
  [2, '2×2'],
  [3, '3×3'],
];

export default function LayoutSwitcher({ value, onChange }: Props) {
  return (
    <div className="layout-switcher">
      {PRESETS.map(([cols, label]) => (
        <button
          key={cols}
          className={`layout-switcher-btn ${value === cols ? 'active' : ''}`}
          onClick={() => onChange(cols)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
