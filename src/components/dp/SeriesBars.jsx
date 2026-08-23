// The normalisation rule (see the matching comment in cells.jsx): CareerBars is zero-based
// (max over positives; 0.0 must look like nothing). SeriesBars/TrendCell are min–max normalised
// (a market-value series like 9781 → 9989 is flat under zero-based scaling; only min–max shows
// the movement the column exists to show). Never render a value series with CareerBars, and
// never render a PPG series with SeriesBars in 'scaled' mode without a stated domain.

// A void slot renders identically to CareerBars' void treatment: no fill, a 1px dashed
// border-top in dp-slate-2, sitting at the baseline (height 0, aligned via the flex container's
// items-end) — not a bar spanning the track height.
function VoidBar({ width }) {
  return (
    <div style={{ width, height: 0, borderTop: '1px dashed var(--color-dp-slate-2)' }} />
  )
}

// Arbitrary-length sibling to CareerBars. Never pads, and never substitutes 0 for a null — a
// null/undefined/non-finite entry is a void slot, excluded from the domain computation.
//
// `colour` (dp-v2 Slice 6b, additive — default unchanged) only affects `signed` mode, which
// otherwise colours by raw sign (`bg-dp-up`/`bg-dp-down`) — an editorial choice that is wrong for
// a metric whose sign isn't a verdict (further right is good for a receiver, bad for a runner;
// negative DEF EPA ALL is good, positive OFF EPA/PLAY is good). `colour="neutral"` keeps the real
// zero-axis geometry but renders every bar `bg-dp-slate-2`, matching `scaled` mode's existing
// neutral colouring. `scaled` mode is unaffected — it was already neutral.
export function SeriesBars({ values, height = 42, barWidth = 6, gap = 2, mode = 'scaled', domain, colour }) {
  const vals = values ?? []
  const finite = vals.filter(Number.isFinite)

  if (mode === 'signed') {
    const posMax = Math.max(0, ...finite.filter(v => v > 0))
    const negMax = Math.max(0, ...finite.filter(v => v < 0).map(v => -v))
    const total = posMax + negMax
    const topH = total > 0 ? (height * posMax) / total : height / 2
    const bottomH = height - topH

    return (
      <div className="flex items-end" style={{ gap, height }}>
        {vals.map((v, i) => {
          if (!Number.isFinite(v)) return <VoidBar key={i} width={barWidth} />
          const positive = v >= 0
          const barH = positive
            ? (posMax > 0 ? Math.max(2, Math.round((v / posMax) * topH)) : 0)
            : (negMax > 0 ? Math.max(2, Math.round((-v / negMax) * bottomH)) : 0)
          return (
            <div key={i} style={{ width: barWidth, height, position: 'relative' }}>
              <div
                style={{ position: 'absolute', left: 0, width: barWidth, bottom: bottomH, height: 1 }}
                className="bg-dp-muted-2"
              />
              <div
                style={
                  positive
                    ? { position: 'absolute', left: 0, width: barWidth, bottom: bottomH, height: barH }
                    : { position: 'absolute', left: 0, width: barWidth, top: topH, height: barH }
                }
                className={colour === 'neutral' ? 'bg-dp-slate-2' : (positive ? 'bg-dp-up' : 'bg-dp-down')}
              />
            </div>
          )
        })}
      </div>
    )
  }

  // 'scaled' — min-max normalised, optionally against an explicit caller-supplied domain.
  let lo, hi
  if (domain) {
    [lo, hi] = domain
  } else if (finite.length) {
    lo = Math.min(...finite)
    hi = Math.max(...finite)
  } else {
    lo = 0
    hi = 1
  }
  const span = (hi - lo) || 1

  return (
    <div className="flex items-end" style={{ gap, height }}>
      {vals.map((v, i) => {
        if (!Number.isFinite(v)) return <VoidBar key={i} width={barWidth} />
        const frac = (v - lo) / span
        const barH = Math.max(2, Math.round(frac * height))
        return <div key={i} style={{ width: barWidth, height: barH }} className="bg-dp-slate-2" />
      })}
    </div>
  )
}
