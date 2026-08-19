// Shared dp-styled presentational cells — moved out of Market.jsx (1b Slice iii) so Portfolio
// (Slice iv) can import them rather than fork them. Pure relocation: every component here is
// byte-identical in behaviour to its pre-move Market.jsx version (DeltaCell is the one exception
// worth naming — it is the delta *div* extracted verbatim from Market's inline Value/NEXT column
// markup, now a named component instead of inline JSX; the rendered output is unchanged).

export function SortTh({ label, col, sortKey, sortAsc, onSort, tooltip, align = 'left' }) {
  const active = sortKey === col
  const inner = <>{label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}</>
  return (
    <th
      onClick={() => onSort(col)}
      title={tooltip}
      className={`px-3 py-[9px] first:pl-[18px] last:pr-[18px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase cursor-pointer select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-dp-text' : 'text-dp-muted'}`}
    >
      {inner}
    </th>
  )
}

export function PlayerCell({ row }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-dp-mono text-[10px] w-[26px] text-center py-0.5 rounded bg-dp-chip text-dp-text-3 shrink-0">
        {row.position}
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-dp-text truncate">{row.full_name}</div>
        <div className="text-[11px] text-dp-muted truncate">
          {row.age != null && <>{row.age} · </>}
          {row.nfl_team && row.nfl_team !== 'FA' ? row.nfl_team : 'FA'}
          {row.years_exp != null && <> · {row.years_exp}yr</>}
        </div>
      </div>
    </div>
  )
}

export function ClickableRow({ row, onOpen, children }) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.player_id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(row.player_id)
        }
      }}
      className="border-t border-dp-border-row cursor-pointer hover:bg-dp-row-self focus:outline-none focus:bg-dp-row-self"
    >
      {children}
    </tr>
  )
}

// 5-wide career sparkline, dp-styled — a fresh build, never shared with the Explorer's
// old-tokens CareerSparkline (deleted with that surface in 1b Slice viii). Do not respec these
// dimensions per-caller — Slice iv's task file is explicit that Portfolio reuses this unchanged.
//
// The normalisation rule (dp-v2 Slice 1 — see the matching comment in SeriesBars.jsx):
// CareerBars is zero-based (max over positives; a 0.0 season must look like nothing but still
// stay visible as a stub). SeriesBars/TrendCell are min–max normalised instead — a value series
// like 9781 → 9989 is flat under zero-based scaling, so only min–max shows its movement. Never
// render a value series with CareerBars, and never render a PPG series with SeriesBars/TrendCell
// in 'scaled' mode without a stated domain.
//
// Void slots (dp-v2 Slice 1): `values` may hold `null` for "no season here" (produced by
// App.jsx's careerSparkline memo). Only Number.isFinite(v) counts as measured — NaN/undefined
// are void too, never a measured zero.
export function CareerBars({ values }) {
  const BAR_W = 6, GAP = 2, H = 22
  const vals = values ?? []
  const max = Math.max(...vals.filter(v => Number.isFinite(v) && v > 0), 1)
  return (
    <div className="flex items-end" style={{ gap: GAP, height: H }}>
      {vals.map((v, i) => {
        const isLast = i === vals.length - 1
        if (!Number.isFinite(v)) {
          // Void slot — no fill, a dashed marker at the baseline, never a filled stub.
          return (
            <div
              key={i}
              style={{ width: BAR_W, height: 0, borderTop: '1px dashed var(--color-dp-slate-2)' }}
            />
          )
        }
        const barH = v > 0 ? Math.max(3, Math.round((v / max) * H)) : 2
        return (
          <div
            key={i}
            style={{ width: BAR_W, height: barH }}
            className={`rounded-[1px] ${isLast ? 'bg-dp-up' : 'bg-dp-slate'}`}
          />
        )
      })}
    </div>
  )
}

// Extracted verbatim from Market.jsx's Value/NEXT column (the second, delta line beneath the
// projected-value line). Market wraps this beneath a value line; Portfolio's PROJ Δ column uses
// it standalone as the entire cell content.
export function DeltaCell({ delta }) {
  return (
    <div className={`font-dp-mono text-[11px] ${delta == null ? 'text-dp-muted' : delta > 0 ? 'text-dp-up-text' : delta < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}>
      {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
    </div>
  )
}
