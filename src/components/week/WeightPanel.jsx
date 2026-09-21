// weekly-decision-1-lineup.md §6 — "How much of this is {season}". One row per
// blendWeights.js's SIGNAL_FAMILIES entry: label, bar, percent, then the threshold cell — `k {k} ·
// all {dropGames} gm` when the row carries `dropGames`, `k {k} · all wk {dropWeek}` when it
// carries `dropWeek`. Never both, never a fabricated conversion, never `all wk null` (a
// dropWeek-only row spec would render that for a row lacking dropWeek — the ternary below checks
// dropGames first specifically so that can't happen). Presentational, props-only, no fetching.

function thresholdText(w) {
  if (w.dropGames != null) return `k ${w.k} · all ${w.dropGames} gm`
  if (w.dropWeek != null) return `k ${w.k} · all wk ${w.dropWeek}`
  return `k ${w.k}`
}

export function WeightPanel({ weights = [], n = 0, season = null }) {
  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">
          HOW MUCH OF THIS IS {season ?? '—'}
        </span>
        <span className="ml-auto font-dp-mono text-[9.5px] text-dp-muted-2 whitespace-nowrap">
          n = {n} GAME{n === 1 ? '' : 'S'} · w = n / (n + k)
        </span>
      </div>
      <div className="flex flex-col gap-[7px] mt-2.5">
        {weights.map(w => (
          <div key={w.key} className="grid grid-cols-[150px_1fr_36px_112px] gap-2.5 items-center">
            <span className="text-[11.5px] text-dp-text-3 truncate">{w.label}</span>
            <div className="h-[5px] bg-dp-border rounded-full overflow-hidden">
              <div className="h-[5px] bg-dp-up rounded-full" style={{ width: `${w.pct ?? 0}%` }} />
            </div>
            <span className="font-dp-mono text-[11px] text-dp-text text-right">
              {w.pct != null ? `${w.pct}%` : '—'}
            </span>
            <span className="font-dp-mono text-[9.5px] text-dp-muted whitespace-nowrap">
              {thresholdText(w)}
            </span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-dp-muted leading-relaxed mt-2.5 pt-2.5 border-t border-dp-border-row">
        The residual shrinks toward league average, not toward last year&rsquo;s team. A signal at
        its &ldquo;all&rdquo; week drops the prior term entirely.
      </div>
    </div>
  )
}
