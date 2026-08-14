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

// 5-wide 0-padded career sparkline, dp-styled — NOT PlayersTab's CareerSparkline (old tokens,
// not exported; see Market.jsx's reuse table). Do not respec these dimensions per-caller —
// Slice iv's task file is explicit that Portfolio reuses this unchanged.
export function CareerBars({ values }) {
  const BAR_W = 6, GAP = 2, H = 22
  const vals = values ?? []
  const max = Math.max(...vals.filter(v => v > 0), 1)
  return (
    <div className="flex items-end" style={{ gap: GAP, height: H }}>
      {vals.map((v, i) => {
        const isLast = i === vals.length - 1
        const barH = v > 0 ? Math.max(3, Math.round((v / max) * H)) : 3
        return (
          <div
            key={i}
            style={{ width: BAR_W, height: barH }}
            className={`rounded-[1px] ${v > 0 ? (isLast ? 'bg-dp-up' : 'bg-dp-slate') : 'bg-dp-border-row'}`}
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
