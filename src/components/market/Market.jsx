import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { TrendCell } from '../dp/TrendCell'
import { buildTwoYearRanks, ageCaution, cautionAge } from '../../utils/twoYearBaseline'
import { TwoYearRankCell, AgeCautionMarker } from '../dp/TwoYearRank'
import { computeDynastySignalBadges } from '../../utils/dynastySignalBadges'
import { computeSeasonEfficiency } from '../../utils/seasonEfficiency'
import { buildLeagueRankTable, FILTER_METRICS } from '../../utils/environment'
import {
  DEFAULT_MARKET_FILTERS, applyMarketFilters, activeFilterCount, normalizeFilters, minGamesSliderMax,
} from '../../utils/marketFilters'
import { FilterBar } from './FilterBar'
import { buildInSeasonPosteriors, oppBeforeAfter, NEW_ROLE_TITLE } from '../../utils/inSeasonEvidence'
import { availableWindows, defaultWindow, buildWindowStats } from '../../utils/marketWindowStats'
import { buildAdvanced } from '../../utils/marketAdvanced'
import { buildWindowWeeks, weeklyMedians, seasonsWithoutWeekTeams } from '../../utils/marketWeekly'
import { MARKET_METRICS, METRIC_BY_ID, rankWindow } from '../../utils/marketMetrics'
import {
  FACT_VIEWS, STATS_MODES, factSortableKeys, factDefaultSort, prevWindowFor, rankOptionsFor,
  snapCoverageIncomplete, advancedCaption, factColumns, medianShown,
} from './factViews'
import { FactTable } from './FactTable'
import { PageEyebrow } from '../dp/cells'

// Market (1b Slice iii) — one table over playerRowsWithProj with a view switch: the four FACTS views
// (Overview/Stats/Usage/Efficiency — what happened, following the Window selector) and, separated, the
// Model view (dynasty score, market gap, KTC trend, projection and its in-season update). Both render
// through the one descriptor-driven FactTable (factViews.js). Slice vi added the filter bar + panel (union
// of the Explorer's filter set plus the design's Min projected games — master-plan §6a); Slice vii added
// free-text search (§2, inside `filters`) and saved presets (§3, in FilterBar). Filter/search/preset parity
// with the Explorer was the gate for retiring it — 1b Slice viii deleted `/players`
// (`PlayersSurface`/`PlayersTab`/`OutlookTab`/`NflStatsTab`) once that parity was reached; Market
// is now the only table over this data. Efficiency follows the Window selector, with play-by-play columns
// joined in by `marketAdvanced.js`. market-model-view.md merged the old Value/Outlook/In-season sets into Model.

// Facts (what happened) and, separated, the Model view.
const VIEWS = [...FACT_VIEWS, 'model']
const VIEW_LABELS = { overview: 'Overview', stats: 'Stats', usage: 'Usage', efficiency: 'Efficiency', model: 'Model' }
// Retired views and what they open now; written back once.
const RETIRED_VIEWS = { volume: 'stats', production: 'stats', value: 'model', outlook: 'model', inseason: 'model' }

const TONE_TEXT = { positive: 'text-dp-up-text', caution: 'text-dp-down-text', neutral: 'text-dp-muted' }

function loadColumnSet() {
  // The retired Volume season selector's key: nothing reads it; remove it once on load.
  try { localStorage.removeItem('market-production-season') } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem('market-column-set')
    const migrated = raw != null && Object.hasOwn(RETIRED_VIEWS, raw) ? RETIRED_VIEWS[raw] : raw
    if (VIEWS.includes(migrated)) {
      if (migrated !== raw) {
        try { localStorage.setItem('market-column-set', migrated) } catch { /* ignore */ }
        // A retired model view's sort may name a column Model shares (Outlook's projectedPPG), which
        // would survive the validity check; Model opens on its own default instead.
        if (migrated === 'model') {
          try { localStorage.removeItem('market-sort') } catch { /* ignore */ }
        }
      }
      return migrated
    }
  } catch { /* fall through */ }
  return 'overview'
}

function loadWindowId() {
  try {
    return localStorage.getItem('market-window')
  } catch { /* fall through */ }
  return null
}

function loadStatsMode() {
  try {
    const v = localStorage.getItem('market-stats-mode')
    if (STATS_MODES.includes(v)) return v
  } catch { /* fall through */ }
  return 'totals'
}

function loadFilters() {
  try {
    return normalizeFilters(JSON.parse(localStorage.getItem('market-filters')))
  } catch { /* fall through */ }
  return DEFAULT_MARKET_FILTERS
}

// ---------------------------------------------------------------------------
// Market-specific cells (the shared ones live in dp/cells.jsx so Portfolio can import rather than fork them).
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

// Why a prior is today's projection rather than the frozen preseason capture (the `live` chip's title).
const NOT_FROZEN_TITLES = {
  'model-changed': 'Not frozen: the projection model changed after the preseason capture, so this is today\'s projection',
  absent: 'Not in the preseason capture',
  league: 'Preseason capture was for a different league',
  basis: 'Preseason capture is not comparable',
  season: 'Preseason capture is not comparable',
}
const NOT_FROZEN_DEFAULT_TITLE = 'No preseason capture available'
const GROUP_CHIPS = { ROOKIE0: 'rookie', ROOKIE1P: 'rookie', SHORT: 'short' }
const EARLY_SEASON_DETAIL = 'Early-season drift below the prior mostly reflects the projection\'s known optimism — it runs roughly 15–20% high — not player performance. Since 2026-10-02, rookie and second-year dynasty scores start from their season projection without its market-value and college adjustments (second-year WRs keep the position baseline), so they moved once before any game counted; all of them now update with this season\'s games.'

const chip = (text, title) => (
  <span title={title} className="ml-1 font-dp-mono text-[10px] px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-2 whitespace-nowrap">{text}</span>
)

// Model's Signals: Outlook's filter, verbatim. The pop-up shows every badge; Market keeps OutlookTab's
// 0.95–1.05 age-curve gate — filtered here, not by editing the shared helper (the pop-up depends on its behaviour).
function modelSignals(row) {
  const raw = computeDynastySignalBadges(row.dynastyScore?.signals ?? null, row)
  const ageCurveFactor = row.dynastyScore?.signals?.ageCurveFactor
  return raw.filter(b =>
    b.key !== 'agecurve' || (ageCurveFactor != null && (ageCurveFactor >= 1.05 || ageCurveFactor <= 0.95))
  )
}

// Model's custom cells (market-model-view.md §4.3), keyed by the descriptor's `cell`; FactTable draws them.
const MODEL_CELLS = {
  dynasty: row => {
    const score = row.dynastyScore?.score
    if (score == null) return <span className="text-dp-muted text-xs">—</span>
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span className="font-dp-mono text-[15px] font-semibold w-[26px] text-dp-text">{score}</span>
          {/* `min-w-[60px]` is load-bearing: a bare `flex-1` track has a min-content width of 0, so when
              the table squeezes this column the track (and the bar inside it) collapses to 0px wide —
              the score's only visual. The min width also floors the column's own min-content width. */}
          <div data-testid="dynasty-track" className="flex-1 min-w-[60px] h-[5px] rounded-[3px] bg-dp-chip overflow-hidden">
            <div className="h-[5px] rounded-[3px] bg-dp-accent" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
          </div>
          <span className="text-[11px] text-dp-muted w-[88px] truncate">{row.dynastyScore?.label ?? ''}</span>
        </div>
        <TwoYearRankCell entry={row.twoYearRank} position={row.position} />
      </div>
    )
  },
  vsMarket: row => <VsMarketCell row={row} />,
  ktcTrend: row => (
    <TrendCell values={row._trend?.values} delta={row._trend?.delta} window={row._trend?.window} band={row._trend?.band} scale="cell" />
  ),
  rosDelta: row => {
    const post = row._post
    if (!post) return <span className="text-dp-muted text-xs">—</span>
    const { prior, value, weight } = post.ros
    const delta = value - prior
    return (
      <span className="whitespace-nowrap">
        <span
          title={`Prior ${prior.toFixed(1)} → ROS ${value.toFixed(1)} · ${Math.round(weight * 100)}% this season${post.start ? ` · ${post.start.starts} starts` : ''}`}
          className={`font-dp-mono text-xs ${delta > 0 ? 'text-dp-up-text' : delta < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}
        >
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
        </span>
        {!post.frozen && chip('live', NOT_FROZEN_TITLES[post.notFrozenReason] ?? NOT_FROZEN_DEFAULT_TITLE)}
        {GROUP_CHIPS[post.population] && chip(GROUP_CHIPS[post.population], 'Own measured update weight for this group')}
        {post.start && chip(`QB ${Math.round(post.start.fraction * 100)}%`, 'Not his team\'s week-1 starter: starter rate × his expected share of the remaining games. Prior and ROS are both at that share.')}
      </span>
    )
  },
  oppShift: row => {
    const r = row._is
    const relPct = r?.oppShiftRel != null ? Math.round(r.oppShiftRel * 100) : null
    const ba = oppBeforeAfter(r)
    if (relPct != null) {
      return (
        <span
          title={ba != null ? `Opp/G ${ba}` : undefined}
          className={`font-dp-mono text-xs whitespace-nowrap ${relPct > 0 ? 'text-dp-up-text' : relPct < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}
        >
          {relPct > 0 ? '+' : ''}{relPct}%
        </span>
      )
    }
    if (r?.newRole) {
      return (
        <span className="font-dp-mono text-xs text-dp-text whitespace-nowrap">
          {r.oppNow.toFixed(1)}{chip('new role', NEW_ROLE_TITLE)}
        </span>
      )
    }
    return <span className="text-dp-muted text-xs">—</span>
  },
  signals: row => <SignalsCell signals={row._signals} />,
}
const modelPlayerMarker = row => (row.ageCaution ? <AgeCautionMarker kind={row.ageCaution} ageSource={row._ageSource} /> : undefined)

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

// Note: Market does not need positionPeakPPG/ktcMap/historicalShares/collegeStats/enrichmentMap —
// it never mounts a profile panel itself (row click opens the App-level pop-up, which reads its
// own data from the App-level ProfileDataContext.Provider), and ktcValue/divergence fields already
// arrive merged onto playerRowsWithProj. Declaring unused props here would fail lint.
// `ktcHistory` (dp-v2 Slice 5a) is threaded explicitly, for the Model view's KTC trend sparkline only —
// delta/window/band come from `seasonProjections[id].factors`, already merged onto rows upstream.
// `gameLogsByYear`/`advStats`/`advStatsLive`/`liveSeason` feed the Efficiency fact view's advanced columns
// (EPA/CPOE/RACR) via `marketAdvanced.js` — Market stays props-only throughout (CLAUDE.md's two data-access
// patterns); growing this list is the accepted cost of that pattern, not a signal to switch to context.
// `teamContextByYear` feeds the environment filters' rank table.
// `currentSeasonTotals` (in-season-evidence-1-view.md) feeds the Model view's in-season opportunity columns only —
// view-only; inSeasonEvidence.js never reaches playerRows, the projection or a snapshot. The view's points
// columns read `scoringPosteriors` (App's seam records, in-season-evidence-2b-2) and `frozenPriorStatus`,
// as props: Market may not import the seam.
// `gameLogsByYear` also gives the Usage view's games-played shares their week team, and `onNeedGameLogSeason`
// requests a window season's logs while Usage is active.
export function Market({
  playerRows = [], loaded = false, careerStats, playerMap, seasonProjections, ktcHistory,
  gameLogsByYear, teamContextByYear, advStats, advStatsLive, liveSeason,
  currentSeasonTotals = null, liveSeasonUsable = false, scoringPosteriors = null, frozenPriorStatus = null,
  myTeamName, onOpenPlayerDetail, onNeedGameLogSeason = null,
}) {
  const [columnSet, setColumnSetRaw] = useState(loadColumnSet)
  const setColumnSet = useCallback(next => {
    setColumnSetRaw(next)
    try { localStorage.setItem('market-column-set', next) } catch { /* ignore */ }
  }, [])

  // Order is load-bearing: loadColumnSet (above) must run before this hook reads `market-sort`, because a
  // migration to Model removes that key first.
  const { posFilter, sortState, page, handlePosFilter, setSortState, setPage } =
    usePlayersTable({ storageKey: 'market-sort', defaultSort: factDefaultSort(columnSet, 'ALL') })

  // §3.4a step 1 — switching views re-asserts the NEW view's default sort and resets page.
  // Defaults go through factDefaultSort (Efficiency's varies by position pill), resolved
  // against the CURRENT posFilter (unchanged by a view switch).
  const handleSelectColumnSet = useCallback(next => {
    setColumnSet(next)
    setSortState(factDefaultSort(next, posFilter))
    setPage(1)
  }, [setColumnSet, setSortState, setPage, posFilter])

  const completedSeasons = useMemo(
    () => Object.keys(careerStats ?? {}).map(Number).sort((a, b) => b - a),
    [careerStats]
  )

  // `completedSeasons[0]` (careerStats' keys, sorted descending) is the same "most recent season with
  // data" App.jsx computes as `dataSeason`; reusing it here avoids a second definition of the same
  // value rather than adding a new prop for it. Efficiency's advanced columns cover this season only.
  const dataSeason = completedSeasons[0] ?? null

  // ── Fact views (Overview/Stats/Usage/Efficiency): window, stats mode, window stats and ranks ──
  const isFactView = FACT_VIEWS.includes(columnSet)
  const [windowId, setWindowIdRaw] = useState(loadWindowId)
  const setWindowId = useCallback(id => {
    setWindowIdRaw(id)
    try { localStorage.setItem('market-window', id) } catch { /* ignore */ }
    setPage(1)
  }, [setPage])
  const [statsMode, setStatsModeRaw] = useState(loadStatsMode)
  const setStatsMode = useCallback(mode => {
    setStatsModeRaw(mode)
    try { localStorage.setItem('market-stats-mode', mode) } catch { /* ignore */ }
  }, [])

  const windows = useMemo(
    () => (isFactView ? availableWindows({ careerStats, currentSeasonTotals, liveUsable: liveSeasonUsable }) : []),
    [isFactView, careerStats, currentSeasonTotals, liveSeasonUsable]
  )
  // A stored window id not in `windows` (a stale `live`, a season no longer loaded, garbage) silently
  // resolves to the default; it is not written back.
  const activeWindow = useMemo(
    () => windows.find(w => w.id === windowId) ?? defaultWindow(windows),
    [windows, windowId]
  )
  // Usage's games-played shares use the gamelogs only once every window season has settled, so the window
  // stats rebuild once, not once per arriving file; other views never pass them.
  const shareLogs = useMemo(() => {
    if (columnSet !== 'usage' || !activeWindow) return null
    const settled = activeWindow.seasons.every(y => y === dataSeason || gameLogsByYear?.[y] !== undefined)
    return settled ? (gameLogsByYear ?? null) : null
  }, [columnSet, activeWindow, dataSeason, gameLogsByYear])
  // Usage's games-played shares credit each week to the team a player played for; that needs each window
  // season's gamelogs. dataSeason is App's eager load; a season already in the map is never re-requested.
  useEffect(() => {
    if (columnSet !== 'usage' || !activeWindow || !onNeedGameLogSeason) return
    for (const y of activeWindow.seasons) {
      if (y !== dataSeason && gameLogsByYear?.[y] === undefined) onNeedGameLogSeason(y)
    }
  }, [columnSet, activeWindow, dataSeason, gameLogsByYear, onNeedGameLogSeason])
  const unsplitSeasons = columnSet === 'usage' && activeWindow
    ? seasonsWithoutWeekTeams(activeWindow.seasons, shareLogs) : []
  const sharesClause = columnSet !== 'usage' ? '' : ' · Shares: share of team, in games played'
    // PROVISIONAL(heuristic): shares for the listed seasons credit a traded player's weeks to his season team · their gamelogs are not in use yet (loading, incomplete, or not produced) · complete gamelogs for every window season
    + (unsplitSeasons.length > 0 ? ` · Mid-season team changes not split for ${unsplitSeasons.join(', ')}` : '')
  const windowStats = useMemo(
    () => (activeWindow
      ? buildWindowStats({ window: activeWindow, careerStats, currentSeasonTotals, playerMap, gameLogsByYear: shareLogs })
      : null),
    [activeWindow, careerStats, currentSeasonTotals, playerMap, shareLogs]
  )
  // Per-game medians (display only): the weekly layer over the same window and pool as windowStats.
  const windowMedians = useMemo(() => {
    if (!windowStats) return null
    const weeks = buildWindowWeeks({ window: activeWindow, careerStats, currentSeasonTotals, pids: windowStats.keys() })
    const perGame = MARKET_METRICS.filter(m => m.kind === 'perGame')
    const out = new Map()
    for (const [pid, entry] of weeks) out.set(pid, weeklyMedians(entry, perGame))
    return out
  }, [windowStats, activeWindow, careerStats, currentSeasonTotals])
  const seasonEfficiency = useMemo(() => {
    if (columnSet !== 'efficiency' || dataSeason == null || !gameLogsByYear?.[dataSeason]?.complete) return null
    // carrySh (the only teamcontext join) is unused by the fact view, so no teamcontext is passed.
    return computeSeasonEfficiency(gameLogsByYear[dataSeason], null, dataSeason)
  }, [columnSet, gameLogsByYear, dataSeason])
  const liveWindowSeason = windows.find(w => w.kind === 'live')?.seasons[0] ?? null
  const advanced = useMemo(() => (columnSet === 'efficiency'
    ? buildAdvanced({ windowStats, window: activeWindow, dataSeason, seasonEfficiency, advStats, advStatsLive, liveSeason, liveWindowSeason })
    : null), [columnSet, windowStats, activeWindow, dataSeason, seasonEfficiency, advStats, advStatsLive, liveSeason, liveWindowSeason])
  const factStats = advanced ? advanced.stats : windowStats
  const windowRanks = useMemo(
    () => (factStats ? rankWindow(factStats, MARKET_METRICS, rankOptionsFor(activeWindow)) : null),
    [factStats, activeWindow]
  )
  const prevWindow = columnSet === 'overview' ? prevWindowFor(activeWindow, windows) : null
  const prevRanks = useMemo(() => {
    if (!prevWindow) return null
    const ws = buildWindowStats({ window: prevWindow, careerStats, currentSeasonTotals, playerMap })
    return rankWindow(ws, [METRIC_BY_ID.fpPerG])
  }, [prevWindow, careerStats, currentSeasonTotals, playerMap])


  // §3.4a step 3 — a market-sort value restored from localStorage (or left over from a prior view) that
  // names a column the ACTIVE view has no column for falls back to that view's default, rather than
  // sorting by a key whose comparator yields null for every row. Validated against the CURRENT POSITION's
  // columns, so a stored key from another pill (or from a retired view's columns) falls back to that
  // default. This effect is what moves a single-position Efficiency pill from the table's `fpPerG` reset to
  // that pill's `factDefaultSort`, and it also covers a `market-sort` value restored at mount.
  useEffect(() => {
    const valid = factSortableKeys(columnSet, posFilter, {
      windowKind: activeWindow?.kind ?? null, statsMode, ros: scoringPosteriors != null,
    })
    if (!valid.has(sortState.column)) setSortState(factDefaultSort(columnSet, posFilter))
  }, [columnSet, posFilter, sortState.column, setSortState, activeWindow, statsMode, scoringPosteriors])


  // League rank table for the four environment filters (dp-v2 Slice 5c) — built once per season,
  // not once per row/keystroke (computeLeagueStanding, its per-call equivalent, re-runs
  // computeTeamSeasonMetrics for all 32 teams to return a single rank). Gated on `complete`, not
  // key presence — a present-but-incomplete season yields empty per-metric maps that the filter's
  // own graceful-null rule would otherwise read as "no team has a rank" and drop every row. `null`
  // here (absent teamcontext, or incomplete) makes applyMarketFilters treat all four as inert.
  const teamContextForSeason = teamContextByYear?.[dataSeason]
  const rankTable = useMemo(() => {
    if (!teamContextForSeason?.complete) return null
    return buildLeagueRankTable(teamContextForSeason, FILTER_METRICS)
  }, [teamContextForSeason])

  // ── Filters (1b Slice vi) — view-local, like columnSet; not App.jsx domain state. Changing
  // filters resets page to 1, same as the column-set switch and the window selector. ──
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

  // ── Model view (market-model-view.md §4.2). Each input is gated to Model so the other views do no work. ──
  const isModel = columnSet === 'model'

  // KTC trend column — the signals are already computed: seasonProjection.js:307 calls
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
    if (!isModel) return m
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
  }, [isModel, playerRows, seasonProjections, ktcHistory])

  const twoYearRanks = useMemo(
    () => (isModel ? buildTwoYearRanks(playerRows, careerStats, playerMap) : null),
    [isModel, playerRows, careerStats, playerMap]
  )

  // In-season evidence — the blend is computed only while Model is active; `inSeason` null = no usable live
  // season (the caption and cells render their no-data state).
  const inSeason = useMemo(() => {
    if (!isModel) return null
    return buildInSeasonPosteriors({ playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals })
  }, [isModel, playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals])

  // Model rows (market-model-view.md §4.2) — the row-level fields Model's descriptors and cells read.
  const modelRows = useMemo(() => {
    if (!isModel) return []
    return (playerRows ?? []).map(r => ({
      ...r,
      twoYearRank: twoYearRanks?.get(r.player_id) ?? null,
      ageCaution: ageCaution(r, playerMap?.[r.player_id], careerStats),
      _ageSource: cautionAge(playerMap?.[r.player_id], careerStats)?.source ?? null,
      _trend: trendByPlayer.get(r.player_id) ?? null,
      _signals: modelSignals(r),
      _is: inSeason?.byId.get(r.player_id) ?? null,
      _post: scoringPosteriors?.get(r.player_id) ?? null,
    }))
  }, [isModel, playerRows, twoYearRanks, playerMap, careerStats, trendByPlayer, inSeason, scoringPosteriors])

  const factRows = useMemo(() => playerRows ?? [], [playerRows])

  // Rows are sorted by FactTable, not here.
  const displayRows = useMemo(() => {
    let rows = isModel ? modelRows : factRows
    if (posFilter !== 'ALL') rows = rows.filter(r => r.position === posFilter)
    // Market filters (1b Slice vi) apply after the position pill, before sort — matching
    // PlayersTab's displayRows order (§5).
    return applyMarketFilters(rows, filters, {
      playerMap, myTeamName, seasonProjections, rankTable, careerStats, season: dataSeason,
      windowStats: isFactView ? factStats : null,
    })
  }, [isModel, modelRows, factRows, posFilter, filters, playerMap, myTeamName, seasonProjections, rankTable, careerStats, dataSeason, isFactView, factStats])

  const totalCount = playerRows?.length ?? 0
  const filteredCount = displayRows.length
  const activeCount = activeFilterCount(filters, { performanceApplies: isFactView })

  const filterBar = (
    <FilterBar
      filters={filters}
      onFiltersChange={setFilters}
      filteredCount={filteredCount}
      fantasyTeamOptions={fantasyTeamOptions}
      performanceApplies={isFactView}
      minGamesMax={minGamesSliderMax(activeWindow, factStats)}
    />
  )

  // Caption scoring clause: only claims league scoring when every row in the window is league-scored;
  // an empty pool renders the label alone.
  const scoringRows = windowStats ? [...windowStats.values()] : []
  const scoringClause = scoringRows.length === 0 ? ''
    : scoringRows.every(ws => ws.leagueScored) ? ' · League scoring'
    : " · Half-PPR basis (Sleeper's own scoring, not necessarily this league's)"

  return (
    // bg-dp-canvas is required, not decorative — Slice i §1.1.
    <div className="bg-dp-canvas flex flex-col gap-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div>
            <PageEyebrow>{`Market / ${VIEW_LABELS[columnSet]} view`}</PageEyebrow>
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-dp-text">Market</h1>
          </div>
          <p className="text-[13px] text-dp-muted mt-1">
            {activeCount > 0
              ? `${filteredCount} of ${totalCount} players · ${activeCount} filter${activeCount === 1 ? '' : 's'} active`
              : `${totalCount} players · every asset in the league, owned or not`}
          </p>
          {isFactView && activeWindow && (
            <p className="text-[11px] text-dp-muted mt-0.5">
              {activeWindow.label}{scoringClause}{(columnSet === 'overview' || columnSet === 'usage') && snapCoverageIncomplete(windowStats) ? ' · Snap % covers 2020 onward' : ''}
              {sharesClause}
              {columnSet === 'efficiency' ? advancedCaption(posFilter, advanced?.coverage, dataSeason) : ''}
              {medianShown(factColumns(columnSet, posFilter, { windowKind: activeWindow?.kind ?? null, statsMode }), factStats, windowMedians)
                ? ' · Per-game columns: average · median' : ''}
            </p>
          )}
          {isModel && (
            <p className="text-[11px] text-dp-muted mt-0.5">
              {inSeason != null
                ? `${inSeason.liveSeason} season to date — up to ${inSeason.maxGames} games played. `
                : 'No in-progress season data is loaded — the in-season columns read —.'}
              {inSeason != null && (frozenPriorStatus?.status === 'ok'
                ? `Priors frozen from the ${frozenPriorStatus.dateKey} preseason capture. `
                : frozenPriorStatus?.reason === 'model-changed'
                  ? 'Priors are not frozen this season: the projection model changed after the preseason capture. '
                  : "Priors are today's projection (no usable preseason capture). ")}
              {inSeason != null && (<>
                <span title={EARLY_SEASON_DETAIL} className="underline decoration-dotted cursor-help">Early-season drops below the prior mostly reflect the projection running about 15–20% high.</span>
                {' '}
                {inSeason.leagueScored
                  ? "Scored on this league's settings."
                  : "Half-PPR basis (Sleeper's own scoring, not necessarily this league's)."}
              </>)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isFactView && windows.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-dp-muted">
              Window
              <select
                aria-label="Window"
                value={activeWindow.id}
                onChange={e => setWindowId(e.target.value)}
                className="bg-dp-card border border-dp-border rounded-lg h-8 px-2.5 text-[12.5px] text-dp-text-2"
              >
                {windows.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
            </label>
          )}
          {columnSet === 'stats' && (
            <div className="flex items-center gap-0.5 bg-dp-card border border-dp-border rounded-[9px] p-[3px]">
              {[['totals', 'Totals'], ['perGame', 'Per game']].map(([mode, label]) => (
                <button
                  key={mode}
                  aria-pressed={statsMode === mode}
                  onClick={() => setStatsMode(mode)}
                  className={`px-3.5 h-8 rounded-md text-[12.5px] transition-colors ${
                    statsMode === mode ? 'bg-dp-chip text-dp-text font-semibold shadow-[inset_0_0_0_1px_var(--color-dp-border-raised)]' : 'text-dp-text-3 hover:text-dp-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Facts (what happened) and, separated, the Model view. */}
          {[{ label: 'FACTS', views: FACT_VIEWS }, { label: null, views: ['model'] }].map(group => (
            <div key={group.label ?? 'model'} className="flex flex-col gap-1">
              {group.label ? (
                <span className="font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted px-1">
                  {group.label}
                </span>
              ) : (
                <span aria-hidden="true" className="font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted px-1 invisible">
                  MODEL
                </span>
              )}
              <div className="flex items-center gap-0.5 bg-dp-card border border-dp-border rounded-[9px] p-[3px]">
                {group.views.map(cs => (
                  <button
                    key={cs}
                    onClick={() => handleSelectColumnSet(cs)}
                    className={`px-3.5 h-8 rounded-md text-[12.5px] transition-colors ${
                      columnSet === cs ? 'bg-dp-accent text-dp-on-accent font-semibold' : 'text-dp-text-3 hover:text-dp-text'
                    }`}
                  >
                    {VIEW_LABELS[cs]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <FactTable
        view={columnSet} posFilter={posFilter} onPosFilter={handlePosFilter} loaded={loaded}
        rows={displayRows} page={page} onPageChange={setPage}
        sortState={sortState} onSortChange={setSortState}
        windowKind={activeWindow?.kind ?? null} statsMode={statsMode}
        windowStats={factStats} medians={isFactView ? windowMedians : null} ranks={windowRanks} prevRanks={prevRanks} prevSeason={prevWindow?.seasons[0] ?? null}
        myTeamName={myTeamName} onOpenPlayerDetail={onOpenPlayerDetail}
        filterBar={filterBar}
        ros={isModel && scoringPosteriors != null}
        cells={isModel ? MODEL_CELLS : undefined}
        playerMarker={isModel ? modelPlayerMarker : undefined}
      />
    </div>
  )
}
