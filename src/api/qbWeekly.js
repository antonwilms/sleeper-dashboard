// P6b Stage B — loader for the live season's weekly stat rows behind the QB start chain (primary
// passer per team game, a QB's starts and points). Read only by App.jsx → buildQbLiveStates
// (src/utils/inSeasonScoring.js), the one seam. Reads Sleeper's weekly stats endpoint via
// `getWeeklyStatRows` (shares its `stat-rows/<s>/<w>` cache with /week and the defence loader).
// Copied from defenceWeekly.js, not imported: that module and opponentStrength.js are view-only and guarded.

import { getWeeklyStatRows } from './sleeperStats'

const regWeeks = season => (season >= 2021 ? 18 : 17)

// Live season only. regular → the COMPLETED weeks (week − 1, capped); post → the whole regular season;
// anything else (pre, off, dataSeason not behind the live season) → null.
// → null | { season, throughWeek, currentNflWeek }
export function qbWeeklyLoadPlan({ dataSeason, nflState } = {}) {
  if (dataSeason == null) return null
  const live = parseInt(nflState?.season, 10)
  if (!Number.isFinite(live) || !(live > dataSeason)) return null
  const type = nflState.season_type
  if (type === 'post') return { season: live, throughWeek: regWeeks(live), currentNflWeek: 0 }
  if (type === 'regular') {
    const tw = Math.min((nflState.week ?? 0) - 1, regWeeks(live))
    return tw >= 1 ? { season: live, throughWeek: tw, currentNflWeek: nflState.week } : null
  }
  return null
}

// Keeps what buildQbLiveStates reads: TEAM_<abbr> rows and the rows of playerMap QBs. Memory, not semantics.
export function filterQbInputRows(rows, playerMap) {
  const out = {}
  for (const [id, row] of Object.entries(rows ?? {})) {
    if (id.startsWith('TEAM_') || playerMap?.[id]?.position === 'QB') out[id] = row
  }
  return out
}

// Promise.allSettled over weeks 1..throughWeek; a rejected week is reported in `failedWeeks`, never thrown.
// Never rejects. buildQbLiveStates refuses any result with a failed week (a missing week breaks the team-game
// index and streaks), so `complete` here only means "at least one week loaded".
export async function loadQbWeeklyRows({ season, throughWeek, currentNflWeek, playerMap }) {
  const weekNumbers = []
  for (let w = 1; w <= throughWeek; w++) weekNumbers.push(w)
  const results = await Promise.allSettled(
    weekNumbers.map(w => getWeeklyStatRows(season, w, currentNflWeek))
  )
  const weeks = []
  const failedWeeks = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') weeks.push({ week: weekNumbers[i], rows: filterQbInputRows(r.value, playerMap) })
    else failedWeeks.push(weekNumbers[i])
  })
  return { year: season, weeks, failedWeeks, complete: weeks.length > 0 }
}
