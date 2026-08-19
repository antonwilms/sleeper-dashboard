import { COVERAGE_BANDS } from '../../utils/coverageBand'

// dp-v2 Slice 1. NOT the module-local TrendCell in market/Market.jsx:182 (Outlook set's
// Snap/Opp trend cells) — that local exists independently until Slice 5 resolves the name
// collision (renames or deletes it). Do not import across that boundary before then.
//
// The normalisation rule (see the matching comment in cells.jsx): TrendCell is min–max
// normalised like SeriesBars, never zero-based like CareerBars.
//
// Fixed content order at every scale: series -> signed delta with glyph -> window label.
// Sorting on the underlying metric is the caller's job and sorts on delta, never on shape.

const SCALES = {
  cell:    { height: 14, barWidth: 3, gap: 1 },
  tile:    { height: 22, barWidth: 6, gap: 2 },   // identical to CareerBars — do not invent a third geometry
  section: { height: 40, barWidth: 14, gap: 5 },
}

function DeltaGlyph({ delta, scale }) {
  const weightClass = scale === 'tile' || scale === 'section' ? 'font-semibold' : ''
  const base = `font-dp-mono text-[12px] ${weightClass}`
  if (delta == null) return <span className={`${base} text-dp-muted`}>—</span>
  if (delta > 0) return <span className={`${base} text-dp-up-text`}>▲ {delta}</span>
  if (delta < 0) return <span className={`${base} text-dp-down-text`}>▼ {Math.abs(delta)}</span>
  return <span className={`${base} text-dp-text-5`}>→ {delta}</span>
}

function Series({ values, geo, projectedIndex }) {
  const vals = values ?? []
  const finite = vals.filter(Number.isFinite)
  const lo = finite.length ? Math.min(...finite) : 0
  const hi = finite.length ? Math.max(...finite) : 1
  const span = (hi - lo) || 1

  return (
    <div className="flex items-end" style={{ gap: geo.gap, height: geo.height }}>
      {vals.map((v, i) => {
        if (!Number.isFinite(v)) {
          return (
            <div
              key={i}
              style={{ width: geo.barWidth, height: 0, borderTop: '1px dashed var(--color-dp-slate-2)' }}
            />
          )
        }
        const barH = Math.max(2, Math.round(((v - lo) / span) * geo.height))
        const isProjected = i === projectedIndex
        return (
          <div
            key={i}
            style={{ width: geo.barWidth, height: barH }}
            className={isProjected ? 'border border-dashed border-dp-slate-2' : 'bg-dp-slate-2'}
          />
        )
      })}
    </div>
  )
}

export function TrendCell({ values, delta, window: windowLabel, band, scale = 'cell', projectedIndex }) {
  const geo = SCALES[scale] ?? SCALES.cell
  // Absent or unrecognised band -> treat as 'none'. No default to 'high': show less, not more.
  const resolvedBand = COVERAGE_BANDS.includes(band) ? band : 'none'

  if (resolvedBand === 'none') {
    return <span className="font-dp-mono text-[12px] text-dp-muted">—</span>
  }

  const showSeries = resolvedBand === 'high' || resolvedBand === 'medium'

  // windowLabel is not optional — its absence is a caller bug, but that must not suppress the
  // series or delta; there is simply nothing to print for the label itself.
  if (windowLabel == null && process.env.NODE_ENV !== 'production') {
    console.warn('TrendCell: windowLabel is required — it is what distinguishes e.g. a 13-week market trend from a 14-season usage trend.')
  }

  return (
    <div className="flex items-center gap-2">
      {showSeries && <Series values={values} geo={geo} projectedIndex={projectedIndex} />}
      <DeltaGlyph delta={delta} scale={scale} />
      {windowLabel != null && (
        <span className="font-dp-mono text-[9px] tracking-[0.06em] text-dp-muted uppercase">{windowLabel}</span>
      )}
    </div>
  )
}
