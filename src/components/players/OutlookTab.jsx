import { useMemo } from 'react'
import Tooltip from '../Tooltip'
import { SortTh, projectionConfidenceClass } from '../PlayersTab'
import { ExpandableTableRow, ExpandChevron } from '../ui/ExpandableTableRow'
import { buildUsageHistory, computeUsageTrend, buildRoleCohort, classifyRole } from '../../utils/outlookUsage'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { PlayersDataTable } from './PlayersDataTable'
import { compareNullsLast } from '../../utils/sortUtils'
import { computeConsistency, MIN_POOLED_GAMES } from '../../utils/outlookConsistency'

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

const DEFAULT_SORT = { column: 'projectedPPG', direction: 'desc' }

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

function DeltaCell({ proj, cur }) {
  if (proj == null || !(cur > 0)) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  const d = proj - cur
  const dir = d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'
  const colorClass = dir === 'up' ? 'text-[var(--color-positive-text)]'
    : dir === 'down' ? 'text-[var(--color-negative-text)]'
    : 'text-[var(--color-market-neutral)]'
  const label = `${d > 0 ? '+' : ''}${d.toFixed(1)}`
  return (
    <Tooltip content={`Proj ${proj.toFixed(1)} vs now ${cur.toFixed(1)}`} position="top">
      <span className={`text-xs tabular-nums ${colorClass}`}>{arrow}{label}</span>
    </Tooltip>
  )
}

function SignalCluster({ signals }) {
  if (!signals) return null
  const glyphs = []

  if (signals.isBreakout) {
    glyphs.push(
      <Tooltip key="breakout" content="Performing 30%+ above age-curve expectation…" position="top">
        <span className="text-[var(--color-positive-text)]">⚡</span>
      </Tooltip>
    )
  }
  if (signals.isBounceBack) {
    glyphs.push(
      <Tooltip key="bounceback" content="Strong return after injury-shortened season" position="top">
        <span className="text-[var(--c-blue-700)]">↩</span>
      </Tooltip>
    )
  }
  if (signals.momentumLabel === 'accelerating') {
    glyphs.push(
      <Tooltip key="accel" content="Production significantly higher in last 2 seasons vs prior 2" position="top">
        <span className="text-[var(--color-positive-text)]">↑↑</span>
      </Tooltip>
    )
  }
  if (signals.momentumLabel === 'decelerating') {
    glyphs.push(
      <Tooltip key="decel" content="Production significantly lower in last 2 seasons vs prior 2" position="top">
        <span className="text-[var(--color-negative-text)]">↓↓</span>
      </Tooltip>
    )
  }
  if (signals.isTdReliant) {
    glyphs.push(
      <Tooltip key="td" content={`${Math.round((signals.tdDependency ?? 0) * 100)}% of points from touchdowns…`} position="top">
        <span className="text-[var(--color-caution-text)]">⚠</span>
      </Tooltip>
    )
  }
  if (signals.ageCurveFactor != null && signals.ageCurveFactor >= 1.05) {
    glyphs.push(
      <Tooltip key="age-up" content="Performing above expected level for age" position="top">
        <span className="text-[var(--color-text-muted)]">↑</span>
      </Tooltip>
    )
  }
  if (signals.ageCurveFactor != null && signals.ageCurveFactor <= 0.95) {
    glyphs.push(
      <Tooltip key="age-down" content="Performing below expected level for age" position="top">
        <span className="text-[var(--color-text-muted)]">↓</span>
      </Tooltip>
    )
  }

  if (glyphs.length === 0) return null
  return <span className="inline-flex gap-1 text-xs">{glyphs}</span>
}

function ConsistencyCell({ c }) {
  const eligible = !!c && c.window >= 2 && c.pooledGames >= MIN_POOLED_GAMES && c.sd != null
  if (!eligible) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  return (
    <Tooltip content={`Mean ± SD of per-game fantasy points over last ${c.window} qualifying seasons (${c.pooledGames} games)`} position="top">
      <span className="text-xs tabular-nums">
        {c.mean.toFixed(1)}{' '}
        <span className="text-[var(--color-text-faint)]">±{c.sd.toFixed(1)}</span>
      </span>
    </Tooltip>
  )
}

function AdjustmentNarrative({ lines }) {
  if (!lines || !lines.length) {
    return <span className="text-xs text-[var(--color-text-faint)]">No notable projection adjustments.</span>
  }
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Why next season</div>
      <div className="flex flex-wrap gap-1">
        {lines.map((t, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">{t}</span>
        ))}
      </div>
    </div>
  )
}

function DistributionPanel({ c }) {
  if (!c) {
    return <span className="text-xs text-[var(--color-text-faint)]">Not enough qualifying seasons for a distribution.</span>
  }
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Scoring distribution</div>
      {c.boomRate != null && (
        <Tooltip content="Boom = games ≥ 1.5× this player's pooled mean; Bust = games ≤ 0.5×. Self-relative — no positional threshold." position="top">
          <div className="text-xs text-[var(--color-text-faint)] mb-1.5">
            {`Boom ${Math.round(c.boomRate * 100)}% · Bust ${Math.round(c.bustRate * 100)}%`}
          </div>
        </Tooltip>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--color-text-faint)] border-b">
            <th className="pb-1.5 text-left font-medium">Season</th>
            <th className="pb-1.5 text-right font-medium">G</th>
            <th className="pb-1.5 text-right font-medium">PPG</th>
            <th className="pb-1.5 text-right font-medium">SD</th>
            <th className="pb-1.5 text-right font-medium">CV</th>
          </tr>
        </thead>
        <tbody>
          {c.seasons.map(s => (
            <tr key={s.season} className="border-b hover:bg-[var(--color-surface-2)]">
              <td className="py-1.5 text-[var(--color-text-secondary)] font-medium">{s.season}</td>
              <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">{s.games}</td>
              <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                {s.mean != null ? s.mean.toFixed(1) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                {s.sd != null ? s.sd.toFixed(1) : '—'}
              </td>
              <td className="py-1.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                {s.cv != null ? s.cv.toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const { posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
          handlePosFilter, toggleExpanded, setPage, setSelectedPlayerId } =
    usePlayersTable({ storageKey: 'outlook-sort', defaultSort: DEFAULT_SORT })

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

  const consistencyByPlayer = useMemo(() => {
    const m = new Map()
    for (const row of (playerRows ?? [])) m.set(row.player_id, computeConsistency(careerStats, row.player_id))
    return m
  }, [playerRows, careerStats])

  const enrichedRows = useMemo(() => {
    return (playerRows ?? []).map(r => {
      const id = r.player_id
      const h = usageByPlayer.get(id) ?? []
      const latest = lastNonNull(h)
      const proj = seasonProjections?.[id]
      const cons = consistencyByPlayer.get(id) ?? null
      const sig = r.dynastyScore?.signals ?? null
      const consEligible = !!cons && cons.window >= 2 && cons.pooledGames >= MIN_POOLED_GAMES && cons.sd != null
      const delta = (r.projectedPPG != null && r.currentSeasonPPG > 0) ? r.projectedPPG - r.currentSeasonPPG : null
      const signalCount =
        (sig ? ((sig.isBreakout ? 1 : 0) + (sig.isBounceBack ? 1 : 0)
             + (sig.momentumLabel === 'accelerating' || sig.momentumLabel === 'decelerating' ? 1 : 0)
             + (sig.isTdReliant ? 1 : 0)
             + (sig.ageCurveFactor != null && (sig.ageCurveFactor >= 1.05 || sig.ageCurveFactor <= 0.95) ? 1 : 0)) : 0)
      return {
        ...r,
        _history: h,
        _snapTrend: computeUsageTrend(h, 'snapPct'),
        _oppTrend: computeUsageTrend(h, 'share'),
        _role: classifyRole({
          position: r.position,
          snapPct: latest?.snapPct ?? null,
          share: latest?.share ?? null
        }, roleCohort),
        _consistency:     cons,
        _signals:         sig,
        _projGames:       proj?.projectedGames ?? null,
        _adjustments:     proj?.adjustmentSummary ?? [],
        _deltaVsNow:      delta,
        _projGamesSort:   proj?.projectedGames ?? null,
        _signalCountSort: signalCount > 0 ? signalCount : null,
        _consistencySort: consEligible ? cons.mean : null,
      }
    })
  }, [playerRows, usageByPlayer, roleCohort, seasonProjections, consistencyByPlayer])

  const displayRows = useMemo(() => {
    let rows = enrichedRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)

    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const key = sortState.column
      if (key === '_snapTrend' || key === '_oppTrend')
        return compareNullsLast(a[key]?.delta ?? null, b[key]?.delta ?? null, dir)
      if (key === '_role') {
        const oa = a._role != null ? (ROLE_ORDER[a._role] ?? 99) : null
        const ob = b._role != null ? (ROLE_ORDER[b._role] ?? 99) : null
        return compareNullsLast(oa, ob, dir)
      }
      return compareNullsLast(a[key], b[key], dir)
    })
  }, [enrichedRows, posFilter, sortState])

  return (
    <PlayersDataTable
      posFilter={posFilter}
      onPosFilter={handlePosFilter}
      pillRowClassName="flex gap-1 mb-4"
      loaded={loaded}
      tableClassName="table-auto"
      colSpan={10}
      header={<>
        <th className="py-2 px-2" />
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Proj" col="projectedPPG" {...sortProps}
          tooltip="Projected PPG next season. Styled by confidence (bold = high, italic = rookie)." />
        <SortTh label="Δ vs now" col="_deltaVsNow" {...sortProps}
          tooltip="Projected PPG minus current/most-recent PPG (same PPG as the Value tab). Position-agnostic." />
        <SortTh label="Proj G" col="_projGamesSort" {...sortProps}
          tooltip="Projected games played next season (durability outlook). Position-agnostic." />
        <SortTh label="Signals" col="_signalCountSort" {...sortProps}
          tooltip="Projection signal flags (same as the Profile → Dynasty tab): ⚡ breakout · ↩ bounce-back · ↑↑/↓↓ trajectory · ⚠ TD-reliant · ↑/↓ age curve. Sorts by active-flag count." />
        <SortTh label="PPG ± SD" col="_consistencySort" {...sortProps}
          tooltip="Mean ± standard deviation of per-game fantasy points over the last 3 qualifying seasons (pooled). Sorts by mean. Position-agnostic." />
        <SortTh label="Snap trend" col="_snapTrend" {...sortProps}
          tooltip="Latest-vs-prior season snap % (RB/WR/TE, 2020+ data). Arrow + Δ percentage-points." />
        <SortTh label="Opp trend" col="_oppTrend" {...sortProps}
          tooltip="Latest-vs-prior target (WR/TE) or carry (RB) share. Arrow + Δpp." />
        <SortTh label="Role" col="_role" {...sortProps}
          tooltip="Descriptive usage class from most-recent snap% and share vs position-cohort tertiles. Not advice." />
      </>}
      displayRows={displayRows}
      page={page}
      onPageChange={setPage}
      renderRow={row => {
        const id = row.player_id
        return (
          <ExpandableTableRow
            key={id}
            expanded={expanded.has(id)}
            colSpan={10}
            onRowClick={() => setSelectedPlayerId(id)}
            detail={
              <div className="space-y-4">
                <AdjustmentNarrative lines={row._adjustments} />
                <DistributionPanel c={row._consistency} />
                <UsageHistoryPanel history={row._history} shareMetric={row._history[0]?.shareMetric ?? null} />
              </div>
            }
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

            {/* Δ vs now */}
            <td className="py-2 px-3"><DeltaCell proj={row.projectedPPG} cur={row.currentSeasonPPG} /></td>

            {/* Proj G */}
            <td className="py-2 px-3 tabular-nums">
              {row._projGames != null ? row._projGames : <span className="text-[var(--color-text-faintest)] text-xs">—</span>}
            </td>

            {/* Signals */}
            <td className="py-2 px-3"><SignalCluster signals={row._signals} /></td>

            {/* PPG ± SD */}
            <td className="py-2 px-3"><ConsistencyCell c={row._consistency} /></td>

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
      }}
      selectedPlayerId={selectedPlayerId}
      onCloseProfile={() => setSelectedPlayerId(null)}
      onSelectPlayer={setSelectedPlayerId}
      profileContextValue={{
        careerStats, playersMap: playerMap, playerRows,
        positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
        enrichmentMap, advStats
      }}
      comparisonList={comparisonList}
      addToComparison={addToComparison}
      removeFromComparison={removeFromComparison}
    />
  )
}
