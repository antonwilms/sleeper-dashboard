// Presentational, state-free dp-styled table shell for Market (1b Slice iii). Mirrors
// PlayersDataTable's render-prop shape (header / renderRow / pagination) so the two can
// converge later when /players retires — see Market.jsx's header comment. Does NOT reuse
// PlayersDataTable: that component and SortTh below it are styled with the old --color-*
// token family and are shared with /players, so recoloring them would recolor that surface.

const PAGE_SIZE = 50

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE']

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

export function MarketTable({
  posFilter, onPosFilter, loaded, header, colSpan, displayRows, page, onPageChange, renderRow,
  activeColumnLabel,
}) {
  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end   = Math.min(safePage * PAGE_SIZE, totalCount)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-[3px] bg-dp-card border border-dp-border rounded-lg p-[3px] w-fit">
        {POSITIONS.map(pos => (
          <button
            key={pos}
            onClick={() => onPosFilter(pos)}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              posFilter === pos ? 'bg-dp-chip text-dp-text font-semibold' : 'text-dp-text-4'
            }`}
          >
            {pos === 'ALL' ? 'All' : pos}
          </button>
        ))}
      </div>

      {!loaded && (
        <p className="text-sm text-dp-muted italic">Player data loading in background…</p>
      )}

      <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-dp-row-head">{header}</tr>
            </thead>
            <tbody>
              {pageRows.map(renderRow)}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="py-10 text-center text-dp-muted">
                    {loaded ? 'No players match your filters.' : 'Loading player data…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalCount > 0 && (
          <div className="px-[18px] py-3 flex items-center justify-between border-t border-dp-border-row text-xs text-dp-muted">
            <span>{start}–{end} of {totalCount} · sorted by {activeColumnLabel}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(p => p - 1)}
                disabled={safePage === 1}
                className="px-2.5 py-1 rounded-md border border-dp-border disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-dp-mono px-1 tabular-nums">{safePage} / {totalPages}</span>
              <button
                onClick={() => onPageChange(p => p + 1)}
                disabled={safePage === totalPages}
                className="px-2.5 py-1 rounded-md border border-dp-border text-dp-text-4 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
