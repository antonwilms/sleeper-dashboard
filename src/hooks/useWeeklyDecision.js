import { useEffect, useMemo, useState } from 'react'
import { getWeeklyStatRows, getWeeklyProjectionRows } from '../api/sleeperStats'
import { loadTeamContext } from '../api/teamContext'
import { buildFpaTable, rankFpaTable } from '../utils/opponentStrength'
import { deriveDataSeason } from '../utils/environment'
import {
  buildTeamAggregates, accumulateUsage, computeUsageShares, priorSeasonSnapShare,
  accumulateRedZone, computeRedZoneShares, computeUsageCounts,
} from '../utils/weeklyUsage'
import { buildLineupRanks } from '../utils/weeklyRanks'
import { buildWeightPanel } from '../utils/blendWeights'
import { buildWeeklyLineup, projectionGapReason } from '../utils/weeklyLineup'
import { buildRegWeekIndex, buildTeamRecords } from '../utils/weeklySchedule'
import { calculateFantasyPoints } from '../utils/fantasyPoints'

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
// Sleeper since buildWeeklyLineup requires no usage/form data to run). Usage carries counts and
// red-zone usage beside the shares, and each row carries season ranks (weeklyRanks.js).
// Pure — extracted from the hook body (fix pass 1, item 1.8) so `n`'s provenance is unit-testable
// without mounting the hook. `n` is games played, once, for the weight panel: the max `gp` across
// the defences of `current` (defenceAllowed.current — built from Sleeper's weekly stat rows), falling
// back to `currentWeek - 1` when `current` is absent or has no team. §5.4 makes this load-bearing
// for the weight panel's honesty.
export function deriveGamesPlayed({ current, currentWeek }) {
  const gps = Object.values(current?.teams ?? {}).map(t => t.gp)
  if (gps.length > 0) return Math.max(...gps)
  return Math.max(0, currentWeek - 1)
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

// weekly-decision-2-panels.md §1a — extracted alongside deriveGamesPlayed for the
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

// Halves of the defence load that dropped weeks — surfaced in DefencesFaced's footer.
export function buildDefenceFailedWeeks(defenceAllowed) {
  return [defenceAllowed?.prior, defenceAllowed?.current]
    .filter(h => h?.failedWeeks?.length > 0)
    .map(h => ({ season: h.season, weeks: h.failedWeeks }))
}

export function useWeeklyDecision({
  season,
  currentWeek,
  myTeam,
  rosterPositions,
  scoringSettings,
  careerStats,
  defenceAllowed = null,
  playerMap,
  schedule = null,
  priorSchedule = null,
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

  // 3. The two halves of the FPA blend, from `defenceAllowed` (App.jsx's memo over Sleeper's weekly
  // stat rows, scored in league scoring — defence-numbers-rebuild.md §5). Exposed so DefencesFaced
  // can call computeFpaPerGame directly against them (by the same rules) without re-deriving
  // anything a second time.
  const dataSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])
  const priorAllowed = defenceAllowed?.prior?.teams ?? null
  const currentAllowed = defenceAllowed?.current?.teams ?? null
  const priorSeason = defenceAllowed?.prior?.season ?? dataSeason
  const currentSeason = defenceAllowed?.current?.season ?? null
  const fpaTable = useMemo(
    () => buildFpaTable({ prior: priorAllowed, current: currentAllowed }),
    [priorAllowed, currentAllowed]
  )
  const fpaRanks = useMemo(() => rankFpaTable(fpaTable), [fpaTable])

  // 4. n = games played, once, for the weight panel — see deriveGamesPlayed above.
  const n = useMemo(
    () => deriveGamesPlayed({ current: defenceAllowed?.current ?? null, currentWeek }),
    [defenceAllowed, currentWeek]
  )

  // §4 — the schedule index, built once. No other buildRegWeekIndex call site is allowed (CR-08,
  // §9). `schedule` is the gated loader result (or null) the caller (WeekView) already resolved.
  const scheduleIndex = useMemo(() => buildRegWeekIndex(schedule), [schedule])

  // Defences-you-face RECORD column: last season's final record, and the live season's record
  // through the completed weeks (an unscored game in those weeks marks the file as trailing).
  const priorRecords = useMemo(() => buildTeamRecords(priorSchedule), [priorSchedule])
  const currentRecords = useMemo(
    () => buildTeamRecords(schedule, { throughWeek: Math.max(0, currentWeek - 1) }),
    [schedule, currentWeek]
  )

  // Halves of the defence load that dropped weeks — surfaced in DefencesFaced's footer.
  const defenceFailedWeeks = useMemo(() => buildDefenceFailedWeeks(defenceAllowed), [defenceAllowed])

  // Every player buildWeeklyLineup will actually render — starters (incl. surplus) + bench minus
  // taxi — not the whole roster. Usage/form for a player who reaches neither section would be
  // wasted work and, worse, would imply IR/taxi are being considered.
  const rendered = useMemo(() => renderedPlayers(myTeam), [myTeam])

  // Per-player usage (accumulated across played weeks) and form (last 3 played weeks' league-
  // scored fantasy points, oldest first, leading nulls when fewer than 3 played weeks exist).
  const { usageByPlayer, countsByPlayer, formByPlayer } = useMemo(() => {
    const usage = {}
    const counts = {}
    const form = {}
    for (const p of rendered) {
      const id = p?.id
      if (id == null) continue
      const totals = accumulateUsage(playedWeeklyMaps, id)
      const rz = accumulateRedZone(playedWeeklyMaps, id)
      usage[id] = { ...computeUsageShares(totals, p.position), ...computeRedZoneShares(rz, p.position) }
      counts[id] = computeUsageCounts(totals, rz, p.position)

      form[id] = buildLast3Form(playedWeeklyMaps, id, scoringSettings)
    }
    return { usageByPlayer: usage, countsByPlayer: counts, formByPlayer: form }
  }, [rendered, playedWeeklyMaps, scoringSettings])

  // §1a — the prior-season grey SNAP sub-line, over every rendered row. `dataSeason`, not
  // `season - 1` — must agree with the prior season §5.3's fpaTable blends, above.
  const priorSnapByPlayer = useMemo(
    () => buildPriorSnapByPlayer({ rendered, careerStats }),
    [rendered, careerStats]
  )

  // Season position/overall ranks by total league-scored points (weeklyRanks.js), over the same
  // rendered rows. Last season is derived inside from careerStats, matching the SNAP sub-line.
  const ranksByPlayer = useMemo(
    () => buildLineupRanks({ rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings }),
    [rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings]
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
      countsByPlayer,
      ranksByPlayer,
      formByPlayer,
      fpaTable,
      fpaRanks,
      playerMap,
    }),
    [myTeam, rosterPositions, currentWeek, scheduleIndex, projections, scoringSettings, usageByPlayer, countsByPlayer, ranksByPlayer, formByPlayer, fpaTable, fpaRanks, playerMap]
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
    weights, lineup, n, scheduleIndex, loading, error, failedWeeks, weeklyMaps, playedWeeklyMaps,
    projections, fpaTable, priorAllowed, currentAllowed, dataSeason, priorSeason, currentSeason,
    priorRecords, currentRecords, defenceFailedWeeks, priorSnapByPlayer,
    liveTeamContext, projectionGap,
  }
}
