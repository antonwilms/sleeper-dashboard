// W2b-1 — league-starter percentile basis for the /week season grid. View-only: nothing here
// reaches projection, scoring or a dynasty value. The pool depends on `filterDefenceInputRows`
// (src/api/defenceWeekly.js) keeping QB/RB/WR/TE rows — narrowing that filter empties a position,
// which renders "no basis", never a wrong colour.

import { calculateFantasyPoints } from './fantasyPoints'
import { isFilledSlotId } from './rosterSlots'
import { defenceLoadPlan } from './opponentStrength'
import { deriveDataSeason } from './environment'

export const MIN_POOL_SAMPLES = 60
export const LEGEND_POSITIONS = ['QB', 'RB', 'WR', 'TE'] // display order and the needsPrior check set

// matchups: Sleeper matchup entries for ONE week (all rosters). -> string[] of filled starter ids
// ('0' / null / '' dropped via isFilledSlotId). Ignores matchup_id entirely (D1).
export function startersFromMatchups(matchups) {
  const ids = []
  for (const m of matchups ?? []) {
    for (const id of m?.starters ?? []) {
      if (isFilledSlotId(id)) ids.push(id)
    }
  }
  return ids
}

// starterWeeks: [{ week, ids }]; weeklyResult: a loadDefenceWeeklyRows result; throughWeek: last
// completed week. -> { [position]: number[] } each sorted ascending.
export function buildStarterPool({ starterWeeks, weeklyResult, playerMap, scoringSettings, throughWeek }) {
  if (!weeklyResult?.complete) return {}
  const rowsByWeek = new Map((weeklyResult.weeks ?? []).map(w => [w.week, w.rows]))
  const pool = {}
  for (const { week, ids } of starterWeeks ?? []) {
    if (week > throughWeek) continue
    const rows = rowsByWeek.get(week)
    if (!rows) continue
    for (const id of ids ?? []) {
      const row = rows[id]
      if (row?.stats?.gp !== 1) continue
      const position = playerMap?.[id]?.position
      if (!position) continue
      ;(pool[position] ??= []).push(calculateFantasyPoints(row.stats, scoringSettings ?? {}))
    }
  }
  for (const pos of Object.keys(pool)) pool[pos].sort((a, b) => a - b)
  return pool
}

export function isLivePoolResolved({ leagueData, careerStats, nflState, defenceWeeklyByYear }) {
  if (!leagueData || !careerStats || !nflState) return false
  const live = parseInt(nflState.season, 10)
  const plan = defenceLoadPlan({ dataSeason: deriveDataSeason(careerStats), nflState })
  if (!plan.some(p => p.season === live)) return true
  return defenceWeeklyByYear?.[live] != null
}

export function isPriorRowsPending({ priorStarterWeeks, careerStats, nflState, defenceWeeklyByYear }) {
  if (priorStarterWeeks?.status !== 'loaded') return false
  const season = priorStarterWeeks.season
  if (!Number.isFinite(season) || !careerStats || !nflState) return false
  const plan = defenceLoadPlan({ dataSeason: deriveDataSeason(careerStats), nflState })
  if (!plan.some(p => p.season === season)) return false
  return defenceWeeklyByYear?.[season] == null
}

export function resolvePercentileBasis({
  live, prior, liveSeason, priorSeason, liveResolved, priorStatus, priorRowsPending = false,
  minSamples = MIN_POOL_SAMPLES,
}) {
  if (!liveResolved) return { status: 'pending', basis: {}, needsPrior: false, liveSeason, priorSeason }
  const basis = {}
  let needsPrior = false
  for (const pos of LEGEND_POSITIONS) {
    const liveValues = live?.[pos] ?? []
    if (liveValues.length >= minSamples) {
      basis[pos] = { values: liveValues, n: liveValues.length, season: liveSeason, source: 'live' }
      continue
    }
    needsPrior = true
    const priorValues = prior?.[pos] ?? []
    basis[pos] = priorValues.length >= minSamples
      ? { values: priorValues, n: priorValues.length, season: priorSeason, source: 'prior' }
      : null
  }
  const pending = needsPrior && (priorStatus === 'idle' || priorStatus === 'loading' || priorRowsPending)
  return { status: pending ? 'pending' : 'ready', basis, needsPrior, liveSeason, priorSeason }
}

// D8 mid-rank percentile of v within an ascending-sorted array.
export function percentileOf(sortedValues, v) {
  if (!sortedValues?.length || v == null || Number.isNaN(v)) return null
  let below = 0
  let equal = 0
  for (const x of sortedValues) {
    if (x < v) below += 1
    else if (x === v) equal += 1
  }
  return Math.min(1, Math.max(0, (below + 0.5 * equal) / sortedValues.length))
}

// D8 type-7 quantile.
export function quantile(sortedValues, q) {
  const n = sortedValues?.length ?? 0
  if (n === 0) return null
  const h = (n - 1) * q
  const lo = Math.floor(h)
  const hi = Math.min(n - 1, lo + 1)
  return sortedValues[lo] + (h - lo) * (sortedValues[hi] - sortedValues[lo])
}

export function percentileCutoffs(sortedValues) {
  return [0.2, 0.4, 0.6, 0.8].map(q => quantile(sortedValues, q))
}

// W2b-3 — the view a grid/strip renders from a resolvePercentileBasis result (or null).
export function basisView(percentileBasis) {
  const pending = percentileBasis == null || percentileBasis.status === 'pending'
  return { pending, basis: pending ? {} : (percentileBasis.basis ?? {}) }
}
