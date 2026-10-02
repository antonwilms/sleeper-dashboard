// weekly-decision-1-lineup.md §6 — "How much of this is {season}". One row per
// blendWeights.js's SIGNAL_FAMILIES entry (today just `fpa`): label, bar, percent, then the
// threshold cell — `k {k} · all {dropGames} gm` when the row carries `dropGames`, else `k {k}`.
// The footer says what the blend shrinks toward — the same defence's own last season — with `k` and
// `dropGames` read from the `fpa` row, never written as literals. Presentational, props-only.

function thresholdText(w) {
  if (w.dropGames != null) return `k ${w.k} · all ${w.dropGames} gm`
  return `k ${w.k}`
}

export function WeightPanel({ weights = [], n = 0, season = null, priorSeason = null }) {
  const fpa = weights.find(w => w.key === 'fpa')
  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">
          HOW MUCH OF THIS IS {season ?? '—'}
        </span>
        <span className="ml-auto font-dp-mono text-[9.5px] text-dp-muted-2 whitespace-nowrap">
          {`n = ${n} GAME${n === 1 ? '' : 'S'} · w = n / (n + k)`}
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
      {fpa && (
        <div className="text-[11px] text-dp-muted leading-relaxed mt-2.5 pt-2.5 border-t border-dp-border-row">
          Each defence&rsquo;s {season} points allowed per game are blended with its own{' '}
          {priorSeason ?? 'last season'} rate, which counts as {fpa.k} games. From {fpa.dropGames} games
          played, {season} stands alone.
        </div>
      )}
    </div>
  )
}
