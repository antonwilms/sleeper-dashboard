import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerProfile } from '../PlayersTab'

const PAGE_SIZE = 50

export function PlayersDataTable({ posFilter, onPosFilter, pillRowClassName, toolbar = null,
  loaded, tableClassName, colgroup = null, header, colSpan, displayRows, page, onPageChange,
  renderRow, selectedPlayerId, onCloseProfile, onSelectPlayer, profileContextValue,
  comparisonList = [], addToComparison, removeFromComparison }) {

  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end   = Math.min(safePage * PAGE_SIZE, totalCount)

  return (
    <div>
      {/* Pills row (+ optional toolbar) — verbatim button markup from OutlookTab :217–228 */}
      <div className={pillRowClassName}>
        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
          <button key={pos} onClick={() => onPosFilter(pos)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              posFilter === pos
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
            }`}>{pos}</button>
        ))}
        {toolbar}
      </div>

      {!loaded && (
        <p className="text-sm text-[var(--color-text-faint)] mb-3 italic">Player data loading in background…</p>
      )}

      <div className="overflow-x-auto">
        <table className={`w-full text-sm ${tableClassName}`}>
          {colgroup}
          <thead>
            <tr className="border-b bg-[var(--color-surface-2)]">{header}</tr>
          </thead>
          <tbody>
            {pageRows.map(renderRow)}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-[var(--color-text-faint)]">
                  {loaded ? 'No players match your filters.' : 'Loading player data…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        /* Pagination — verbatim from OutlookTab :344–355 */
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
          <span>Showing {start}–{end} of {totalCount} players</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(p => p - 1)} disabled={safePage === 1}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Prev</button>
            <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
            <button onClick={() => onPageChange(p => p + 1)} disabled={safePage === totalPages}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Next</button>
          </div>
        </div>
      )}

      {selectedPlayerId && profileContextValue?.careerStats && (
        /* Profile panel + backdrop — verbatim from OutlookTab :358–375 (10-key value object) */
        <ProfileDataContext.Provider value={profileContextValue}>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={onCloseProfile} />
          <PlayerProfile
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            onClose={onCloseProfile}
            onSelectPlayer={onSelectPlayer}
            comparisonList={comparisonList}
            addToComparison={addToComparison}
            removeFromComparison={removeFromComparison}
          />
        </ProfileDataContext.Provider>
      )}
    </div>
  )
}
