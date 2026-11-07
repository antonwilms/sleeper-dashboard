// Presentational, state-free dp-styled table shell for Market (1b Slice iii). Mirrored the
// Explorer's `PlayersDataTable` render-prop shape (header / renderRow / pagination) at the time,
// but was never actually a shared/converged component — that component and its `SortTh` were
// styled with the old --color-* token family and shared with `/players`, so recoloring them
// would have recolored that surface. `PlayersDataTable` was deleted with the Explorer in 1b
// Slice viii; this shell hard-codes the ALL/QB/RB/WR/TE position pill row and a PAGE_SIZE-driven
// pager —
// Portfolio (1b Slice iv) has neither, so it gets its own thin table shell rather than a
// conditional-pills/conditional-pager extension of this one. dp SortTh lives in ./cells.jsx,
// shared by both.
//
// `filterBar` (1b Slice vi) — optional render-prop rendered in the SAME flex-wrap row as the
// position pills, per the design's Filter-bar paragraph (one row: position control, active
// pills, "+ Add filter", right-aligned actions). Additive: when absent, this renders exactly as
// before — the wrapping flex row around a single child is a no-op visually.

const PAGE_SIZE = 50

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE']

export function MarketTable({
  posFilter, onPosFilter, loaded, header, colSpan, displayRows, page, onPageChange, renderRow,
  activeColumnLabel, filterBar,
}) {
  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end   = Math.min(safePage * PAGE_SIZE, totalCount)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 w-fit">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => onPosFilter(pos)}
              className={`px-3.5 h-8 rounded-full font-dp-mono text-[12px] transition-colors ${
                posFilter === pos
                  ? 'bg-dp-text text-dp-canvas font-semibold'
                  : 'border border-dp-border-raised text-dp-text-3 hover:text-dp-text hover:border-dp-muted-2'
              }`}
            >
              {pos === 'ALL' ? 'All' : pos}
            </button>
          ))}
        </div>
        {filterBar}
      </div>

      {!loaded && (
        <p className="text-sm text-dp-muted italic">Player data loading in background…</p>
      )}

      <div className="bg-dp-card-quiet border border-dp-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-dp-card-quiet border-b border-dp-border">{header}</tr>
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
                className="px-3 h-8 rounded-lg border border-dp-border-raised text-dp-text-3 hover:text-dp-text disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-dp-mono px-1 tabular-nums">{safePage} / {totalPages}</span>
              <button
                onClick={() => onPageChange(p => p + 1)}
                disabled={safePage === totalPages}
                className="px-3 h-8 rounded-lg border border-dp-border-raised text-dp-text-3 hover:text-dp-text disabled:opacity-40"
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
