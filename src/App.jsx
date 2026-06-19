import { useEffect, useMemo, useRef, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipContext } from './context/TooltipContext'
import {
  getNFLState,
  getUserByUsername,
  getLeaguesForUser,
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueDrafts,
  getDraftPicks,
  getMatchups,
  getAllPlayers,
} from './api/sleeper'
import { getWeeklyStats, getWeeklyProjections, loadCareerHistory } from './api/sleeperStats'
import { loadCollegeStats } from './api/cfbd'
import { loadNflDraftPicks } from './api/nflDraft'
import { loadCurrentRoster } from './api/nflRoster'
import { loadAdvStats } from './api/advStats'
import { isRelevantPlayer, rosterStatusOf } from './utils/relevance'
import { matchCollegeToSleeper } from './utils/collegeMatch'
import { matchNflDraftToSleeper } from './utils/nflDraftMatch'
import { computeCollegeMetrics } from './utils/collegeMetrics'
import { computeNextSeasonProjection } from './utils/seasonProjection'
import { calculateFantasyPoints } from './utils/fantasyPoints'
import { computeEmpiricalAgeCurves, computeDynastyScore, computeMarketDivergence, computePositionalRanks, computeRoleRanks } from './utils/dynastyScore'
import { getKTCValues } from './api/ktc'
import { matchKTCToSleeper } from './utils/ktcMatch'
import { loadKtcHistory } from './utils/ktcHistory'
import { loadEnrichment } from './api/enrichment'
import { writeProjectionSnapshot, loadPriorSnapshotTeams } from './utils/projectionSnapshot'
import { computeTeamContext, computeQBQualityByTeam, computeHistoricalTeamTotals, computeHistoricalShares, applyQBQualityModifier } from './utils/teamContext'
import { PlayersTab } from './components/PlayersTab'
import { MyTeamView } from './components/roster/MyTeamView'
import { LeagueView } from './components/league/LeagueView'
import { Board } from './components/board/Board'
import { Trade } from './components/trade/Trade'
import { AppShell } from './components/shell/AppShell'
import { CareerLoadProgressBar } from './components/shell/CareerLoadProgressBar'
import { ClearCacheButton } from './components/shell/ClearCacheButton'
import { ExportDataButton } from './components/shell/ExportDataButton'
import { isRookieSeason, DEFAULT_ROUTE } from './components/shell/navItems'
import { loadStoredTheme, persistTheme, applyThemeClass } from './theme'

// ---------------------------------------------------------------------------
// localStorage persistence helpers
// ---------------------------------------------------------------------------
const LS_USER       = 'sleeper-user'
const LS_LEAGUE     = 'sleeper-league'
const LS_TOOLTIPS   = 'tooltips-enabled'
const LS_COMPARISON = 'comparison-list'
function loadStoredUser()    { try { return JSON.parse(localStorage.getItem(LS_USER))   ?? null } catch { return null } }
function loadStoredLeague()  { try { return JSON.parse(localStorage.getItem(LS_LEAGUE)) ?? null } catch { return null } }
function saveStoredUser(u)   { localStorage.setItem(LS_USER,   JSON.stringify(u)) }
function saveStoredLeague(l) { localStorage.setItem(LS_LEAGUE, JSON.stringify(l)) }
function clearStoredUser()   { localStorage.removeItem(LS_USER) }
function clearStoredLeague() { localStorage.removeItem(LS_LEAGUE) }

function scoringLabel(rec) {
  if (rec === 1) return 'PPR'
  if (rec === 0.5) return 'Half PPR'
  return 'Standard'
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  const [nflState, setNflState] = useState(null)
  const [nflError, setNflError] = useState(null)

  const [username, setUsername] = useState('')
  const [user, setUser] = useState(null)
  const [userError, setUserError] = useState(null)
  const [userLoading, setUserLoading] = useState(false)

  const [leagues, setLeagues] = useState(null)
  const [leaguesLoading, setLeaguesLoading] = useState(false)

  const [selectedLeague, setSelectedLeague] = useState(null)
  const [leagueData, setLeagueData] = useState(null)
  const [leagueLoading, setLeagueLoading] = useState(false)
  const [leagueError, setLeagueError] = useState(null)

  const [myTeamData, setMyTeamData] = useState(null)
  const [myTeamLoading, setMyTeamLoading] = useState(false)
  const [myTeamError, setMyTeamError] = useState(null)

  const [careerStats, setCareerStats] = useState(null)
  const [careerLoadProgress, setCareerLoadProgress] = useState(null)
  const [collegeMatches, setCollegeMatches] = useState(null)

  const [autoLoading, setAutoLoading] = useState(false)
  const [autoLoadError, setAutoLoadError] = useState(null)
  const [initialStoredLeague] = useState(() => loadStoredLeague())

  const [tooltipsEnabled, setTooltipsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_TOOLTIPS)
      return stored === null ? true : JSON.parse(stored)
    } catch { return true }
  })

  function handleToggleTooltips() {
    setTooltipsEnabled(prev => {
      const next = !prev
      try { localStorage.setItem(LS_TOOLTIPS, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const [theme, setTheme] = useState(loadStoredTheme)

  function handleToggleTheme() {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    applyThemeClass(theme)
    persistTheme(theme)
  }, [theme])

  // ── Comparison list ───────────────────────────────────────────────────────
  const [comparisonList, setComparisonList] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_COMPARISON)) ?? [] } catch { return [] }
  })

  function addToComparison(playerId) {
    setComparisonList(prev => {
      if (prev.includes(playerId) || prev.length >= 4) return prev
      const next = [...prev, playerId]
      try { localStorage.setItem(LS_COMPARISON, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function removeFromComparison(playerId) {
    setComparisonList(prev => {
      const next = prev.filter(id => id !== playerId)
      try { localStorage.setItem(LS_COMPARISON, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function clearComparison() {
    setComparisonList([])
    try { localStorage.removeItem(LS_COMPARISON) } catch {}
  }

  // KTC dynasty values — optional market signal, null when unavailable
  const [ktcMap, setKtcMap] = useState(null)
  // Historical KTC snapshot series (Projection C2) — null until loader resolves
  const [ktcHistory, setKtcHistory] = useState(null)

  // Enrichment overlay — null until fetched; consumers treat null as "no enrichment"
  const [enrichmentMap, setEnrichmentMap] = useState(null)

  // Matched draft entries keyed by Sleeper player_id (D1) — null until both picks + playersMap are ready
  const [nflDraftMatches, setNflDraftMatches] = useState(null)
  // nflverse current-season roster — { activeIds, year, complete, byId }; null until loader resolves
  const [nflRoster, setNflRoster] = useState(null)
  // nflverse advanced stats (view-only) — { byId, year, complete, rowCount }; null until loader resolves
  const [advStats, setAdvStats] = useState(null)
  // Prior-snapshot team map for team-change detection (best-effort, forward-only)
  const [priorTeamByPlayer, setPriorTeamByPlayer] = useState(null)

  const careerCancelRef = useRef(false)

  // Empirical age curves — recomputed whenever career data loads
  const { curves: empiricalCurves, positionPeakPPG, positionPeakAge } = useMemo(() => {
    if (!careerStats || !leagueData) return { curves: {}, positionPeakPPG: {}, positionPeakAge: {} }
    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    const t0 = performance.now()
    const result = computeEmpiricalAgeCurves(careerStats, leagueData.playerMap)
    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    console.info('[perf][memo] empiricalCurves', Math.round(performance.now() - t0) + 'ms')
    return result
  }, [careerStats, leagueData])

  const teamContext = useMemo(() => {
    if (!careerStats || !leagueData) return null
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    return computeTeamContext(careerStats, leagueData.playerMap, currentSeason)
  }, [careerStats, leagueData])

  const depthMap = useMemo(() => {
    if (!leagueData?.playerMap) return null
    const map = {}
    for (const [id, player] of Object.entries(leagueData.playerMap)) {
      const d = player.depth_chart_order
      if (d != null) map[id] = { depthOrder: d }
    }
    return Object.keys(map).length > 0 ? map : null
  }, [leagueData])

  const historicalTeamTotals = useMemo(() => {
    if (!careerStats || !leagueData?.playerMap) return null
    return computeHistoricalTeamTotals(careerStats, leagueData.playerMap)
  }, [careerStats, leagueData])

  const historicalShares = useMemo(() => {
    if (!careerStats || !leagueData?.playerMap || !historicalTeamTotals) return null
    return computeHistoricalShares(careerStats, leagueData.playerMap, historicalTeamTotals)
  }, [careerStats, leagueData, historicalTeamTotals])

  // Derive per-player college metrics once collegeMatches is available
  const collegeStats = useMemo(() => {
    if (!collegeMatches || !leagueData?.playerMap || !careerStats) return null
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    const result = {}
    for (const [pid, seasons] of Object.entries(collegeMatches)) {
      const p = leagueData.playerMap[pid]
      if (!p) continue
      const metrics = computeCollegeMetrics(seasons, p.position, p.age, currentSeason)
      if (metrics) result[pid] = metrics
    }
    return result
  }, [collegeMatches, leagueData, careerStats])

  // Load KTC dynasty values once per league load (independent of careerStats)
  useEffect(() => {
    if (!leagueData?.playerMap) return
    let cancelled = false
    getKTCValues().then(ktcPlayers => {
      if (cancelled || !ktcPlayers) return
      setKtcMap(matchKTCToSleeper(ktcPlayers, leagueData.playerMap))
    })
    return () => { cancelled = true }
  }, [leagueData])

  // Load historical KTC snapshot series once per league load (Projection C2).
  // Capture-only: feeds factors diagnostics, never moves projectedPPG.
  useEffect(() => {
    if (!leagueData?.playerMap) return
    let cancelled = false
    loadKtcHistory({ playersMap: leagueData.playerMap }).then(h => {
      if (!cancelled) setKtcHistory(h)
    })
    return () => { cancelled = true }
  }, [leagueData])

  // Load enrichment overlay once on mount — independent of league/career data
  useEffect(() => {
    let cancelled = false
    loadEnrichment().then(result => {
      if (cancelled) return
      setEnrichmentMap(result)
    })
    return () => { cancelled = true }
  }, [])

  // Load prior-snapshot team map on mount for team-change detection.
  // Returns null when no prior snapshot exists; isTeamChange stays null for all players.
  useEffect(() => {
    let cancelled = false
    loadPriorSnapshotTeams().then(m => {
      if (!cancelled) setPriorTeamByPlayer(m)
    })
    return () => { cancelled = true }
  }, [])

  // Pre-build player rows once when careerStats populates
  const playerRows = useMemo(() => {
    if (!careerStats || !leagueData) return []
    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    const t0 = performance.now()

    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const mostRecentSeason = allSeasons[allSeasons.length - 1]

    // Sparkline: last 5 seasons, padded with 0 at front if fewer
    const last5 = allSeasons.slice(-5)
    const paddedLast5 = [...Array(5 - last5.length).fill(null), ...last5]

    // Owner map
    const ownerMap = {}
    for (const team of leagueData.rosterTeams) {
      for (const p of [...team.starters, ...team.bench, ...team.reserve]) ownerMap[p.id] = team.teamName
    }

    const rookieDraftPicks = leagueData.rookieDraftPicks ?? {}

    // Roster signal — derived once for the whole memo
    const rosterIds      = nflRoster?.activeIds ?? null
    const rosterComplete = nflRoster?.complete === true && rosterIds != null
    const rosterYear     = nflRoster?.year ?? null

    // Collect all player IDs across all seasons + anyone currently rostered
    const playerIdSet = new Set()
    for (const seasonData of Object.values(careerStats)) {
      for (const id of Object.keys(seasonData)) playerIdSet.add(id)
    }
    for (const id of Object.keys(ownerMap)) playerIdSet.add(id)

    // Add active skill-position rookies who have no career stats yet
    for (const [id, player] of Object.entries(leagueData.playerMap)) {
      if (
        player.years_exp === 0 &&
        ['QB', 'RB', 'WR', 'TE'].includes(player.position) &&
        (player.status === 'Active' || player.status === 'Injured_Reserve' || player.status === 'Free Agent')
      ) {
        playerIdSet.add(id)
      }
    }

    const rows = []
    for (const playerId of playerIdSet) {
      const info = leagueData.playerMap[playerId] ?? {}
      // Only show skill positions
      if (!['QB', 'RB', 'WR', 'TE'].includes(info.position)) continue

      const recent = careerStats[mostRecentSeason]?.[playerId]
      const currentSeasonPPG = recent?.gamesPlayed > 0
        ? Math.round((recent.fantasyPoints / recent.gamesPlayed) * 100) / 100
        : 0
      const currentSeasonTotalPts = recent?.gamesPlayed > 0
        ? Math.round(recent.fantasyPoints * 10) / 10
        : 0

      let careerTotalPts = 0
      for (const seasonData of Object.values(careerStats)) {
        const d = seasonData[playerId]
        if (d?.gamesPlayed > 0) careerTotalPts += d.fantasyPoints
      }
      careerTotalPts = Math.round(careerTotalPts * 10) / 10

      const careerSparkline = paddedLast5.map(season => {
        if (season == null) return 0
        const d = careerStats[season]?.[playerId]
        return d?.gamesPlayed > 0 ? Math.round((d.fantasyPoints / d.gamesPlayed) * 100) / 100 : 0
      })

      // Trend (Explorer visual signal — separate from dynasty score)
      const playerSeasonPPGs = allSeasons
        .map(s => { const d = careerStats[s]?.[playerId]; return d?.gamesPlayed > 0 ? d.fantasyPoints / d.gamesPlayed : null })
        .filter(v => v != null)

      let trend = 'insufficient'
      if (playerSeasonPPGs.length >= 3) {
        const careerAvg = playerSeasonPPGs.reduce((a, b) => a + b, 0) / playerSeasonPPGs.length
        const last3Avg = playerSeasonPPGs.slice(-3).reduce((a, b) => a + b, 0) / 3
        trend = last3Avg > careerAvg * 1.15 ? 'up' : last3Avg < careerAvg * 0.85 ? 'down' : 'flat'
      }

      const dynastyScore = computeDynastyScore(
        playerId,
        leagueData.playerMap,
        careerStats,
        empiricalCurves,
        positionPeakPPG,
        rookieDraftPicks[playerId] ?? null,
        leagueData.scoringSettings,
        ktcMap,
        teamContext,
        depthMap,
        historicalShares,
        positionPeakAge,
      )

      rows.push({
        player_id: playerId,
        full_name: info.full_name ?? playerId,
        position: info.position ?? '?',
        nfl_team: info.team ?? 'FA',
        age: info.age ?? null,
        years_exp: info.years_exp ?? null,
        ownerTeamName: ownerMap[playerId] ?? null,
        currentSeasonPPG,
        currentSeasonTotalPts,
        careerTotalPts,
        careerSparkline,
        trend,
        dynastyScore,
        positionRank: 0,
        rosterStatus: rosterStatusOf(playerId, rosterIds, rosterComplete),
        rosterYear,
      })
    }

    // ── Relevance filter ─────────────────────────────────────────────────────
    // Removes retired players and Sleeper ghost entries.
    // Brady / Ryan both show active:true in Sleeper — status is unreliable.
    // Pure helpers live in src/utils/relevance.js (extracted for testability).
    const filteredRows = rows.filter(row => isRelevantPlayer({
      row,
      playerMap: leagueData.playerMap,
      rosteredIds: leagueData.rosteredIds,
      ktcMap,
      careerStats,
      mostRecentSeason,
      rosterIds,
      rosterComplete,
    }))

    // Diagnostic: count players newly excluded because of roster-absence signal
    const filteredIds = new Set(filteredRows.map(r => r.player_id))
    const newlyExcluded = rosterComplete ? rows.filter(r => {
      if (filteredIds.has(r.player_id)) return false
      if (r.rosterStatus !== 'absent') return false
      const onNflTeam = r.nfl_team && r.nfl_team !== 'FA'
      return onNflTeam && (ktcMap?.has(r.player_id) ?? false)
    }).length : 0
    console.info('[relevance] rosterYear=%s complete=%s newlyExcluded≈%d', rosterYear, rosterComplete, newlyExcluded)

    // Rank within position by currentSeasonPPG
    const byPosition = {}
    for (const row of filteredRows) {
      ;(byPosition[row.position] ??= []).push(row)
    }
    for (const posRows of Object.values(byPosition)) {
      posRows.sort((a, b) => b.currentSeasonPPG - a.currentSeasonPPG)
      posRows.forEach((r, i) => { r.positionRank = i + 1 })
    }

    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    console.info('[perf][memo] playerRows', Math.round(performance.now() - t0) + 'ms', 'rows=', filteredRows.length)
    return filteredRows
  }, [careerStats, leagueData, empiricalCurves, positionPeakPPG, positionPeakAge, ktcMap, teamContext, depthMap, historicalShares, nflRoster])

  // Merge KTC values into player rows — cheap pass, runs only when ktcMap or
  // playerRows changes.  Produces a ktcValue field on each row for sorting.
  const playerRowsWithKTC = useMemo(() => {
    if (!playerRows.length || !ktcMap?.size) return playerRows
    return playerRows.map(row => ({
      ...row,
      ktcValue: ktcMap.get(row.player_id)?.value ?? null,
    }))
  }, [playerRows, ktcMap])

  // QB quality map: requires KTC values to be merged so the ktcValue fallback works.
  // Uses depthMap to prefer the depth-chart QB1. League-wide (includes un-rostered
  // QBs) for the dynasty OQ modifier — F1-A.
  const qbQualityByTeam = useMemo(
    () => computeQBQualityByTeam(playerRowsWithKTC, depthMap, true),
    [playerRowsWithKTC, depthMap]
  )

  // Projection Step 7b input — INTENTIONALLY kept on the legacy rostered-only
  // behavior so projectedPPG and snapshots are byte-identical. Swapping the
  // projection to the league-wide map is a projection-input change and is
  // backtest-gated (see .claude/tasks/qb-quality-coverage.md → Follow-up).
  const qbQualityByTeamRostered = useMemo(
    () => computeQBQualityByTeam(playerRowsWithKTC, depthMap),
    [playerRowsWithKTC, depthMap]
  )

  // Apply QB modifier to WR/TE opportunity scores (and mild inverse for workhorse RBs).
  // Modifier math lives in applyQBQualityModifier (teamContext.js) for unit-test coverage.
  const playerRowsWithQBMod = useMemo(() => {
    if (!playerRowsWithKTC.length || !Object.keys(qbQualityByTeam).length) {
      return playerRowsWithKTC
    }
    return playerRowsWithKTC.map(row => applyQBQualityModifier(row, qbQualityByTeam))
  }, [playerRowsWithKTC, qbQualityByTeam])

  // Compute market divergence — requires the full position group, so runs after
  // all per-player adjustments are complete.
  const playerRowsFinal = useMemo(
    () => computeMarketDivergence(playerRowsWithQBMod),
    [playerRowsWithQBMod]
  )

  // Compute positional ranks + role ranks once the final rows are ready.
  const playerRanks = useMemo(() => {
    if (!playerRowsFinal.length || !careerStats) return new Map()
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    const ranks = computePositionalRanks(playerRowsFinal, careerStats, currentSeason)
    const roleRankMap = computeRoleRanks(playerRowsFinal, historicalShares)
    for (const [id, roleRank] of roleRankMap) {
      const existing = ranks.get(id) ?? {}
      ranks.set(id, { ...existing, roleRank })
    }
    return ranks
  }, [playerRowsFinal, careerStats, historicalShares])

  // Merge rank fields into every row — cheap pass, no recompute of scores.
  const playerRowsWithRanks = useMemo(() => {
    if (!playerRowsFinal.length || !playerRanks.size) return playerRowsFinal
    return playerRowsFinal.map(row => {
      const r = playerRanks.get(row.player_id)
      return r ? { ...row, ...r } : row
    })
  }, [playerRowsFinal, playerRanks])

  // Next-season projections: compute once for every player.
  const seasonProjections = useMemo(() => {
    if (!careerStats || !leagueData?.playerMap || !empiricalCurves || !positionPeakPPG) return null
    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    const t0 = performance.now()
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    const result = {}
    for (const row of playerRowsWithRanks) {
      const proj = computeNextSeasonProjection({
        playerId:        row.player_id,
        playersMap:      leagueData.playerMap,
        careerStats,
        empiricalCurves,
        positionPeakPPG,
        historicalShares,
        depthMap,
        teamContext,
        scoringSettings: leagueData.scoringSettings,
        ktcMap,
        collegeStats,
        currentSeason,
        qbQualityByTeam: qbQualityByTeamRostered,
        ktcHistory,
        nflDraftMatches,
        historicalTeamTotals,
        priorTeamByPlayer,
      })
      if (proj) result[row.player_id] = proj
    }

    // eslint-disable-next-line react-hooks/purity -- deliberate perf instrumentation
    console.info('[perf][memo] seasonProjections', Math.round(performance.now() - t0) + 'ms', 'rows=', Object.keys(result).length)
    return result
  }, [playerRowsWithRanks, careerStats, leagueData, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, ktcMap, collegeStats, qbQualityByTeamRostered, ktcHistory, nflDraftMatches, historicalTeamTotals, priorTeamByPlayer])

  // Merge projections into rows so PlayersTab can sort/display by them.
  // Also compute nextSeasonRank: positional rank by projectedPPG.
  const playerRowsWithProj = useMemo(() => {
    if (!seasonProjections) return playerRowsWithRanks
    const enriched = playerRowsWithRanks.map(row => {
      const p = seasonProjections[row.player_id]
      return p
        ? {
            ...row,
            projectedPPG:      p.projectedPPG,
            projectedTotalPts: p.projectedTotalPts,
            projectionConfidence: p.confidence,
          }
        : row
    })
    // Rank within each position by projectedPPG (descending). Skip rows with null projection.
    const byPos = {}
    for (const r of enriched) {
      if (r.projectedPPG == null) continue
      ;(byPos[r.position] ??= []).push(r)
    }
    const rankById = {}
    for (const rows of Object.values(byPos)) {
      rows.sort((a, b) => b.projectedPPG - a.projectedPPG)
      rows.forEach((r, i) => { rankById[r.player_id] = i + 1 })
    }
    return enriched.map(r => ({ ...r, nextSeasonRank: rankById[r.player_id] ?? null }))
  }, [playerRowsWithRanks, seasonProjections])

  // Write a daily projection snapshot once all pipeline inputs are stable.
  // Fire-and-forget: never blocks render; errors are console.warn only.
  // Idempotency: skips silently if a snapshot for today's UTC date already exists.
  // First-league-of-the-day-wins: if the user switches leagues on the same UTC day,
  // the first league's snapshot is preserved and subsequent writes are no-ops.
  useEffect(() => {
    if (!seasonProjections || !leagueData?.playerMap || !ktcMap || !leagueData?.scoringSettings) return
    if (!selectedLeague?.league_id) return
    if (!careerStats) return
    let cancelled = false
    ;(async () => {
      try {
        const allSeasons    = Object.keys(careerStats).map(Number).sort()
        const currentSeason = allSeasons[allSeasons.length - 1]
        const result = await writeProjectionSnapshot({
          seasonProjections,
          playerMap:       leagueData.playerMap,
          ktcMap,
          playerRows:      playerRowsWithProj,
          scoringSettings: leagueData.scoringSettings,
          leagueId:        selectedLeague.league_id,
          currentSeason,
        })
        if (cancelled) return
        if (result.written) console.log(`[snapshot] wrote ${result.key} (${result.bytes} bytes)`)
        else                console.log(`[snapshot] skipped: ${result.reason}`)
      } catch (err) {
        if (!cancelled) console.warn('[snapshot] failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [seasonProjections, leagueData?.playerMap, ktcMap, leagueData?.scoringSettings, selectedLeague?.league_id, playerRowsWithProj, careerStats])

  useEffect(() => {
    getNFLState().then(setNflState).catch(setNflError)
  }, [])

  // Auto-load from localStorage on boot
  useEffect(() => {
    const storedUser   = loadStoredUser()
    const storedLeague = loadStoredLeague()
    if (!storedUser || !storedLeague) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional boot-time auto-load state init
    setUser(storedUser)
    setUsername(storedUser.username ?? '')
    setAutoLoading(true)
    getLeague(storedLeague.league_id)
      .then(fullLeague => {
        if (!fullLeague) throw new Error('League not found')
        setSelectedLeague(fullLeague)
        setAutoLoading(false)
      })
      .catch(err => {
        console.warn('[auto-load] league fetch failed:', err)
        clearStoredLeague()
        setAutoLoading(false)
        setAutoLoadError("Your previous league couldn't be loaded — please select again.")
      })
  }, [])

  // League data load
  useEffect(() => {
    if (!selectedLeague || !nflState) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional league-switch reset cascade
    setLeagueData(null); setLeagueLoading(true); setLeagueError(null)
    setMyTeamData(null); setMyTeamError(null)
    setCareerStats(null); setCareerLoadProgress(null)

    async function load() {
      const tLeague = performance.now()
      const tP = performance.now()
      const playerMapPromise = getAllPlayers().then(r => { console.info('[perf] getAllPlayers', Math.round(performance.now() - tP) + 'ms'); return r })
      const [users, rosters, playerMap, drafts] = await Promise.all([
        getLeagueUsers(selectedLeague.league_id),
        getLeagueRosters(selectedLeague.league_id),
        playerMapPromise,
        getLeagueDrafts(selectedLeague.league_id),
      ])
      console.info('[perf] leagueData assembly', Math.round(performance.now() - tLeague) + 'ms')
      const userMap = {}
      for (const u of users) userMap[u.user_id] = u

      const standings = rosters
        .map(roster => {
          const u = userMap[roster.owner_id] ?? {}
          const pf = (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100
          const pa = (roster.settings?.fpts_against ?? 0) + (roster.settings?.fpts_against_decimal ?? 0) / 100
          return {
            rosterId: roster.roster_id, ownerId: roster.owner_id,
            teamName: u.metadata?.team_name || u.display_name || u.username || `Team ${roster.roster_id}`,
            managerName: u.display_name || u.username || '',
            wins: roster.settings?.wins ?? 0, losses: roster.settings?.losses ?? 0, ties: roster.settings?.ties ?? 0,
            pointsFor: pf, pointsAgainst: pa,
          }
        })
        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
      standings.forEach((s, i) => { s.rank = i + 1 })

      const currentWeek = nflState.week ?? 0
      const lastWeek = Math.min(Math.max(currentWeek - 1, 0), 18)
      const weeks = []
      const weeklyScores = {}

      if (lastWeek >= 1) {
        const weekNums = Array.from({ length: lastWeek }, (_, i) => i + 1)
        const allMatchups = await Promise.all(weekNums.map(w => getMatchups(selectedLeague.league_id, w, currentWeek)))
        for (let i = 0; i < weekNums.length; i++) {
          const week = weekNums[i]
          weeks.push(week)
          const groups = {}
          for (const m of allMatchups[i]) {
            if (!groups[m.matchup_id]) groups[m.matchup_id] = []
            groups[m.matchup_id].push(m)
          }
          for (const pair of Object.values(groups)) {
            if (pair.length !== 2) continue
            const [a, b] = pair
            const aWon = a.points > b.points
            ;(weeklyScores[a.roster_id] ??= []).push({ week, points: a.points, opponentRosterId: b.roster_id, won: aWon })
            ;(weeklyScores[b.roster_id] ??= []).push({ week, points: b.points, opponentRosterId: a.roster_id, won: !aWon })
          }
        }
      }

      const rosterById = {}
      for (const r of rosters) rosterById[r.roster_id] = r

      function enrichPlayer(id, slot) {
        const p = playerMap[id]
        if (!p) return { id, slot, full_name: id, position: '?', team: null, age: null }
        return { id, slot, full_name: p.full_name, position: p.position, team: p.team, age: p.age }
      }

      const rosterTeams = standings.map(s => {
        const roster = rosterById[s.rosterId]
        const starterSet = new Set((roster.starters ?? []).filter(Boolean))
        const reserveSet = new Set(roster.reserve ?? [])
        return {
          rosterId: s.rosterId, ownerId: s.ownerId, rank: s.rank,
          teamName: s.teamName, managerName: s.managerName,
          starters: (roster.starters ?? []).filter(Boolean).map(id => enrichPlayer(id, 'Starter')),
          bench: (roster.players ?? []).filter(id => !starterSet.has(id) && !reserveSet.has(id)).map(id => enrichPlayer(id, 'Bench')),
          reserve: (roster.reserve ?? []).map(id => enrichPlayer(id, 'IR')),
        }
      })

      const rosteredIds = new Set(rosters.flatMap(r => r.players ?? []))

      // Rookie draft pick map: { [player_id]: { round, pick } }
      // Use the most recent rookie draft (by season, then draft_order presence).
      const rookieDraftPicks = {}
      const rookieDraft = (drafts ?? [])
        .filter(d => d.type === 'rookie')
        .sort((a, b) => (b.season ?? 0) - (a.season ?? 0))[0]
      if (rookieDraft) {
        try {
          const picks = await getDraftPicks(rookieDraft.draft_id)
          for (const pick of picks ?? []) {
            const pid = pick.player_id ?? pick.metadata?.player_id
            if (pid) rookieDraftPicks[pid] = { round: pick.round, pick: pick.pick_no }
          }
        } catch (err) {
          console.warn('[drafts] Failed to fetch rookie draft picks:', err.message)
        }
      }

      setLeagueData({ standings, weeklyScores, weeks, rosterTeams, playerMap, rosteredIds, rookieDraftPicks, scoringSettings: selectedLeague.scoring_settings ?? {} })

    }

    load().catch(err => setLeagueError(err.message)).finally(() => setLeagueLoading(false))
  }, [selectedLeague, nflState])

  // My Team stats
  useEffect(() => {
    if (!leagueData || !nflState || !user || !selectedLeague) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional myTeam load-start signal
    setMyTeamLoading(true); setMyTeamError(null)

    async function loadMyTeam() {
      const myRosterTeam = leagueData.rosterTeams.find(t => t.ownerId === user.user_id)
      if (!myRosterTeam) { setMyTeamData({ noRoster: true }); return }

      const currentWeek = nflState.week ?? 0
      const season = nflState.season
      const scoringSettings = selectedLeague.scoring_settings ?? {}
      const allPlayers = [...myRosterTeam.starters, ...myRosterTeam.bench, ...myRosterTeam.reserve]

      if (currentWeek === 0) {
        setMyTeamData({ team: myRosterTeam, players: allPlayers.map(p => ({ ...p, projected: 0, lastWeekPts: null, last4: [null, null, null, null], avg: null })), currentWeek, noStatsYet: true })
        return
      }

      const historyWeeks = []
      for (let w = Math.max(1, currentWeek - 4); w < currentWeek; w++) historyWeeks.push(w)
      const fetchList = [getWeeklyProjections(season, currentWeek, currentWeek)]
      if (historyWeeks.length > 0) fetchList.push(...historyWeeks.map(w => getWeeklyStats(season, w, currentWeek)))
      const [projections, ...historyResults] = await Promise.all(fetchList)
      const historyByWeek = {}
      for (let i = 0; i < historyWeeks.length; i++) historyByWeek[historyWeeks[i]] = historyResults[i] ?? {}

      const players = allPlayers.map(p => {
        const projStats = projections?.[p.id] ?? {}
        const projected = Object.keys(projStats).length > 0 ? calculateFantasyPoints(projStats, scoringSettings) : 0
        const lwStats = historyByWeek[currentWeek - 1]?.[p.id]
        const lastWeekPts = lwStats && Object.keys(lwStats).length > 0 ? calculateFantasyPoints(lwStats, scoringSettings) : null
        const last4 = [currentWeek - 4, currentWeek - 3, currentWeek - 2, currentWeek - 1].map(w => {
          if (w < 1) return null
          const s = historyByWeek[w]?.[p.id]
          if (!s || Object.keys(s).length === 0) return null
          const pts = calculateFantasyPoints(s, scoringSettings)
          return pts > 0 ? pts : null
        })
        const validPts = last4.filter(v => v != null)
        const avg = validPts.length > 0 ? Math.round((validPts.reduce((a, b) => a + b, 0) / validPts.length) * 10) / 10 : null
        return { ...p, projected, lastWeekPts, last4, avg }
      })

      setMyTeamData({ team: myRosterTeam, players, currentWeek, noStatsYet: currentWeek === 1 })
    }

    loadMyTeam().catch(err => setMyTeamError(err.message)).finally(() => setMyTeamLoading(false))
  }, [leagueData, nflState, user, selectedLeague])

  // Career history background load
  useEffect(() => {
    if (!leagueData || !nflState || !selectedLeague) return
    careerCancelRef.current = true
    const cancel = { current: false }
    careerCancelRef.current = cancel

    const currentSeason = parseInt(nflState.season)
    if (currentSeason < 2013) return

    const scoringSettings = selectedLeague.scoring_settings ?? {}
    const rosterIds = new Set()
    for (const team of leagueData.rosterTeams) {
      for (const p of [...team.starters, ...team.bench, ...team.reserve]) rosterIds.add(p.id)
    }
    const activeStatuses = new Set(['Active', 'Injured_Reserve', 'Free Agent'])
    const activePlayerIds = new Set()
    for (const [id, p] of Object.entries(leagueData.playerMap)) {
      if (activeStatuses.has(p.status) || rosterIds.has(id)) activePlayerIds.add(id)
    }

    loadCareerHistory(currentSeason, scoringSettings, activePlayerIds, leagueData.playerMap,
      (progress) => { if (!cancel.current) setCareerLoadProgress(progress) })
      .then(data => {
        if (cancel.current) return
        setCareerStats(data)
        setCareerLoadProgress(p => ({ ...p, done: true }))
        setTimeout(() => { if (!cancel.current) setCareerLoadProgress(p => ({ ...p, active: false })) }, 2000)
      })
      .catch(err => console.warn('Career history load error:', err))

    return () => { cancel.current = true }
  }, [leagueData, nflState, selectedLeague])

  // Load college stats in background once career history is ready, then match to Sleeper
  useEffect(() => {
    if (!careerStats || !leagueData?.playerMap) return
    let cancelled = false
    loadCollegeStats()
      .then(data => {
        if (cancelled) return
        setCollegeMatches(matchCollegeToSleeper(data, leagueData.playerMap))
      })
      .catch(err => console.warn('[cfbd] Load error:', err.message))
    return () => { cancelled = true }
  }, [careerStats, leagueData])

  // Load NFL draft picks (D1) in background once playersMap is available, then match to Sleeper
  useEffect(() => {
    if (!leagueData?.playerMap) return
    let cancelled = false
    loadNflDraftPicks()
      .then(picks => {
        if (cancelled) return
        setNflDraftMatches(matchNflDraftToSleeper(picks, leagueData.playerMap))
      })
      .catch(err => console.warn('[nflDraft] Load error:', err.message))
    return () => { cancelled = true }
  }, [leagueData])

  // Load nflverse current-season roster for the relevance filter.
  // Keyed on nflState.season (the actual current/upcoming NFL season, e.g. 2026) so the
  // probe starts from the right year. Uses nflState rather than the projection's
  // careerStats-derived currentSeason (last completed season) to avoid a one-year lag.
  useEffect(() => {
    if (!leagueData?.playerMap || !nflState?.season) return
    let cancelled = false
    const currentSeason = parseInt(nflState.season, 10)
    loadCurrentRoster(currentSeason)
      .then(r => { if (!cancelled) setNflRoster(r) })
      .catch(err => console.warn('[nflRoster] Load error:', err.message))
    return () => { cancelled = true }
  }, [leagueData, nflState])

  // Load nflverse advanced stats (view-only display in the Player Profile).
  // Keyed on the most-recent completed season (careerStats-derived), matching the
  // season whose stats the profile surfaces. NOT consumed by projection/scoring.
  useEffect(() => {
    if (!careerStats) return
    let cancelled = false
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const currentSeason = allSeasons[allSeasons.length - 1]
    loadAdvStats(currentSeason)
      .then(r => { if (!cancelled) setAdvStats(r) })
      .catch(err => console.warn('[advStats] Load error:', err.message))
    return () => { cancelled = true }
  }, [careerStats])

  async function handleUsernameSubmit(e) {
    e.preventDefault()
    setUserError(null); setUser(null); setLeagues(null); setSelectedLeague(null)
    setLeagueData(null); setMyTeamData(null); setCareerStats(null); setCareerLoadProgress(null)
    setUserLoading(true)
    try {
      const result = await getUserByUsername(username.trim())
      if (!result) { setUserError('User not found.'); return }
      setUser(result)
      saveStoredUser({ user_id: result.user_id, username: result.username, display_name: result.display_name, avatar: result.avatar })
      setLeaguesLoading(true)
      const season = nflState?.season ?? new Date().getFullYear().toString()
      setLeagues((await getLeaguesForUser(result.user_id, season)) ?? [])
    } catch {
      setUserError('Could not find that username. Check the spelling and try again.')
    } finally {
      setUserLoading(false); setLeaguesLoading(false)
    }
  }

  function handleSwitch() {
    clearStoredUser(); clearStoredLeague()
    setUser(null); setUsername(''); setLeagues(null); setSelectedLeague(null)
    setLeagueData(null); setMyTeamData(null); setCareerStats(null); setCareerLoadProgress(null)
    setAutoLoadError(null)
    clearComparison()
  }

  return (
    <TooltipContext.Provider value={tooltipsEnabled}>
      <HashRouter>
        <AppShell
          user={user}
          selectedLeague={selectedLeague}
          onSwitch={handleSwitch}
          tooltipsEnabled={tooltipsEnabled}
          onToggleTooltips={handleToggleTooltips}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          showNav={!!leagueData}
          showRookies={isRookieSeason()}
        >
          {autoLoadError && (
            <div className="mb-6">
              <div className="bg-[var(--c-amber-50)] border border-[var(--c-amber-200)] text-[var(--c-amber-800)] text-sm px-4 py-3 rounded">
                {autoLoadError}
              </div>
            </div>
          )}

          {(autoLoading || !nflState)
            ? (
              <div>
                {nflError
                  ? <p className="text-[var(--color-negative-text)]">Failed to load NFL state: {nflError.message}</p>
                  : <p className="text-[var(--color-text-muted)] text-sm mt-2">
                      {autoLoading
                        ? <>Loading <span className="font-medium text-[var(--color-text-secondary)]">{initialStoredLeague?.name}</span> for <span className="font-medium text-[var(--color-text-secondary)]">{user?.display_name || user?.username}</span>…</>
                        : 'Loading…'}
                    </p>
                }
              </div>
            )
            : !selectedLeague
              ? (
                <>
                  <form onSubmit={handleUsernameSubmit} className="flex gap-2 mb-4">
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="Sleeper username" required
                      className="border border-[var(--color-border)] rounded px-3 py-2 flex-1 max-w-xs" />
                    <button type="submit" disabled={userLoading}
                      className="bg-[var(--color-accent)] text-[var(--color-on-accent)] px-4 py-2 rounded disabled:opacity-50">
                      {userLoading ? 'Loading...' : 'Find User'}
                    </button>
                  </form>

                  {userError && <p className="text-[var(--color-negative-text)] mb-4">{userError}</p>}

                  {user && (
                    <div className="mb-8">
                      <p className="mb-3 text-[var(--color-text-secondary)]">
                        Leagues for <span className="font-semibold">{user.display_name || user.username}</span> — {nflState.season}
                      </p>
                      {leaguesLoading && <p className="text-[var(--color-text-muted)]">Loading leagues...</p>}
                      {leagues?.length === 0 && <p className="text-[var(--color-text-muted)]">No leagues found for this season.</p>}
                      {leagues && leagues.length > 0 && (
                        <div className="space-y-2">
                          {leagues.map(league => (
                            <button key={league.league_id}
                              onClick={() => {
                                setSelectedLeague(league)
                                saveStoredLeague({ league_id: league.league_id, name: league.name, season: league.season, scoring_type: league.scoring_type, total_rosters: league.total_rosters })
                              }}
                              className={`w-full max-w-lg text-left border rounded p-4 transition-colors ${
                                selectedLeague?.league_id === league.league_id ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle-bg)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                              }`}>
                              <div className="font-semibold">{league.name}</div>
                              <div className="text-sm text-[var(--color-text-muted)] mt-1 flex gap-4">
                                <span>{scoringLabel(league.scoring_settings?.rec)}</span>
                                <span>{league.total_rosters} teams</span>
                                <span>{league.status}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
              : !leagueData
                ? (
                  <div>
                    {leagueLoading && <p className="text-[var(--color-text-muted)]">Loading league data...</p>}
                    {leagueError && <p className="text-[var(--color-negative-text)]">Error: {leagueError}</p>}
                  </div>
                )
                : (
                  <>
                    <Routes>
                      <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
                      <Route path="/board" element={<Board />} />
                      <Route path="/roster" element={
                        <MyTeamView
                          data={myTeamData}
                          loading={myTeamLoading}
                          error={myTeamError}
                          projections={seasonProjections}
                        />
                      } />
                      <Route path="/players" element={
                        <PlayersTab
                          playerRows={playerRowsWithProj}
                          loaded={!!careerStats}
                          careerStats={careerStats}
                          playerMap={leagueData.playerMap}
                          positionPeakPPG={positionPeakPPG}
                          ktcMap={ktcMap}
                          historicalShares={historicalShares}
                          collegeStats={collegeStats}
                          seasonProjections={seasonProjections}
                          enrichmentMap={enrichmentMap}
                          advStats={advStats}
                          myTeamName={leagueData.rosterTeams.find(t => t.ownerId === user?.user_id)?.teamName ?? null}
                          fantasyTeamNames={leagueData.rosterTeams.map(t => t.teamName)}
                          comparisonList={comparisonList}
                          addToComparison={addToComparison}
                          removeFromComparison={removeFromComparison}
                          clearComparison={clearComparison}
                        />
                      } />
                      <Route path="/trade" element={<Trade />} />
                      <Route path="/league" element={<Navigate to="/league/standings" replace />} />
                      <Route path="/league/:view" element={<LeagueView leagueData={leagueData} />} />
                      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
                    </Routes>

                    <div className="mt-8 pt-4 border-t">
                      <ClearCacheButton />
                      <div className="mt-2">
                        <ExportDataButton />
                      </div>
                    </div>
                  </>
                )}
        </AppShell>
      </HashRouter>

      <CareerLoadProgressBar progress={careerLoadProgress} />
    </TooltipContext.Provider>
  )
}

export default App
