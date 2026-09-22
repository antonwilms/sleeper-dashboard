import { useEffect, useMemo, useState } from 'react'
import { getWeeklyStatRows, getWeeklyProjectionRows } from '../api/sleeperStats'
import { loadTeamContext } from '../api/teamContext'
import { buildFpaTable, rankFpaTable, isDefenseRowId } from '../utils/opponentStrength'
import { deriveDataSeason } from '../utils/environment'
import { buildTeamAggregates, accumulateUsage, computeUsageShares, priorSeasonSnapShare } from '../utils/weeklyUsage'
import { buildWeightPanel } from '../utils/blendWeights'
import { buildWeeklyLineup, projectionGapReason } from '../utils/weeklyLineup'
import { buildRegWeekIndex, scheduledGamesThrough } from '../utils/weeklySchedule'
import { calculateFantasyPoints } from '../utils/fantasyPoints'
import { normalizeTeamForSchedule } from '../utils/nflStats'

// weekly-decision-1-lineup.md §5, weekly-decision-2a-lineup-truth.md §5/§6 — the one orchestration
// point for `/week`.
//
// Why a hook and not App.jsx state. "App.jsx owns all domain/pipeline state" is an invariant, and
// every nflverse side-load named beside it in that invariant — teamContextByYear, gameLogsByYear,
// nflScheduleByYear, currentSeasonTotals — is App.jsx-owned. This hook is NOT an exception to that
// rule; it is the same pattern as src/hooks/useTeamHistoryLoader.js, the in-repo precedent for a
// route-scoped loader that no other surface consumes, extracted to a hook so its dedupe/merge
// logic is unit-testable without mounting the whole app. Nothing it loads feeds the `playerRows`
// pipeline, reaches another route, or outlives `/week`.
//
// Degraded paths, all of which render rather than throw: no league selected / empty roster (an
// empty `myTeam` -> buildWeeklyLineup returns empty starter slots and no bench rows), no known
// season/week (currentWeek === 0 or season absent — loading clears immediately, WeekView renders a
// stated empty state instead of a spinner), a Sleeper fetch failure for one week
// (Promise.allSettled drops that week from weeklyMaps, keeps the rest, and reports its week number
// via `failedWeeks` rather than dropping it silently), currentWeek === 1 with zero played weeks
// (artboard 9c — weights all 0%, usage all null/`—`, the lineup still renders exactly as set in
// Sleeper since buildWeeklyLineup requires no usage/form data to run).
// Pure — extracted from the hook body (fix pass 1, item 1.8) so `n`'s provenance is unit-testable
// without mounting the hook. `n` is games played, once, for the weight panel: the max `gamesPlayed`
// across the DEF rows of `currentSeasonTotals.players`, falling back to `currentWeek - 1` when that
// map is empty/absent. §5.4 makes this load-bearing for the weight panel's honesty.

// The max `gamesPlayed` across a row map's DEF rows, or null when the map has no DEF row at all
// (weekly-decision-2a-lineup-truth.md §5 — extracted so deriveGamesPlayed and deriveStoreLag share
// one DEF-row scan instead of two copies that could drift).
export function maxDefGamesPlayed(players) {
  if (!players) return null
  let maxGames = 0
  let sawDefRow = false
  for (const [key, row] of Object.entries(players)) {
    if (!isDefenseRowId(key)) continue
    sawDefRow = true
    if ((row?.gamesPlayed ?? 0) > maxGames) maxGames = row.gamesPlayed
  }
  return sawDefRow ? maxGames : null
}

export function deriveGamesPlayed({ currentSeason, currentSeasonTotals, currentWeek }) {
  if (currentSeason != null) {
    const maxGames = maxDefGamesPlayed(currentSeasonTotals?.players)
    if (maxGames != null) return maxGames
  }
  return Math.max(0, currentWeek - 1)
}

// weekly-decision-2a-lineup-truth.md §5 — per-team freshness of the store's season-totals file
// against the live schedule, replacing the brief's max-vs-completed comparison (which fires falsely
// once every team has had its bye, and plateaus across a bye so it can hide a real one-week lag).
// null (no notice) when: currentSeason is unresolved, the file has no DEF row, or scheduleIndex is
// null — without the schedule there is no correct expected count, and a guess is exactly the false
// notice this replaces.
export function deriveStoreLag({ currentSeason, currentSeasonTotals, currentWeek, scheduleIndex }) {
  if (currentSeason == null) return null
  if (scheduleIndex == null) return null
  const players = currentSeasonTotals?.players
  if (!players) return null

  const completedWeeks = Math.max(0, currentWeek - 1)

  const storeGp = {}
  let sawDefRow = false
  for (const [key, row] of Object.entries(players)) {
    if (!isDefenseRowId(key)) continue
    sawDefRow = true
    // The DEF row's OWN key is the Sleeper domain (CR-16 hop) — not `row.team`.
    const eraTeam = normalizeTeamForSchedule(key)
    storeGp[eraTeam] = row?.gamesPlayed ?? 0
  }
  if (!sawDefRow) return null

  // Largest k in 0..completedWeeks such that, for every team the store has a DEF row for, that
  // team's stored gamesPlayed is at least its scheduled REG games through week k. A team absent
  // from the store's DEF rows is skipped, not counted as 0.
  let storeThroughWeek = 0
  for (let k = 0; k <= completedWeeks; k++) {
    let ok = true
    for (const [team, gp] of Object.entries(storeGp)) {
      if (gp < scheduledGamesThrough(scheduleIndex, team, k, completedWeeks)) { ok = false; break }
    }
    if (ok) storeThroughWeek = k
  }

  return { storeThroughWeek, completedWeeks, behind: storeThroughWeek < completedWeeks }
}

// Pure — extracted alongside deriveGamesPlayed for the same reason (fix pass 1, item 1.8). A
// player's fantasy points in the last three *played* weeks (gp === 1), scored in league settings,
// oldest first. Fewer than three played weeks -> leading nulls, never padded with 0.
export function buildLast3Form(playedWeeklyMaps, id, scoringSettings) {
  const playedPoints = []
  for (const wk of playedWeeklyMaps ?? []) {
    const row = wk.rows?.[id]
    if (row?.stats?.gp === 1) playedPoints.push(calculateFantasyPoints(row.stats, scoringSettings ?? {}))
  }
  const last3 = playedPoints.slice(-3)
  return [...Array(Math.max(0, 3 - last3.length)).fill(null), ...last3]
}

// The players usage/form must be computed over: every starter slot's filled id, every surplus
// starter id (§3 — starterSlots longer than the slot list), and myTeam.bench minus taxi. This is
// exactly the set buildWeeklyLineup renders, computed independently so usage/form can be built
// before the lineup call that needs them as input. myTeam.bench no longer contains taxi at the
// source (App.jsx splitRosterIds, lineup-pool-startable.md); the `minus taxi` filter below stays.
export function renderedPlayers(myTeam) {
  const starterSlots = myTeam?.starterSlots ?? []
  const byId = new Map((myTeam?.starters ?? []).map(p => [p.id, p]))
  const taxiIds = new Set((myTeam?.taxi ?? []).map(p => p.id))

  const seen = new Map()
  for (const id of starterSlots) {
    if (id == null) continue
    const p = byId.get(id)
    if (p) seen.set(p.id, p)
  }
  for (const p of myTeam?.bench ?? []) {
    if (taxiIds.has(p.id)) continue
    seen.set(p.id, p)
  }
  return [...seen.values()]
}

// weekly-decision-2-panels.md §1a — extracted alongside deriveGamesPlayed/deriveStoreLag for the
// same reason (unit-testable without mounting the hook). The year is derived here, internally, via
// `deriveDataSeason(careerStats)` — NOT `season - 1` and NOT taken as a caller-supplied param — so
// no call site can supply the wrong one (fix pass 1, item 1.1). It must agree with the prior season
// §5.3's fpaTable blends use, or the grey sub-line describes a different year than its ALLOWS
// column.
export function buildPriorSnapByPlayer({ rendered, careerStats }) {
  const dataSeason = deriveDataSeason(careerStats)
  const priorRows = careerStats?.[dataSeason] ?? null
  const out = {}
  for (const p of rendered ?? []) {
    const id = p?.id
    if (id == null) continue
    out[id] = priorSeasonSnapShare(priorRows, id)
  }
  return out
}

export function useWeeklyDecision({
  season,
  currentWeek,
  myTeam,
  rosterPositions,
  scoringSettings,
  careerStats,
  currentSeasonTotals,
  playerMap,
  schedule = null,
}) {
  const [weeklyMaps, setWeeklyMaps] = useState([])
  const [projections, setProjections] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // weekly-decision-2-panels.md §4 — "Offences you own". A DELIBERATE exception to the
  // dataSeason-keying every other nflverse side-load uses (CLAUDE.md "State and data flow"): this
  // panel is about the IN-PROGRESS season and nothing else, so it loads the live season
  // (`season`, the same `parseInt(nflState.season, 10)` WeekView already derives) rather than the
  // most-recent season with data. Route-scoped to `/week`, not merged into App.jsx's
  // `teamContextByYear` — do not widen that effect or `ENV_SEASONS` to cover this read.
  const [liveTeamContext, setLiveTeamContext] = useState({ teams: {}, year: null, complete: false, rowCount: 0 })
  // Weeks whose getWeeklyStatRows fetch rejected — Promise.allSettled drops them from weeklyMaps
  // silently otherwise. Named here so the banner can say which weeks are missing, not just that
  // something failed (fix pass 1, item 1.4).
  const [failedWeeks, setFailedWeeks] = useState([])

  // 1. Fetch getWeeklyStatRows for w in 1..currentWeek — NOT getWeeklyStats, which strips `team`
  // (weeklyUsage.js's accumulateUsage resolves the player's team per week from this fetch's own
  // row). Promise.allSettled, not Promise.all: one rejected week must not lose the batch, the same
  // reasoning as App.jsx's teamContext effect.
  // 2. Fetch getWeeklyProjectionRows for the current week — one call.
  // React Strict Mode double-fires effects — the `cancelled` flag below is checked before every
  // setter.
  useEffect(() => {
    let cancelled = false

    // setState calls live inside this nested async function, not synchronously in the effect
    // body itself (react-hooks/set-state-in-effect) — the `cancelled` flag still guards every one
    // of them against React Strict Mode's double-fire.
    async function load() {
      // No known season/week (nflState not yet resolved, or `currentWeek` is 0) — render the
      // stated empty state rather than leaving the spinner up forever; there is nothing to fetch
      // yet.
      if (!season || !currentWeek) {
        if (!cancelled) setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      setFailedWeeks([])

      const weeks = []
      for (let w = 1; w <= currentWeek; w++) weeks.push(w)

      const statRowsPromise = Promise.allSettled(
        weeks.map(w => getWeeklyStatRows(season, w, currentWeek).then(rows => ({ week: w, rows })))
      ).then(results => {
        if (cancelled) return
        // `results[i]` corresponds to `weeks[i]` regardless of fulfilled/rejected — Promise.allSettled
        // preserves input order — so a rejected entry's week number comes from the index, not the
        // (absent) resolved value.
        const maps = []
        const failed = []
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            maps.push({ week: r.value.week, rows: r.value.rows, teamAggregates: buildTeamAggregates(r.value.rows) })
          } else {
            failed.push(weeks[i])
          }
        })
        maps.sort((a, b) => a.week - b.week)
        setWeeklyMaps(maps)
        setFailedWeeks(failed)
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

  // §4 — the live-season teamcontext read, route-scoped to /week (see the state declaration above
  // for why this keys on `season`, not `dataSeason`). Graceful absence — a missing manifest entry,
  // a disabled store, or a below-floor file — all resolve to loadTeamContext's own
  // `{ complete: false }` shape; OffencesOwned branches on `complete`, never key presence.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!season) {
        if (!cancelled) setLiveTeamContext({ teams: {}, year: null, complete: false, rowCount: 0 })
        return
      }
      const result = await loadTeamContext(season)
      if (!cancelled) setLiveTeamContext(result)
    }
    load()
    return () => { cancelled = true }
  }, [season])

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
  // weekly-decision-2-panels.md §2 — the exact two halves buildFpaTable resolves, exposed so
  // DefencesFaced can call computeFpaPerGame directly against them (by the same rules) without
  // re-deriving dataSeason/the completeness gate a second time.
  const priorRows = useMemo(() => careerStats?.[dataSeason] ?? null, [careerStats, dataSeason])
  const currentRows = useMemo(
    () => (currentSeason != null ? currentSeasonTotals.players : null),
    [currentSeason, currentSeasonTotals]
  )
  const fpaTable = useMemo(
    () => buildFpaTable({ priorRows, currentRows }),
    [priorRows, currentRows]
  )
  const fpaRanks = useMemo(() => rankFpaTable(fpaTable), [fpaTable])

  // 4. n = games played, once, for the weight panel — see deriveGamesPlayed above.
  const n = useMemo(
    () => deriveGamesPlayed({ currentSeason, currentSeasonTotals, currentWeek }),
    [currentSeason, currentSeasonTotals, currentWeek]
  )

  // §4 — the schedule index, built once. No other buildRegWeekIndex call site is allowed (CR-08,
  // §9). `schedule` is the gated loader result (or null) the caller (WeekView) already resolved.
  const scheduleIndex = useMemo(() => buildRegWeekIndex(schedule), [schedule])

  // §5 — per-team store-lag notice.
  const storeLag = useMemo(
    () => deriveStoreLag({ currentSeason, currentSeasonTotals, currentWeek, scheduleIndex }),
    [currentSeason, currentSeasonTotals, currentWeek, scheduleIndex]
  )

  // Every player buildWeeklyLineup will actually render — starters (incl. surplus) + bench minus
  // taxi — not the whole roster. Usage/form for a player who reaches neither section would be
  // wasted work and, worse, would imply IR/taxi are being considered.
  const rendered = useMemo(() => renderedPlayers(myTeam), [myTeam])

  // Per-player usage (accumulated across played weeks) and form (last 3 played weeks' league-
  // scored fantasy points, oldest first, leading nulls when fewer than 3 played weeks exist).
  const { usageByPlayer, formByPlayer } = useMemo(() => {
    const usage = {}
    const form = {}
    for (const p of rendered) {
      const id = p?.id
      if (id == null) continue
      const totals = accumulateUsage(playedWeeklyMaps, id)
      usage[id] = computeUsageShares(totals, p.position)

      form[id] = buildLast3Form(playedWeeklyMaps, id, scoringSettings)
    }
    return { usageByPlayer: usage, formByPlayer: form }
  }, [rendered, playedWeeklyMaps, scoringSettings])

  // §1a — the prior-season grey SNAP sub-line, over every rendered row. `dataSeason`, not
  // `season - 1` — must agree with the prior season §5.3's fpaTable blends, above.
  const priorSnapByPlayer = useMemo(
    () => buildPriorSnapByPlayer({ rendered, careerStats }),
    [rendered, careerStats]
  )

  const weights = useMemo(() => buildWeightPanel(n), [n])

  const lineup = useMemo(
    () => buildWeeklyLineup({
      myTeam,
      rosterPositions,
      currentWeek,
      scheduleIndex,
      projections,
      scoringSettings,
      usageByPlayer,
      formByPlayer,
      fpaTable,
      fpaRanks,
      playerMap,
    }),
    [myTeam, rosterPositions, currentWeek, scheduleIndex, projections, scoringSettings, usageByPlayer, formByPlayer, fpaTable, fpaRanks, playerMap]
  )

  // §4b — why a PROJ cell is blank, over the rendered rows the lineup already computed (empty
  // starter slots excluded — an empty slot has no `points` to explain).
  const projectionGap = useMemo(
    () => projectionGapReason({
      rows: [...lineup.starters.filter(r => r.player_id != null), ...lineup.bench],
      projections,
      scoringSettings,
      error,
    }),
    [lineup, projections, scoringSettings, error]
  )

  return {
    weights, lineup, n, storeLag, scheduleIndex, loading, error, failedWeeks, weeklyMaps, playedWeeklyMaps,
    projections, fpaTable, priorRows, currentRows, dataSeason, currentSeason, priorSnapByPlayer,
    liveTeamContext, projectionGap,
  }
}
