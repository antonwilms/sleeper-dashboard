import { useCallback, useMemo, useState } from 'react'
import Tooltip from '../Tooltip'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { SortTh, PlayerProfile, projectionConfidenceClass } from '../PlayersTab'
import { ExpandableTableRow, ExpandChevron } from '../ui/ExpandableTableRow'
import { buildUsageHistory, computeUsageTrend, buildRoleCohort, classifyRole } from '../../utils/outlookUsage'

const PAGE_SIZE = 50

const ROLE_ORDER = {
  'Every-down back': 0,
  'Every-down': 0,
  'Lead back': 1,
  'Primary target': 1,
  'Committee back': 2,
  'Secondary target': 2,
  'Rotational back': 3,
  'Rotational': 3,
}

function lastNonNull(history) {
  if (!history || history.length === 0) return null
  let snapPct = null, share = null
  for (let i = history.length - 1; i >= 0; i--) {
    if (snapPct === null && history[i].snapPct != null) snapPct = history[i].snapPct
    if (share === null && history[i].share != null) share = history[i].share
    if (snapPct !== null && share !== null) break
  }
  return { snapPct, share }
}

function defaultSortForPosition() {
  return { column: 'projectedPPG', direction: 'desc' }
}

function TrendCell({ trend }) {
  if (!trend) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  const { direction, delta, latestSeason, priorSeason, latest, prior } = trend
  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'
  const colorClass = direction === 'up' ? 'text-[var(--color-positive-text)]'
    : direction === 'down' ? 'text-[var(--color-negative-text)]'
    : 'text-[var(--color-market-neutral)]'
  const pctStr = `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`
  const tooltip = `${latestSeason}: ${Math.round(latest * 100)}% vs ${priorSeason}: ${Math.round(prior * 100)}%`
  return (
    <Tooltip content={tooltip} position="top">
      <span className={`text-xs tabular-nums ${colorClass}`}>
        {arrow}{pctStr}
      </span>
    </Tooltip>
  )
}

function UsageHistoryPanel({ history, shareMetric }) {
  if (!history || history.length === 0) {
    return <span className="text-xs text-[var(--color-text-faintest)]">No usage history.</span>
  }
  const colLabel = shareMetric === 'carry' ? 'Carry Share' : 'Target Share'
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[var(--color-text-faint)] border-b">
          <th className="pb-1.5 text-left font-medium">Season</th>
          <th className="pb-1.5 text-right font-medium">G</th>
          <th className="pb-1.5 text-right font-medium">Snap%</th>
          <th className="pb-1.5 text-right font-medium">{colLabel}</th>
          <th className="pb-1.5 text-right font-medium">PPG</th>
        </tr>
      </thead>
      <tbody>
        {[...history].reverse().map(row => (
          <tr key={row.season} className="border-b hover:bg-[var(--color-surface-2)]">
            <td className="py-1.5 text-[var(--color-text-secondary)] font-medium">{row.season}</td>
            <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">{row.games}</td>
            <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
              {row.snapPct != null
                ? `${Math.round(row.snapPct * 100)}%`
                : <span className="text-[var(--color-text-faintest)]">—</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
              {row.share != null
                ? `${Math.round(row.share * 100)}%`
                : <span className="text-[var(--color-text-faintest)]">—</span>}
            </td>
            <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">{row.ppg.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function OutlookTab({
  playerRows, loaded, careerStats, historicalShares, playerMap,
  positionPeakPPG, ktcMap, collegeStats, seasonProjections, enrichmentMap, advStats,
  comparisonList, addToComparison, removeFromComparison
}) {
  const [posFilter, setPosFilter] = useState('ALL')
  const [sortState, setSortStateRaw] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('outlook-sort'))
      if (v && typeof v.column === 'string' && (v.direction === 'asc' || v.direction === 'desc')) return v
    } catch { /* fall through */ }
    return { column: 'projectedPPG', direction: 'desc' }
  })
  const setSortState = useCallback(next => {
    setSortStateRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      localStorage.setItem('outlook-sort', JSON.stringify(value))
      return value
    })
  }, [])
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  function handleSort(col) {
    setSortState(prev => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      const ascByDefault = col === 'full_name'
      return { column: col, direction: ascByDefault ? 'asc' : 'desc' }
    })
    setPage(1)
  }

  function handlePosFilter(pos) {
    setPosFilter(pos)
    setSortState(defaultSortForPosition(pos))
    setPage(1)
  }

  function toggleExpanded(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const usageByPlayer = useMemo(() => {
    const m = new Map()
    for (const row of (playerRows ?? [])) {
      m.set(row.player_id, buildUsageHistory(row.player_id, row.position, careerStats, historicalShares))
    }
    return m
  }, [playerRows, careerStats, historicalShares])

  const roleCohort = useMemo(() =>
    buildRoleCohort(playerRows ?? [], usageByPlayer),
    [playerRows, usageByPlayer]
  )

  const enrichedRows = useMemo(() => {
    return (playerRows ?? []).map(r => {
      const h = usageByPlayer.get(r.player_id) ?? []
      const latest = lastNonNull(h)
      return {
        ...r,
        _history: h,
        _snapTrend: computeUsageTrend(h, 'snapPct'),
        _oppTrend: computeUsageTrend(h, 'share'),
        _role: classifyRole({
          position: r.position,
          snapPct: latest?.snapPct ?? null,
          share: latest?.share ?? null
        }, roleCohort)
      }
    })
  }, [playerRows, usageByPlayer, roleCohort])

  const displayRows = useMemo(() => {
    let rows = enrichedRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)

    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const key = sortState.column
      if (key === '_snapTrend' || key === '_oppTrend') {
        const va = a[key]?.delta ?? null
        const vb = b[key]?.delta ?? null
        if (va == null && vb == null) return 0
        if (va == null) return dir
        if (vb == null) return -dir
        return dir * (va - vb)
      }
      if (key === '_role') {
        const va = ROLE_ORDER[a._role] ?? 99
        const vb = ROLE_ORDER[b._role] ?? 99
        return dir * (va - vb)
      }
      const va = a[key], vb = b[key]
      if (va == null && vb == null) return 0
      if (va == null) return dir
      if (vb == null) return -dir
      if (typeof va === 'string') return dir * va.localeCompare(vb)
      return dir * (va - vb)
    })
  }, [enrichedRows, posFilter, sortState])

  const totalCount = displayRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = displayRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const start = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const end = Math.min(safePage * PAGE_SIZE, totalCount)

  const sortKey = sortState.column
  const sortAsc = sortState.direction === 'asc'
  const sortProps = { sortKey, sortAsc, onSort: handleSort }

  return (
    <div>
      {/* Position tabs */}
      <div className="flex gap-1 mb-4">
        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
          <button key={pos} onClick={() => handlePosFilter(pos)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              posFilter === pos
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
            }`}>
            {pos}
          </button>
        ))}
      </div>

      {!loaded && (
        <p className="text-sm text-[var(--color-text-faint)] mb-3 italic">Player data loading in background…</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ minWidth: '200px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '104px' }} />
            <col style={{ width: '104px' }} />
            <col style={{ width: '144px' }} />
          </colgroup>
          <thead>
            <tr className="border-b bg-[var(--color-surface-2)]">
              <th className="py-2 px-2" />
              <SortTh label="Player" col="full_name" {...sortProps} />
              <SortTh label="Proj" col="projectedPPG" {...sortProps}
                tooltip="Projected PPG next season. Styled by confidence (bold = high, italic = rookie)." />
              <SortTh label="Snap trend" col="_snapTrend" {...sortProps}
                tooltip="Latest-vs-prior season snap % (RB/WR/TE, 2020+ data). Arrow + Δ percentage-points." />
              <SortTh label="Opp trend" col="_oppTrend" {...sortProps}
                tooltip="Latest-vs-prior target (WR/TE) or carry (RB) share. Arrow + Δpp." />
              <SortTh label="Role" col="_role" {...sortProps}
                tooltip="Descriptive usage class from most-recent snap% and share vs position-cohort tertiles. Not advice." />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => {
              const id = row.player_id
              return (
                <ExpandableTableRow
                  key={id}
                  expanded={expanded.has(id)}
                  colSpan={6}
                  onRowClick={() => setSelectedPlayerId(id)}
                  detail={<UsageHistoryPanel history={row._history} shareMetric={row._history[0]?.shareMetric ?? null} />}
                >
                  {/* Chevron */}
                  <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                    <ExpandChevron
                      expanded={expanded.has(id)}
                      onClick={() => toggleExpanded(id)}
                    />
                  </td>

                  {/* Player */}
                  <td className="py-2 px-3 min-w-0">
                    <div className="font-medium truncate">{row.full_name}</div>
                    <div className="text-xs text-[var(--color-text-faint)] truncate">
                      <span className="font-medium text-[var(--color-text-muted)]">{row.position}</span>
                      {row.age != null && <> · {row.age}</>}
                      {' · '}
                      {row.nfl_team && row.nfl_team !== 'FA'
                        ? <span>{row.nfl_team}</span>
                        : <span className="text-[var(--color-text-faint)]">FA</span>}
                      {row.years_exp != null && <> · {row.years_exp}yr</>}
                    </div>
                  </td>

                  {/* Proj */}
                  <td className="py-2 px-3 tabular-nums">
                    {row.projectedPPG != null ? (
                      <>
                        <span className={projectionConfidenceClass(row.projectionConfidence)}>
                          {row.projectedPPG.toFixed(1)}
                        </span>
                        {row.nextSeasonRank != null && (
                          <span className="block text-[10px] text-[var(--color-text-faintest)] tabular-nums">
                            {row.position}{row.nextSeasonRank}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--color-text-faintest)]">—</span>
                    )}
                  </td>

                  {/* Snap trend */}
                  <td className="py-2 px-3">
                    <TrendCell trend={row._snapTrend} />
                  </td>

                  {/* Opp trend */}
                  <td className="py-2 px-3">
                    <TrendCell trend={row._oppTrend} />
                  </td>

                  {/* Role */}
                  <td className="py-2 px-3">
                    {row._role != null ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                        {row._role}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-faintest)] text-xs">—</span>
                    )}
                  </td>
                </ExpandableTableRow>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[var(--color-text-faint)]">
                  {loaded ? 'No players match your filters.' : 'Loading player data…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-text-muted)]">
          <span>Showing {start}–{end} of {totalCount} players</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={safePage === 1}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Prev</button>
            <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}
              className="px-3 py-1 rounded border text-[var(--color-text-semi-muted)] disabled:opacity-30 hover:bg-[var(--color-surface-2)]">Next</button>
          </div>
        </div>
      )}

      {/* Profile panel + backdrop */}
      {selectedPlayerId && careerStats && (
        <ProfileDataContext.Provider value={{
          careerStats, playersMap: playerMap, playerRows,
          positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
          enrichmentMap, advStats
        }}>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedPlayerId(null)} />
          <PlayerProfile
            key={selectedPlayerId}
            playerId={selectedPlayerId}
            onClose={() => setSelectedPlayerId(null)}
            onSelectPlayer={setSelectedPlayerId}
            comparisonList={comparisonList}
            addToComparison={addToComparison}
            removeFromComparison={removeFromComparison}
          />
        </ProfileDataContext.Provider>
      )}
    </div>
  )
}
