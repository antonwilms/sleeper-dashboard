import { useEffect, useMemo, useState } from 'react'
import { getWeeklyStatRows, getWeeklyProjectionRows } from '../api/sleeperStats'
import { buildFpaTable, rankFpaTable, isDefenseRowId } from '../utils/opponentStrength'
import { deriveDataSeason } from '../utils/environment'
import { buildTeamAggregates, accumulateUsage, computeUsageShares } from '../utils/weeklyUsage'
import { buildWeightPanel } from '../utils/blendWeights'
import { buildWeeklyLineup } from '../utils/weeklyLineup'
import { calculateFantasyPoints } from '../utils/fantasyPoints'

// weekly-decision-1-lineup.md §5 — the one orchestration point for `/week`.
//
// Why a hook and not App.jsx state. "App.jsx owns all domain/pipeline state" is an invariant, and
// every nflverse side-load named beside it in that invariant — teamContextByYear, gameLogsByYear,
// nflScheduleByYear, currentSeasonTotals — is App.jsx-owned. This hook is NOT an exception to that
// rule; it is the same pattern as src/hooks/useTeamHistoryLoader.js, the in-repo precedent for a
// route-scoped loader that no other surface consumes, extracted to a hook so its dedupe/merge
// logic is unit-testable without mounting the whole app. Nothing it loads feeds the `playerRows`
// pipeline, reaches another route, or outlives `/week`.
//
// Degraded paths, all of which render rather than throw: no league selected / empty roster (empty
// `myPlayers` -> buildWeeklyLineup returns ten empty slots), a Sleeper fetch failure for one week
// (Promise.allSettled drops that week, keeps the rest), currentWeek === 1 with zero played weeks
// (artboard 9c — weights all 0%, usage all null/`—`, lineup still fills and ranks on projection
// alone, since buildWeeklyLineup requires no usage/form data to run).
export function useWeeklyDecision({
  season,
  currentWeek,
  myPlayers,
  rosterPositions,
  scoringSettings,
  careerStats,
  currentSeasonTotals,
}) {
  const [weeklyMaps, setWeeklyMaps] = useState([])
  const [projections, setProjections] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 1. Fetch getWeeklyStatRows for w in 1..currentWeek — NOT getWeeklyStats, which strips `team`
  // (weeklyUsage.js's accumulateUsage resolves the player's team per week from this fetch's own
  // row). Promise.allSettled, not Promise.all: one rejected week must not lose the batch, the same
  // reasoning as App.jsx's teamContext effect.
  // 2. Fetch getWeeklyProjectionRows for the current week — one call.
  // React Strict Mode double-fires effects — the `cancelled` flag below is checked before every
  // setter.
  useEffect(() => {
    if (!season || !currentWeek) return
    let cancelled = false

    // setState calls live inside this nested async function, not synchronously in the effect
    // body itself (react-hooks/set-state-in-effect) — the `cancelled` flag still guards every one
    // of them against React Strict Mode's double-fire.
    async function load() {
      setLoading(true)
      setError(null)

      const weeks = []
      for (let w = 1; w <= currentWeek; w++) weeks.push(w)

      const statRowsPromise = Promise.allSettled(
        weeks.map(w => getWeeklyStatRows(season, w, currentWeek).then(rows => ({ week: w, rows })))
      ).then(results => {
        if (cancelled) return
        const maps = results
          .filter(r => r.status === 'fulfilled')
          .map(r => ({ week: r.value.week, rows: r.value.rows, teamAggregates: buildTeamAggregates(r.value.rows) }))
          .sort((a, b) => a.week - b.week)
        setWeeklyMaps(maps)
      })

      const projectionsPromise = getWeeklyProjectionRows(season, currentWeek, currentWeek)
        .then(rows => { if (!cancelled) setProjections(rows) })
        .catch(err => { if (!cancelled) setError(err.message) })

      await Promise.allSettled([statRowsPromise, projectionsPromise])
      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [season, currentWeek])

  // Played weeks only (1..currentWeek-1) — the in-progress current week's rows carry gp!==1 for
  // everyone anyway, but weeklyUsage.js's own header documents this input as played weeks, so the
  // slice is made explicit here rather than relied on implicitly.
  const playedWeeklyMaps = useMemo(
    () => weeklyMaps.filter(wk => wk.week < currentWeek),
    [weeklyMaps, currentWeek]
  )

  // 3. Resolve both FPA row-map halves exactly as Teams.jsx:129,151-156 and
  // Portfolio.jsx:369-373 do — deriveDataSeason(careerStats), NOT season - 1; currentRows gated on
  // `currentSeasonTotals?.complete`, never on key presence. Row maps passed straight through, never
  // synthesised into a fabricated `{...careerStats, [season]: rows}` shape.
  const dataSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])
  const currentSeason = currentSeasonTotals?.complete ? currentSeasonTotals.season : null
  const fpaTable = useMemo(
    () => buildFpaTable({
      priorRows: careerStats?.[dataSeason] ?? null,
      currentRows: currentSeason != null ? currentSeasonTotals.players : null,
    }),
    [careerStats, dataSeason, currentSeason, currentSeasonTotals]
  )
  const fpaRanks = useMemo(() => rankFpaTable(fpaTable), [fpaTable])

  // 4. n = games played, once, for the weight panel: the max gamesPlayed across the DEF rows of
  // currentSeasonTotals.players, falling back to currentWeek - 1 when that map is empty/absent.
  const n = useMemo(() => {
    if (currentSeason != null && currentSeasonTotals?.players) {
      let maxGames = 0
      let sawDefRow = false
      for (const [key, row] of Object.entries(currentSeasonTotals.players)) {
        if (!isDefenseRowId(key)) continue
        sawDefRow = true
        if ((row?.gamesPlayed ?? 0) > maxGames) maxGames = row.gamesPlayed
      }
      if (sawDefRow) return maxGames
    }
    return Math.max(0, currentWeek - 1)
  }, [currentSeason, currentSeasonTotals, currentWeek])

  // Per-player usage (accumulated across played weeks) and form (last 3 played weeks' league-
  // scored fantasy points, oldest first, leading nulls when fewer than 3 played weeks exist).
  const { usageByPlayer, formByPlayer } = useMemo(() => {
    const usage = {}
    const form = {}
    for (const p of myPlayers ?? []) {
      const id = p?.player_id ?? p?.id
      if (id == null) continue
      const totals = accumulateUsage(playedWeeklyMaps, id)
      usage[id] = computeUsageShares(totals, p.position)

      const playedPoints = []
      for (const wk of playedWeeklyMaps) {
        const row = wk.rows?.[id]
        if (row?.stats?.gp === 1) playedPoints.push(calculateFantasyPoints(row.stats, scoringSettings ?? {}))
      }
      const last3 = playedPoints.slice(-3)
      form[id] = [...Array(Math.max(0, 3 - last3.length)).fill(null), ...last3]
    }
    return { usageByPlayer: usage, formByPlayer: form }
  }, [myPlayers, playedWeeklyMaps, scoringSettings])

  const weights = useMemo(() => buildWeightPanel(n), [n])

  const lineup = useMemo(
    () => buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections,
      scoringSettings,
      usageByPlayer,
      formByPlayer,
      fpaTable,
      fpaRanks,
    }),
    [myPlayers, rosterPositions, projections, scoringSettings, usageByPlayer, formByPlayer, fpaTable, fpaRanks]
  )

  return { weights, lineup, n, loading, error, weeklyMaps, playedWeeklyMaps }
}
