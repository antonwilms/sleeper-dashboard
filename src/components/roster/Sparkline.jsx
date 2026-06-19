export function Sparkline({ values }) {
  const BAR_W = 7, GAP = 2, H = 24
  const max = Math.max(...values.filter(v => v != null), 1)
  const width = values.length * (BAR_W + GAP) - GAP
  return (
    <svg width={width} height={H} className="align-middle">
      {values.map((v, i) => (
        <rect key={i} x={i * (BAR_W + GAP)} y={H - (v != null && v > 0 ? Math.max(3, (v / max) * H) : 3)}
          width={BAR_W} height={v != null && v > 0 ? Math.max(3, (v / max) * H) : 3}
          rx={1} fill={v != null && v > 0 ? 'var(--color-sparkline)' : 'var(--color-border)'} />
      ))}
    </svg>
  )
}
