import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { MarketTable } from '../dp/MarketTable'
import { SortTh, PlayerCell, ClickableRow, CareerBars, DeltaCell } from '../dp/cells'
import { TrendCell } from '../dp/TrendCell'
import { compareNullsLast } from '../../utils/sortUtils'
import { computeConsistency, MIN_POOLED_GAMES } from '../../utils/outlookConsistency'
import { buildSeasonPositionRanks, computeCeilingFloor } from '../../utils/seasonRanks'
import { computeDynastySignalBadges } from '../../utils/dynastySignalBadges'
import { computeSeasonAverages } from '../../utils/nflStats'
import { buildUsageHistory, computeUsageTrend, buildRoleCohort, classifyRole } from '../../utils/outlookUsage'
import {
  buildTeamShareTotals, buildPerSeasonTeamShares, buildPositionStatSeries, computeMetricSummary,
} from '../../utils/outlookPositionStats'
import { COLUMNS as VOLUME_COLUMNS, POSITION_STAT_COLUMNS } from './columnDescriptors'
import { DEFAULT_MARKET_FILTERS, applyMarketFilters, activeFilterCount, normalizeFilters } from '../../utils/marketFilters'
import { FilterBar } from './FilterBar'

// Market (1b Slice iii) — one table over playerRowsWithProj with a Value/Outlook/Volume
// column-set switch. Slice vi added the filter bar + panel (union of the Explorer's filter set
// plus the design's Min projected games — master-plan §6a); Slice vii added free-text search
// (§2, inside `filters`) and saved presets (§3, in FilterBar). Filter/search/preset parity with
// the Explorer was the gate for retiring it — 1b Slice viii deleted `/players`
// (`PlayersSurface`/`PlayersTab`/`OutlookTab`/`NflStatsTab`) once that parity was reached; Market
// is now the only table over this data. dp-v2 Slice 5a renamed the Production set to Volume,
// grouped the set control into MODEL & MARKET / ON FIELD, and added a persistent TREND gutter
// (KTC-history delta/window/band from `seasonProjections[id].factors`, sparkline from the new
// `ktcHistory` prop) right of PLAYER, present under every set.

const COLUMN_SETS = ['value', 'outlook', 'volume']
const COLUMN_SET_LABELS = { value: 'Value', outlook: 'Outlook', volume: 'Volume' }

// Two labelled groups (§3): the left pair is what the model and the market think, the right is
// what happened on the field. Adding a fifth set later extends a group rather than the flat row.
const COLUMN_SET_GROUPS = [
  { label: 'MODEL & MARKET', sets: ['value', 'outlook'] },
  { label: 'ON FIELD',       sets: ['volume'] },
]

const DEFAULT_SORT = {
  value:   { column: 'dynastyScoreValue', direction: 'desc' },
  outlook: { column: 'projectedPPG',      direction: 'desc' },
  volume:  { column: 'games',             direction: 'desc' },
}

const VALUE_SORTABLE_KEYS = new Set([
  'full_name', '_trend', 'dynastyScoreValue', 'divergencePct', 'ktcValue', 'ceilingRank', 'floorRank',
  'currentSeasonPPG', 'projectedPPG', 'floorRiskSd', 'ownerTeamName',
])
const OUTLOOK_SORTABLE_KEYS = new Set([
  'full_name', '_trend', 'projectedPPG', '_deltaVsNow', '_projGamesSort', '_signalCountSort', '_consistencySort',
  '_snapTrend', '_oppTrend', '_role',
  ...Object.values(POSITION_STAT_COLUMNS).flat().map(c => `_ps_${c.id}`),
])
const VOLUME_SORTABLE_KEYS = new Set([
  'full_name', '_trend', 'games',
  ...Object.values(VOLUME_COLUMNS).flat().map(c => c.key),
])
const SORTABLE_KEYS = { value: VALUE_SORTABLE_KEYS, outlook: OUTLOOK_SORTABLE_KEYS, volume: VOLUME_SORTABLE_KEYS }

const SORT_LABELS = {
  value: {
    full_name: 'player', _trend: 'trend', dynastyScoreValue: 'dynasty score', divergencePct: 'vs market',
    ktcValue: 'ktc', ceilingRank: 'ceiling', floorRank: 'floor',
    currentSeasonPPG: 'now', projectedPPG: 'next', floorRiskSd: '±SD', ownerTeamName: 'owner',
  },
  outlook: {
    full_name: 'player', _trend: 'trend', projectedPPG: 'proj', _deltaVsNow: 'Δ vs now', _projGamesSort: 'proj G',
    _signalCountSort: 'signals', _consistencySort: 'PPG ± SD', _snapTrend: 'snap trend',
    _oppTrend: 'opp trend', _role: 'role',
  },
  volume: { full_name: 'player', _trend: 'trend', games: 'G' },
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
    const raw = localStorage.getItem('market-column-set')
    // dp-v2 Slice 5a renamed the 'production' set to 'volume'. A stored 'production' from before
    // the rename must migrate here, once — the validated-read fallback below returns 'value' for
    // anything not in COLUMN_SETS, so an unmigrated 'production' would silently drop the user's
    // choice to Value with no error and no sign it happened.
    const migrated = raw === 'production' ? 'volume' : raw
    if (COLUMN_SETS.includes(migrated)) {
      if (migrated !== raw) {
        try { localStorage.setItem('market-column-set', migrated) } catch { /* ignore */ }
      }
      return migrated
    }
  } catch { /* fall through */ }
  return 'value'
}

function loadVolumeSeason() {
  try {
    // Key stays named for the set's FORMER name ('production') — deliberately not migrated. The
    // read falls back to volumeSeasons[0] on a miss, so renaming the key would silently drop every
    // user's stored season with no error (settled in dp-v2 5a plan review, §2).
    const v = Number(localStorage.getItem('market-production-season'))
    if (Number.isInteger(v) && v > 1990) return v
  } catch { /* fall through */ }
  return null
}

function loadFilters() {
  try {
    return normalizeFilters(JSON.parse(localStorage.getItem('market-filters')))
  } catch { /* fall through */ }
  return DEFAULT_MARKET_FILTERS
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
// Shared presentational bits — CareerBars/PlayerCell/ClickableRow/DeltaCell/SortTh moved to
// dp/cells.jsx (1b Slice iv) so Portfolio can import rather than fork them; only Market-specific
// cells stay local.
// ---------------------------------------------------------------------------

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

// Ceiling/Floor (Slice vii follow-up) — best/worst single-season positional finish, harvested
// from the Explorer's CeilingFloorCell (PlayersTab.jsx) and re-skinned to dp tokens. Deliberately
// drops the Explorer's tier-colored rank badge (bg-[--c-green-100]/etc.) — those raw chromatic
// primitives carry a `.dark` override that follows the app's former light/dark TOGGLE, but Market
// is forced dark regardless of it (§5.1 of the redesign), so a tier badge would render with
// light-mode colors against a dark row whenever the toggle is off. Plain mono text avoids the
// mismatch entirely; only the delta reuses an existing token pair (dp-up-text/dp-down-text),
// which IS safe — it's part of the dp family itself, not a toggle-following raw primitive.
function CeilingFloorCell({ position, data }) {
  if (!data) return <span className="text-dp-muted text-xs">—</span>
  const { season, rank, points, delta, refAvg } = data
  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="font-dp-mono text-[10px] text-dp-text-3">{position}{rank}</span>
        <span className="text-[10px] text-dp-muted">{season}</span>
      </div>
      <div
        className="text-xs font-dp-mono text-dp-text-2"
        title={refAvg != null ? `vs ${position}${rank} avg (${Math.round(refAvg)} pts)` : undefined}
      >
        {Math.round(points)}
        {delta != null && delta !== 0 && (
          <span className={delta > 0 ? 'text-dp-up-text' : 'text-dp-down-text'}> {delta > 0 ? '+' : ''}{delta}</span>
        )}
      </div>
    </div>
  )
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

// Renamed from the module-local `TrendCell` (dp-v2 Slice 5a §4.4) — the Outlook set's Snap/Opp
// trend cells. Distinct from `dp/TrendCell` (imported above), which now owns that name for the
// persistent TREND gutter. Behaviour is unchanged from before the rename; only the identifier
// moved. Converging these two Outlook columns onto the dp primitive is a later, deliberate choice
// (they'd render differently), not this slice's scope.
function UsageTrendCell({ trend }) {
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

// Note: Market does not need positionPeakPPG/ktcMap/historicalShares/collegeStats/enrichmentMap/
// advStats — it never mounts a profile panel itself (row click opens the App-level pop-up, which
// reads its own data from the App-level ProfileDataContext.Provider), and ktcValue/divergence
// fields already arrive merged onto playerRowsWithProj. Declaring unused props here would fail lint.
// `ktcHistory` (dp-v2 Slice 5a) is threaded explicitly, for the TREND gutter's sparkline only —
// delta/window/band come from `seasonProjections[id].factors`, already merged onto rows upstream;
// Market stays props-only.
export function Market({
  playerRows = [], loaded = false, careerStats, playerMap, seasonProjections, ktcHistory,
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

  // Volume's own season selector (§3.3) — mirrors NflStatsTab.jsx's tableSeason pattern. Named
  // `volume*` throughout except the localStorage key itself (see loadVolumeSeason's comment).
  const [volumeSeason, setVolumeSeasonRaw] = useState(loadVolumeSeason)
  const setVolumeSeason = useCallback(v => {
    setVolumeSeasonRaw(v)
    try { localStorage.setItem('market-production-season', String(v)) } catch { /* ignore */ }
    setPage(1)
  }, [setPage])
  const volumeSeasons = useMemo(
    () => Object.keys(careerStats ?? {}).map(Number).sort((a, b) => b - a),
    [careerStats]
  )
  const activeVolumeSeason = (volumeSeason != null && volumeSeasons.includes(volumeSeason))
    ? volumeSeason
    : (volumeSeasons[0] ?? null)

  // ── Filters (1b Slice vi) — view-local, like columnSet; not App.jsx domain state. Changing
  // filters resets page to 1, same as the column-set switch and the volume season selector. ──
  const [filters, setFiltersRaw] = useState(loadFilters)
  const setFilters = useCallback(next => {
    setFiltersRaw(next)
    // search is blanked before writing — the in-memory `next` still drives the table, only the
    // serialized copy is blanked. This is the WRITE half of the two-ends guarantee (§2); the READ
    // half is normalizeFilters forcing search to '' unconditionally (marketFilters.js). Needed
    // because this setter runs on every keystroke of the search input, not just filter changes.
    try { localStorage.setItem('market-filters', JSON.stringify({ ...next, search: '' })) } catch { /* ignore */ }
    setPage(1)
  }, [setPage])

  // fantasyTeams options: distinct non-null ownerTeamName values in playerRows. Market is not
  // passed a fantasyTeamNames prop — deriving from rows avoids a new prop while matching what
  // the table can actually show (§4).
  const fantasyTeamOptions = useMemo(
    () => [...new Set((playerRows ?? []).map(r => r.ownerTeamName).filter(Boolean))].sort(),
    [playerRows]
  )

  // ── TREND gutter (dp-v2 Slice 5a §4.1) — persists across every column set, so it is computed
  // once here, not per-set. The signals are already computed: seasonProjection.js:307 calls
  // computeKtcSignals per player and spreads all 13 ktcHist* keys onto factors, and Market already
  // reads seasonProjections?.[id] — so delta/window/band are read off `factors`, never recomputed.
  // ktcHistory.series[id] is the only genuinely new thread, and only for the sparkline's raw
  // series; its entries are OBJECTS ({date, value, positionRank, valueVsPosMedian}), not numbers,
  // so they are mapped to `.value` here before ever reaching dp/TrendCell (which keeps only finite
  // numbers — passing the objects through would render every bar as a void slot).
  //
  // Formatting is the call site's job, not the primitive's: ktcHistDelta (the point delta) is
  // used rather than ktcHistDeltaPct, because dp/TrendCell's DeltaGlyph renders `delta` as a bare
  // number with no unit suffix — a rounded fraction read bare ("▲ 0.052") is meaningless, and a
  // percentage without a "%" is ambiguous, but a raw KTC point change needs no unit since Market's
  // own KTC column already shows raw values on the same 0–10000 scale. ktcHistWindowSpanDays (a
  // bare day count) is converted to whole weeks with a "w" suffix, matching the TrendCell window
  // label's own style elsewhere (e.g. a 13-week market trend).
  const trendByPlayer = useMemo(() => {
    const m = new Map()
    for (const row of (playerRows ?? [])) {
      const id = row.player_id
      const factors = seasonProjections?.[id]?.factors
      const rawSeries = ktcHistory?.series?.[id]
      const values = rawSeries ? rawSeries.map(p => p.value) : null
      const delta = factors?.ktcHistDelta != null ? Math.round(factors.ktcHistDelta) : null
      const window = factors?.ktcHistWindowSpanDays != null
        ? `${Math.round(factors.ktcHistWindowSpanDays / 7)}w`
        : null
      const band = factors?.ktcHistConfidence ?? 'none'
      m.set(id, { values, delta, window, band })
    }
    return m
  }, [playerRows, seasonProjections, ktcHistory])

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

  // Ceiling/Floor's global pass (Slice vii follow-up) — same buildSeasonPositionRanks the
  // Explorer uses, guarded to the Value set like every other per-set input above.
  const seasonRanksData = useMemo(
    () => (columnSet === 'value' ? buildSeasonPositionRanks(careerStats, playerMap) : null),
    [columnSet, careerStats, playerMap]
  )

  // ── Per-column-set enriched rows — each guarded so only the active set does real work ──
  const valueRows = useMemo(() => {
    if (columnSet !== 'value') return []
    const { ranksByPlayer, refByPosRank } = seasonRanksData ?? { ranksByPlayer: new Map(), refByPosRank: {} }
    return (playerRows ?? []).map(r => {
      const cf = computeCeilingFloor(ranksByPlayer.get(r.player_id), r.position, refByPosRank)
      return {
        ...r,
        dynastyScoreValue: r.dynastyScore?.score ?? null,
        floorRiskSd: computeConsistency(careerStats, r.player_id)?.sd ?? null,
        _ceiling: cf?.ceiling ?? null,
        _floor: cf?.floor ?? null,
        ceilingRank: cf?.ceiling?.rank ?? null,
        floorRank: cf?.floor?.rank ?? null,
        _trend: trendByPlayer.get(r.player_id) ?? null,
      }
    })
  }, [columnSet, playerRows, careerStats, seasonRanksData, trendByPlayer])

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
        _trend: trendByPlayer.get(id) ?? null,
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
  }, [columnSet, playerRows, usageByPlayer, roleCohort, seasonProjections, careerStats, perSeasonTeamShares, teamShareTotals, trendByPlayer])

  const volumeRows = useMemo(() => {
    if (columnSet !== 'volume') return []
    return (playerRows ?? []).map(r => ({
      ...r,
      _avg: computeSeasonAverages(careerStats?.[activeVolumeSeason]?.[r.player_id]),
      _trend: trendByPlayer.get(r.player_id) ?? null,
    }))
  }, [columnSet, playerRows, careerStats, activeVolumeSeason, trendByPlayer])

  const enrichedRows = columnSet === 'value' ? valueRows : columnSet === 'outlook' ? outlookRows : volumeRows

  const displayRows = useMemo(() => {
    let rows = enrichedRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)
    // Market filters (1b Slice vi) apply after the position pill, before sort — matching
    // PlayersTab's displayRows order (§5).
    rows = applyMarketFilters(rows, filters, { playerMap, myTeamName, seasonProjections })
    const dir = sortState.direction === 'asc' ? 1 : -1
    const key = sortState.column

    // TREND (dp-v2 Slice 5a §4.3) is a comparator branch in every set, not a bare-key sort — its
    // value is an object ({values, delta, window, band}), and `compareNullsLast(a[key], b[key])`
    // on two objects would silently no-op (an existing precedent for exactly this shape already
    // exists below: _snapTrend/_oppTrend).
    if (columnSet === 'value') {
      return [...rows].sort((a, b) => {
        if (key === '_trend') return compareNullsLast(a._trend?.delta ?? null, b._trend?.delta ?? null, dir)
        return compareNullsLast(a[key], b[key], dir)
      })
    }
    if (columnSet === 'outlook') {
      return [...rows].sort((a, b) => {
        if (key === '_trend') return compareNullsLast(a._trend?.delta ?? null, b._trend?.delta ?? null, dir)
        if (key === '_snapTrend' || key === '_oppTrend') return compareNullsLast(a[key]?.delta ?? null, b[key]?.delta ?? null, dir)
        if (key === '_role') {
          const oa = a._role != null ? (ROLE_ORDER[a._role] ?? 99) : null
          const ob = b._role != null ? (ROLE_ORDER[b._role] ?? 99) : null
          return compareNullsLast(oa, ob, dir)
        }
        return compareNullsLast(a[key], b[key], dir)
      })
    }
    // volume
    return [...rows].sort((a, b) => {
      if (key === 'full_name') return compareNullsLast(a.full_name, b.full_name, dir)
      if (key === '_trend') return compareNullsLast(a._trend?.delta ?? null, b._trend?.delta ?? null, dir)
      return compareNullsLast(a._avg?.[key] ?? null, b._avg?.[key] ?? null, dir)
    })
  }, [enrichedRows, posFilter, filters, playerMap, myTeamName, seasonProjections, sortState, columnSet])

  const activeColumnLabel = useMemo(() => {
    const key = sortState.column
    if (columnSet === 'outlook' && key.startsWith('_ps_')) {
      const id = key.slice(4)
      const found = (POSITION_STAT_COLUMNS[posFilter] ?? []).find(c => c.id === id)
      return found?.label?.toLowerCase() ?? key
    }
    if (columnSet === 'volume') {
      const cols = VOLUME_COLUMNS[posFilter] ?? VOLUME_COLUMNS.ALL
      const found = cols.find(c => c.key === key)
      if (found) return found.label.toLowerCase()
    }
    return SORT_LABELS[columnSet]?.[key] ?? key
  }, [columnSet, sortState.column, posFilter])

  const totalCount = playerRows?.length ?? 0
  const filteredCount = displayRows.length
  const activeCount = activeFilterCount(filters)

  // ── Header + row rendering per column set ─────────────────────────────────────────────
  let header, colSpan, renderRow

  if (columnSet === 'value') {
    colSpan = 12
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Trend" col="_trend" {...sortProps}
          tooltip="KeepTradeCut value trend over the captured snapshot window — capture-only, view-only; never moves the projection." />
        <SortTh label="Dynasty score" col="dynastyScoreValue" {...sortProps} />
        <SortTh label="Vs market" col="divergencePct" {...sortProps} />
        <SortTh label="KTC" col="ktcValue" {...sortProps} align="right"
          tooltip="KeepTradeCut dynasty value — crowd-sourced from dynasty managers. Scale 0–10000." />
        <th className="px-3 py-[9px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-left text-dp-muted whitespace-nowrap">
          Career PPG
        </th>
        <SortTh label="Ceiling" col="ceilingRank" {...sortProps}
          tooltip="Best SINGLE-SEASON positional finish (by PPG), ranked among ALL players who played that season." />
        <SortTh label="Floor" col="floorRank" {...sortProps}
          tooltip="Worst SINGLE-SEASON positional finish (by PPG), ranked among ALL players who played that season." />
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
          <td className="px-3 py-3">
            <TrendCell values={row._trend?.values} delta={row._trend?.delta} window={row._trend?.window} band={row._trend?.band} scale="cell" />
          </td>
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
          <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
            {row.ktcValue != null ? row.ktcValue.toLocaleString() : <span className="text-dp-muted text-xs">—</span>}
          </td>
          <td className="px-3 py-3"><CareerBars values={row.careerSparkline} /></td>
          <td className="px-3 py-3"><CeilingFloorCell position={row.position} data={row._ceiling} /></td>
          <td className="px-3 py-3"><CeilingFloorCell position={row.position} data={row._floor} /></td>
          <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">
            {row.currentSeasonPPG != null ? row.currentSeasonPPG.toFixed(1) : '—'}
          </td>
          <td className="px-3 py-3 text-right">
            <div className="font-dp-mono text-[13px] text-dp-text">{row.projectedPPG != null ? row.projectedPPG.toFixed(1) : '—'}</div>
            <DeltaCell delta={delta} />
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
    colSpan = 7 + (posFilter === 'ALL' ? 3 : posCols.length)
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Trend" col="_trend" {...sortProps}
          tooltip="KeepTradeCut value trend over the captured snapshot window — capture-only, view-only; never moves the projection." />
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
        <td className="px-3 py-3">
          <TrendCell values={row._trend?.values} delta={row._trend?.delta} window={row._trend?.window} band={row._trend?.band} scale="cell" />
        </td>
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
            <td className="px-3 py-3"><UsageTrendCell trend={row._snapTrend} /></td>
            <td className="px-3 py-3"><UsageTrendCell trend={row._oppTrend} /></td>
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
    // volume
    const cols = VOLUME_COLUMNS[posFilter] ?? VOLUME_COLUMNS.ALL
    colSpan = 3 + cols.length
    header = (
      <>
        <SortTh label="Player" col="full_name" {...sortProps} />
        <SortTh label="Trend" col="_trend" {...sortProps}
          tooltip="KeepTradeCut value trend over the captured snapshot window — capture-only, view-only; never moves the projection." />
        <SortTh label="G" col="games" {...sortProps} align="right" />
        {cols.map(c => <SortTh key={c.key} label={c.label} col={c.key} {...sortProps} align="right" />)}
      </>
    )
    renderRow = row => (
      <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
        <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
        <td className="px-3 py-3">
          <TrendCell values={row._trend?.values} delta={row._trend?.delta} window={row._trend?.window} band={row._trend?.band} scale="cell" />
        </td>
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
          <p className="text-[13px] text-dp-muted mt-1">
            {activeCount > 0
              ? `${filteredCount} of ${totalCount} players · ${activeCount} filter${activeCount === 1 ? '' : 's'} active`
              : `${totalCount} players · every asset in the league, owned or not`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {columnSet === 'volume' && volumeSeasons.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-dp-muted">
              Season
              <select
                value={activeVolumeSeason ?? ''}
                onChange={e => setVolumeSeason(Number(e.target.value))}
                className="bg-dp-card border border-dp-border rounded-md px-2 py-1 text-xs text-dp-text-2"
              >
                {volumeSeasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          {/* Two labelled groups (§3), not four flat peers — the grouping says the left pair is
              what the model/market think, the right is what happened on the field. */}
          {COLUMN_SET_GROUPS.map(group => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted px-1">
                {group.label}
              </span>
              <div className="flex items-center gap-1 bg-dp-card border border-dp-border rounded-lg p-[3px]">
                {group.sets.map(cs => (
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
          ))}
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
        filterBar={
          <FilterBar
            filters={filters}
            onFiltersChange={setFilters}
            filteredCount={filteredCount}
            fantasyTeamOptions={fantasyTeamOptions}
          />
        }
      />
    </div>
  )
}
