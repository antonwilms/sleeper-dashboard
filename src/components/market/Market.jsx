import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { MarketTable, SortTh } from '../dp/MarketTable'
import { compareNullsLast } from '../../utils/sortUtils'
import { computeConsistency, MIN_POOLED_GAMES } from '../../utils/outlookConsistency'
import { computeDynastySignalBadges } from '../../utils/dynastySignalBadges'
import { computeSeasonAverages } from '../../utils/nflStats'
import { buildUsageHistory, computeUsageTrend, buildRoleCohort, classifyRole } from '../../utils/outlookUsage'
import {
  buildTeamShareTotals, buildPerSeasonTeamShares, buildPositionStatSeries, computeMetricSummary,
} from '../../utils/outlookPositionStats'
import { COLUMNS as PRODUCTION_COLUMNS } from '../players/NflStatsTab'
import { POSITION_STAT_COLUMNS } from '../players/OutlookTab'

// Market (1b Slice iii) — one table over playerRowsWithProj with a Value/Outlook/Production
// column-set switch. /players (PlayersSurface/PlayersTab/OutlookTab/NflStatsTab) stays routed,
// unlinked from the nav, and behaviourally untouched — this is a deliberate, temporary
// duplication (master-plan §6's Slice iii entry, task file §1/§1.1), not an oversight. Market
// v1 ships without the filter panel, saved presets and comparison tray the Explorer has today,
// so /players is not retired yet. The gate for actually retiring it is Market reaching filter
// parity; until then two similar tables coexist on purpose.

const COLUMN_SETS = ['value', 'outlook', 'production']
const COLUMN_SET_LABELS = { value: 'Value', outlook: 'Outlook', production: 'Production' }

const DEFAULT_SORT = {
  value:      { column: 'dynastyScoreValue', direction: 'desc' },
  outlook:    { column: 'projectedPPG',      direction: 'desc' },
  production: { column: 'games',             direction: 'desc' },
}

const VALUE_SORTABLE_KEYS = new Set([
  'full_name', 'dynastyScoreValue', 'divergencePct', 'currentSeasonPPG', 'projectedPPG',
  'floorRiskSd', 'ownerTeamName',
])
const OUTLOOK_SORTABLE_KEYS = new Set([
  'full_name', 'projectedPPG', '_deltaVsNow', '_projGamesSort', '_signalCountSort', '_consistencySort',
  '_snapTrend', '_oppTrend', '_role',
  ...Object.values(POSITION_STAT_COLUMNS).flat().map(c => `_ps_${c.id}`),
])
const PRODUCTION_SORTABLE_KEYS = new Set([
  'full_name', 'games',
  ...Object.values(PRODUCTION_COLUMNS).flat().map(c => c.key),
])
const SORTABLE_KEYS = { value: VALUE_SORTABLE_KEYS, outlook: OUTLOOK_SORTABLE_KEYS, production: PRODUCTION_SORTABLE_KEYS }

const SORT_LABELS = {
  value: {
    full_name: 'player', dynastyScoreValue: 'dynasty score', divergencePct: 'vs market',
    currentSeasonPPG: 'now', projectedPPG: 'next', floorRiskSd: '±SD', ownerTeamName: 'owner',
  },
  outlook: {
    full_name: 'player', projectedPPG: 'proj', _deltaVsNow: 'Δ vs now', _projGamesSort: 'proj G',
    _signalCountSort: 'signals', _consistencySort: 'PPG ± SD', _snapTrend: 'snap trend',
    _oppTrend: 'opp trend', _role: 'role',
  },
  production: { full_name: 'player', games: 'G' },
}

const ROLE_ORDER = {
  'Every-down back': 0, 'Every-down': 0,
  'Lead back': 1, 'Primary target': 1,
  'Committee back': 2, 'Secondary target': 2,
  'Rotational back': 3, 'Rotational': 3,
}

const TONE_TEXT = { positive: 'text-dp-up-text', caution: 'text-dp-down-text', neutral: 'text-dp-muted' }

// Mirrors NflStatsTab.jsx's fmtCell — small pure formatter, not a descriptor map, so a local
// copy (not an import) matches the "harvest derivations, not presentation" line in §2.
const fmtCell = (v, kind) =>
  v == null ? '—'
  : kind === 'pct'     ? `${Math.round(v)}%`
  : kind === 'int'     ? `${v}`
  : v.toFixed(1)  // perGame | ratio

function loadColumnSet() {
  try {
    const v = localStorage.getItem('market-column-set')
    if (COLUMN_SETS.includes(v)) return v
  } catch { /* fall through */ }
  return 'value'
}

function loadProductionSeason() {
  try {
    const v = Number(localStorage.getItem('market-production-season'))
    if (Number.isInteger(v) && v > 1990) return v
  } catch { /* fall through */ }
  return null
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

// ---------------------------------------------------------------------------
// Shared presentational bits
// ---------------------------------------------------------------------------

function PlayerCell({ row }) {
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

function ClickableRow({ row, onOpen, children }) {
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
// not exported; see §2's reuse table).
function CareerBars({ values }) {
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

// VS MARKET — four states (§3.1): undervalued / overvalued / aligned / no-KTC. divergencePct is
// a rank-depth percentage (dynastyScore.js:435), not a price delta — worded as rank distance.
function VsMarketCell({ row }) {
  if (row.ktcValue == null) return <span className="text-dp-muted text-xs">—</span>
  if (row.divergenceSignal === 'undervalued') {
    return (
      <span className="font-dp-mono text-[11px] px-2 py-0.5 rounded-full bg-dp-up-bg text-dp-up-text whitespace-nowrap">
        ▲ {Math.round(row.divergencePct)}% under by rank
      </span>
    )
  }
  if (row.divergenceSignal === 'overvalued') {
    return (
      <span className="font-dp-mono text-[11px] px-2 py-0.5 rounded-full bg-dp-down-bg text-dp-down-text whitespace-nowrap">
        ▼ {Math.round(Math.abs(row.divergencePct))}% over by rank
      </span>
    )
  }
  return <span className="text-dp-muted text-xs">≈ aligned</span>
}

function ConsistencyCell({ c }) {
  const eligible = !!c && c.window >= 2 && c.pooledGames >= MIN_POOLED_GAMES && c.sd != null
  if (!eligible) return <span className="text-dp-muted text-xs">—</span>
  return (
    <span className="font-dp-mono text-xs">
      {c.mean.toFixed(1)} <span className="text-dp-muted">±{c.sd.toFixed(1)}</span>
    </span>
  )
}

function TrendCell({ trend }) {
  if (!trend) return <span className="text-dp-muted text-xs">—</span>
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'
  const cls = trend.direction === 'up' ? 'text-dp-up-text' : trend.direction === 'down' ? 'text-dp-down-text' : 'text-dp-muted'
  const pctStr = `${trend.delta > 0 ? '+' : ''}${Math.round(trend.delta * 100)}%`
  return (
    <span
      title={`${trend.latestSeason}: ${Math.round(trend.latest * 100)}% vs ${trend.priorSeason}: ${Math.round(trend.prior * 100)}%`}
      className={`text-xs font-dp-mono ${cls}`}
    >
      {arrow}{pctStr}
    </span>
  )
}

function PositionStatCell({ summary, col }) {
  if (!summary || summary.level == null) return <span className="text-dp-muted text-xs">—</span>
  const { level, trend } = summary
  const levelStr = col.levelFmt(level)
  if (!trend) return <span className="text-xs font-dp-mono text-dp-text-2">{levelStr}</span>
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'
  const cls = col.valence === 'none'
    ? 'text-dp-muted'
    : trend.direction === 'up' ? 'text-dp-up-text' : trend.direction === 'down' ? 'text-dp-down-text' : 'text-dp-muted'
  return (
    <div title={`${trend.latestSeason}: ${levelStr} vs ${trend.priorSeason}: ${col.levelFmt(trend.prior)}`}>
      <div className={`text-xs font-dp-mono ${cls}`}>{arrow}{col.deltaFmt(trend.delta)}</div>
      <div className="text-[10px] font-dp-mono text-dp-muted">{levelStr}</div>
    </div>
  )
}

function SignalsCell({ signals }) {
  if (!signals || signals.length === 0) return <span className="text-dp-muted text-xs">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map(s => (
        <span key={s.key} title={s.body} className={`text-[11px] whitespace-nowrap ${TONE_TEXT[s.tone]}`}>
          {s.label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

// Note: unlike PlayersSurface's tabs, Market does not need positionPeakPPG/ktcMap/
// historicalShares/collegeStats/enrichmentMap/advStats — it never mounts a profile panel
// itself (row click opens the App-level pop-up, which reads its own data from the App-level
// ProfileDataContext.Provider), and ktcValue/divergence fields already arrive merged onto
// playerRowsWithProj. Declaring unused props here would fail lint.
export function Market({
  playerRows = [], loaded = false, careerStats, playerMap, seasonProjections,
  myTeamName, onOpenPlayerDetail,
}) {
  const [columnSet, setColumnSetRaw] = useState(loadColumnSet)
  const setColumnSet = useCallback(next => {
    setColumnSetRaw(next)
    try { localStorage.setItem('market-column-set', next) } catch { /* ignore */ }
  }, [])

  const { posFilter, sortState, page, sortProps, handlePosFilter, setSortState, setPage } =
    usePlayersTable({ storageKey: 'market-sort', defaultSort: DEFAULT_SORT[columnSet] })

  // §3.4a step 1 — switching column sets re-asserts the NEW set's default sort and resets page.
  const handleSelectColumnSet = useCallback(next => {
    setColumnSet(next)
    setSortState(DEFAULT_SORT[next])
    setPage(1)
  }, [setColumnSet, setSortState, setPage])

  // §3.4a step 3 — a market-sort value restored from localStorage (or left over from a prior
  // column set) that names a column the ACTIVE set has no column for falls back to that set's
  // default, rather than sorting by a key whose comparator yields null for every row.
  useEffect(() => {
    if (!SORTABLE_KEYS[columnSet].has(sortState.column)) {
      setSortState(DEFAULT_SORT[columnSet])
    }
  }, [columnSet, sortState.column, setSortState])

  // Production's own season selector (§3.3) — mirrors NflStatsTab.jsx's tableSeason pattern.
  const [productionSeason, setProductionSeasonRaw] = useState(loadProductionSeason)
  const setProductionSeason = useCallback(v => {
    setProductionSeasonRaw(v)
    try { localStorage.setItem('market-production-season', String(v)) } catch { /* ignore */ }
    setPage(1)
  }, [setPage])
  const productionSeasons = useMemo(
    () => Object.keys(careerStats ?? {}).map(Number).sort((a, b) => b - a),
    [careerStats]
  )
  const activeProductionSeason = (productionSeason != null && productionSeasons.includes(productionSeason))
    ? productionSeason
    : (productionSeasons[0] ?? null)

  // ── Outlook set's shared per-season-team share inputs (also feeds position-stat series) ──
  const teamShareTotals = useMemo(
    () => buildTeamShareTotals(careerStats ?? {}, playerMap ?? {}),
    [careerStats, playerMap]
  )
  const perSeasonTeamShares = useMemo(
    () => buildPerSeasonTeamShares(careerStats ?? {}, teamShareTotals, playerMap ?? {}),
    [careerStats, teamShareTotals, playerMap]
  )
  const usageByPlayer = useMemo(() => {
    if (columnSet !== 'outlook') return new Map()
    const m = new Map()
    for (const row of (playerRows ?? [])) {
      m.set(row.player_id, buildUsageHistory(row.player_id, row.position, careerStats, perSeasonTeamShares))
    }
    return m
  }, [columnSet, playerRows, careerStats, perSeasonTeamShares])
  const roleCohort = useMemo(
    () => (columnSet === 'outlook' ? buildRoleCohort(playerRows ?? [], usageByPlayer) : {}),
    [columnSet, playerRows, usageByPlayer]
  )

  // ── Per-column-set enriched rows — each guarded so only the active set does real work ──
  const valueRows = useMemo(() => {
    if (columnSet !== 'value') return []
    return (playerRows ?? []).map(r => ({
      ...r,
      dynastyScoreValue: r.dynastyScore?.score ?? null,
      floorRiskSd: computeConsistency(careerStats, r.player_id)?.sd ?? null,
    }))
  }, [columnSet, playerRows, careerStats])

  const outlookRows = useMemo(() => {
    if (columnSet !== 'outlook') return []
    return (playerRows ?? []).map(r => {
      const id = r.player_id
      const h = usageByPlayer.get(id) ?? []
      const latest = lastNonNull(h)
      const proj = seasonProjections?.[id]
      const cons = computeConsistency(careerStats, id)
      const consEligible = !!cons && cons.window >= 2 && cons.pooledGames >= MIN_POOLED_GAMES && cons.sd != null
      const delta = (r.projectedPPG != null && r.currentSeasonPPG > 0) ? r.projectedPPG - r.currentSeasonPPG : null

      // Reuse the Slice ii helper but re-apply OutlookTab's own 0.95–1.05 age-curve gate (§3.2)
      // — filtered here, not by editing the shared helper (the pop-up depends on its behaviour).
      const rawSignals = computeDynastySignalBadges(r.dynastyScore?.signals ?? null, r)
      const ageCurveFactor = r.dynastyScore?.signals?.ageCurveFactor
      const signals = rawSignals.filter(b =>
        b.key !== 'agecurve' || (ageCurveFactor != null && (ageCurveFactor >= 1.05 || ageCurveFactor <= 0.95))
      )

      const series = buildPositionStatSeries(id, r.position, careerStats, { perSeasonTeamShares, teamShareTotals })
      const cols = POSITION_STAT_COLUMNS[r.position] ?? []
      const posSummaries = {}
      const posSort = {}
      for (const c of cols) {
        const sum = computeMetricSummary(series[c.id], c.deltaEps)
        posSummaries[c.id] = sum
        posSort[`_ps_${c.id}`] = sum?.level ?? null
      }

      return {
        ...r,
        _snapTrend: computeUsageTrend(h, 'snapPct'),
        _oppTrend: computeUsageTrend(h, 'share'),
        _role: classifyRole({ position: r.position, snapPct: latest?.snapPct ?? null, share: latest?.share ?? null }, roleCohort),
        _consistency: cons,
        _signals: signals,
        _projGames: proj?.projectedGames ?? null,
        _deltaVsNow: delta,
        _projGamesSort: proj?.projectedGames ?? null,
        // Signals sort key counts what Market actually renders (post-filter) — not
        // OutlookTab's _signalCountSort, which counts a different subset (§3.2).
        _signalCountSort: signals.length > 0 ? signals.length : null,
        _consistencySort: consEligible ? cons.mean : null,
        _posSummaries: posSummaries,
        ...posSort,
      }
    })
  }, [columnSet, playerRows, usageByPlayer, roleCohort, seasonProjections, careerStats, perSeasonTeamShares, teamShareTotals])

  const productionRows = useMemo(() => {
    if (columnSet !== 'production') return []
    return (playerRows ?? []).map(r => ({
      ...r,
      _avg: computeSeasonAverages(careerStats?.[activeProductionSeason]?.[r.player_id]),
    }))
  }, [columnSet, playerRows, careerStats, activeProductionSeason])

  const enrichedRows = columnSet === 'value' ? valueRows : columnSet === 'outlook' ? outlookRows : productionRows

  const displayRows = useMemo(() => {
    let rows = enrichedRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)
    const dir = sortState.direction === 'asc' ? 1 : -1
    const key = sortState.column

    if (columnSet === 'value') {
      return [...rows].sort((a, b) => compareNullsLast(a[key], b[key], dir))
    }
    if (columnSet === 'outlook') {
      return [...rows].sort((a, b) => {
        if (key === '_snapTrend' || key === '_oppTrend') return compareNullsLast(a[key]?.delta ?? null, b[key]?.delta ?? null, dir)
        if (key === '_role') {
          const oa = a._role != null ? (ROLE_ORDER[a._role] ?? 99) : null
          const ob = b._role != null ? (ROLE_ORDER[b._role] ?? 99) : null
          return compareNullsLast(oa, ob, dir)
        }
        return compareNullsLast(a[key], b[key], dir)
      })
    }
    // production
    return [...rows].sort((a, b) => {
      if (key === 'full_name') return compareNullsLast(a.full_name, b.full_name, dir)
      return compareNullsLast(a._avg?.[key] ?? null, b._avg?.[key] ?? null, dir)
    })
  }, [enrichedRows, posFilter, sortState, columnSet])

  const activeColumnLabel = useMemo(() => {
    const key = sortState.column
    if (columnSet === 'outlook' && key.startsWith('_ps_')) {
      const id = key.slice(4)
      const found = (POSITION_STAT_COLUMNS[posFilter] ?? []).find(c => c.id === id)
      return found?.label?.toLowerCase() ?? key
    }
    if (columnSet === 'production') {
      const cols = PRODUCTION_COLUMNS[posFilter] ?? PRODUCTION_COLUMNS.ALL
      const found = cols.find(c => c.key === key)
      if (found) return found.label.toLowerCase()
    }
    return SORT_LABELS[columnSet]?.[key] ?? key
  }, [columnSet, sortState.column, posFilter])

  const totalCount = playerRows?.length ?? 0

  // ── Header + row rendering per column set ─────────────────────────────────────────────
  let header, colSpan, renderRow

  if (columnSet === 'value') {
    colSpan = 8
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Dynasty score" col="dynastyScoreValue" {...sortProps} />
        <SortTh label="Vs market" col="divergencePct" {...sortProps} />
        <th className="px-3 py-[9px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-left text-dp-muted whitespace-nowrap">
          Career PPG
        </th>
        <SortTh label="Now" col="currentSeasonPPG" {...sortProps} align="right" />
        <SortTh label="Next" col="projectedPPG" {...sortProps} align="right" />
        <SortTh label="±SD" col="floorRiskSd" {...sortProps} align="right" />
        <SortTh label="Owner" col="ownerTeamName" {...sortProps} />
      </>
    )
    renderRow = row => {
      const delta = (row.projectedPPG != null && row.currentSeasonPPG > 0) ? row.projectedPPG - row.currentSeasonPPG : null
      return (
        <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
          <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
          <td className="px-3 py-3 w-[230px]">
            {row.dynastyScoreValue != null ? (
              <div className="flex items-center gap-2.5">
                <span className="font-dp-mono text-[15px] font-semibold w-[26px] text-dp-text">{row.dynastyScoreValue}</span>
                <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
                  <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${Math.max(0, Math.min(100, row.dynastyScoreValue))}%` }} />
                </div>
                <span className="text-[11px] text-dp-muted w-[88px] truncate">{row.dynastyScore?.label ?? ''}</span>
              </div>
            ) : <span className="text-dp-muted text-xs">—</span>}
          </td>
          <td className="px-3 py-3"><VsMarketCell row={row} /></td>
          <td className="px-3 py-3"><CareerBars values={row.careerSparkline} /></td>
          <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
            {row.currentSeasonPPG != null ? row.currentSeasonPPG.toFixed(1) : '—'}
          </td>
          <td className="px-3 py-3 text-right">
            <div className="font-dp-mono text-[13px] text-dp-text">{row.projectedPPG != null ? row.projectedPPG.toFixed(1) : '—'}</div>
            <div className={`font-dp-mono text-[11px] ${delta == null ? 'text-dp-muted' : delta > 0 ? 'text-dp-up-text' : delta < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}>
              {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
            </div>
          </td>
          <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
            {row.floorRiskSd != null ? `±${row.floorRiskSd.toFixed(1)}` : '—'}
          </td>
          <td className="px-[18px] py-3 text-[12px]">
            <span className={row.ownerTeamName != null && row.ownerTeamName === myTeamName ? 'text-dp-up-text' : 'text-dp-text-2'}>
              {row.ownerTeamName ?? 'Unowned'}
            </span>
          </td>
        </ClickableRow>
      )
    }
  } else if (columnSet === 'outlook') {
    const posCols = POSITION_STAT_COLUMNS[posFilter] ?? []
    colSpan = 6 + (posFilter === 'ALL' ? 3 : posCols.length)
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Proj" col="projectedPPG" {...sortProps} align="right" />
        <SortTh label="Δ vs now" col="_deltaVsNow" {...sortProps} align="right" />
        <SortTh label="Proj G" col="_projGamesSort" {...sortProps} align="right" />
        <SortTh label="Signals" col="_signalCountSort" {...sortProps} />
        <SortTh label="PPG ± SD" col="_consistencySort" {...sortProps} align="right" />
        {posFilter === 'ALL' ? (
          <>
            <SortTh label="Snap trend" col="_snapTrend" {...sortProps} />
            <SortTh label="Opp trend" col="_oppTrend" {...sortProps} />
            <SortTh label="Role" col="_role" {...sortProps} />
          </>
        ) : (
          posCols.map(c => <SortTh key={c.id} label={c.label} col={`_ps_${c.id}`} tooltip={c.tooltip} {...sortProps} align="right" />)
        )}
      </>
    )
    renderRow = row => (
      <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
        <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
        <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
          {row.projectedPPG != null ? row.projectedPPG.toFixed(1) : '—'}
        </td>
        <td className="px-3 py-3 text-right">
          {row._deltaVsNow == null ? <span className="text-dp-muted text-xs">—</span> : (
            <span className={`font-dp-mono text-xs ${row._deltaVsNow > 0 ? 'text-dp-up-text' : row._deltaVsNow < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}>
              {row._deltaVsNow > 0 ? '+' : ''}{row._deltaVsNow.toFixed(1)}
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
          {row._projGames != null ? row._projGames : <span className="text-dp-muted text-xs">—</span>}
        </td>
        <td className="px-3 py-3"><SignalsCell signals={row._signals} /></td>
        <td className="px-3 py-3 text-right"><ConsistencyCell c={row._consistency} /></td>
        {posFilter === 'ALL' ? (
          <>
            <td className="px-3 py-3"><TrendCell trend={row._snapTrend} /></td>
            <td className="px-3 py-3"><TrendCell trend={row._oppTrend} /></td>
            <td className="px-3 py-3">
              {row._role != null
                ? <span className="text-xs px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-2">{row._role}</span>
                : <span className="text-dp-muted text-xs">—</span>}
            </td>
          </>
        ) : (
          posCols.map(c => (
            <td key={c.id} className="px-3 py-3 text-right">
              <PositionStatCell summary={row._posSummaries?.[c.id]} col={c} />
            </td>
          ))
        )}
      </ClickableRow>
    )
  } else {
    // production
    const cols = PRODUCTION_COLUMNS[posFilter] ?? PRODUCTION_COLUMNS.ALL
    colSpan = 2 + cols.length
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="G" col="games" {...sortProps} align="right" />
        {cols.map(c => <SortTh key={c.key} label={c.label} col={c.key} {...sortProps} align="right" />)}
      </>
    )
    renderRow = row => (
      <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
        <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
        <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
          {row._avg.games > 0 ? row._avg.games : <span className="text-dp-muted text-xs">—</span>}
        </td>
        {cols.map(c => (
          <td key={c.key} className="px-3 py-3 text-right whitespace-nowrap font-dp-mono text-[13px] text-dp-text">
            {fmtCell(row._avg[c.key], c.fmt)}
          </td>
        ))}
      </ClickableRow>
    )
  }

  return (
    // bg-dp-canvas is required, not decorative — Slice i §1.1.
    <div className="bg-dp-canvas flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Market</h1>
          <p className="text-[13px] text-dp-muted mt-1">{totalCount} players · every asset in the league, owned or not</p>
        </div>
        <div className="flex items-center gap-3">
          {columnSet === 'production' && productionSeasons.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-dp-muted">
              Season
              <select
                value={activeProductionSeason ?? ''}
                onChange={e => setProductionSeason(Number(e.target.value))}
                className="bg-dp-card border border-dp-border rounded-md px-2 py-1 text-xs text-dp-text-2"
              >
                {productionSeasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <div className="flex items-center gap-1 bg-dp-card border border-dp-border rounded-lg p-[3px]">
            {COLUMN_SETS.map(cs => (
              <button
                key={cs}
                onClick={() => handleSelectColumnSet(cs)}
                className={`px-3.5 py-[5px] rounded-md text-xs transition-colors ${
                  columnSet === cs ? 'bg-dp-chip text-dp-text font-semibold' : 'text-dp-text-4'
                }`}
              >
                {COLUMN_SET_LABELS[cs]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MarketTable
        posFilter={posFilter}
        onPosFilter={handlePosFilter}
        loaded={loaded}
        header={header}
        colSpan={colSpan}
        displayRows={displayRows}
        page={page}
        onPageChange={setPage}
        renderRow={renderRow}
        activeColumnLabel={activeColumnLabel}
      />
    </div>
  )
}
