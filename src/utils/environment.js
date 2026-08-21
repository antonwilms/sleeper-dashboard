// dp-v2 Slice 4c — Environment section pure helpers. First rendering consumer anywhere in src/ of
// the teamcontext `off.*`/`def.*` shape (CR-10) — no fixture exists for it, so every field name
// and expression below was verified directly against the served
// nflverse/teamcontext/2025.json (ARI, week 1: plays 61, passPlays 37, proePlays 61,
// proePassPlays 37, proeXpassSum 36.561, stored proe 0.007).
//
// PROE is a DIFFERENCE, not the ratio proeXpassSum ÷ proePlays alone (that's the *expected* pass
// rate, ~0.57). The denominator is proePlays, NOT proePassPlays — src/api/teamContext.js's own
// header comment pairs proeXpassSum with proePassPlays, which is wrong: 37/61 − 36.561/61 =
// +0.0072 matches the stored proe; 37/61 − 36.561/37 = −0.3816 does not.
//
// Every value sums components across REG weeks only, then divides — never sums a stored rate
// (CR-10's rule), and never includes POST (a Super Bowl team's ~20 rows would dilute plays/points
// -per-game against a non-playoff team's 17, biasing exactly the best teams' league rank — the
// same precedent utils/gameLog.js set for the game log).

const OFF_SUM_FIELDS = [
  'plays', 'passPlays', 'proeXpassSum', 'proePlays', 'neutralSeconds', 'neutralGaps',
  'successes', 'successPlays', 'rzTdTrips', 'rzTrips',
  'epaSum', 'epaPlays', 'passEpaSum', 'passEpaPlays', 'rushEpaSum', 'rushEpaPlays', 'pointsScored',
]

function sumRegOff(games) {
  const reg = (games ?? []).filter(g => g.seasonType === 'REG')
  const sums = Object.fromEntries(OFF_SUM_FIELDS.map(f => [f, 0]))
  for (const g of reg) {
    for (const f of OFF_SUM_FIELDS) sums[f] += g.off?.[f] ?? 0
  }
  return { sums, games: reg.length }
}

function sumRegDef(games) {
  const reg = (games ?? []).filter(g => g.seasonType === 'REG')
  let epaSum = 0, epaPlays = 0
  for (const g of reg) {
    epaSum += g.def?.epaSum ?? 0
    epaPlays += g.def?.epaPlays ?? 0
  }
  return { epaSum, epaPlays }
}

function ratio(num, den) {
  return den > 0 ? num / den : null
}

/**
 * One team's season-level Environment metrics, REG-only, components summed then divided.
 * @param {Array<object>} games  getTeamSeasonRows(loaded, team) output (REG+POST; filtered here)
 */
export function computeTeamSeasonMetrics(games) {
  const { sums, games: gameCount } = sumRegOff(games)
  const def = sumRegDef(games)

  return {
    proe: (sums.plays > 0 && sums.proePlays > 0)
      ? (sums.passPlays / sums.plays) - (sums.proeXpassSum / sums.proePlays)
      : null,
    pace: ratio(sums.neutralSeconds, sums.neutralGaps),
    successRate: ratio(sums.successes, sums.successPlays),
    rzTdRate: ratio(sums.rzTdTrips, sums.rzTrips),
    epaPerPlay: ratio(sums.epaSum, sums.epaPlays),
    passEpaPerPlay: ratio(sums.passEpaSum, sums.passEpaPlays),
    rushEpaPerPlay: ratio(sums.rushEpaSum, sums.rushEpaPlays),
    playsPerGame: gameCount > 0 ? sums.plays / gameCount : null,
    pointsPerGame: gameCount > 0 ? sums.pointsScored / gameCount : null,
    defEpaPerPlay: ratio(def.epaSum, def.epaPlays),
    games: gameCount,
  }
}

// The four series metrics (§4.1). Pace is lower-is-better — every other metric here is higher-is-
// better — so rank direction must branch on this set, never assume one direction for all four.
export const SERIES_METRICS = ['proe', 'pace', 'successRate', 'rzTdRate']
const LOWER_IS_BETTER = new Set(['pace'])

function median(sortedAscending) {
  const n = sortedAscending.length
  if (n === 0) return null
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2 : sortedAscending[mid]
}

/**
 * League-wide standing for one metric within one loaded teamContext season: every team's
 * REG-aggregated value (§4.2 — all 32 teams, the same loaded season as the value being ranked,
 * no extra fetch), the median, and `team`'s rank (1 = best; direction per LOWER_IS_BETTER).
 * @param {{teams:object}} loaded  loadTeamContext(year) result
 * @param {string} metricId  one of SERIES_METRICS
 * @param {string} team  era-accurate code to rank
 * @returns {{ median: number|null, rank: number|null, n: number }}
 */
export function computeLeagueStanding(loaded, metricId, team) {
  const teams = loaded?.teams ?? {}
  const entries = Object.entries(teams)
    .map(([abbr, t]) => [abbr, computeTeamSeasonMetrics(t.games)[metricId]])
    .filter(([, v]) => v != null)

  if (entries.length === 0) return { median: null, rank: null, n: 0 }

  const values = entries.map(([, v]) => v).sort((a, b) => a - b)
  const lowerBetter = LOWER_IS_BETTER.has(metricId)
  const rankedDesc = [...entries].sort((a, b) => (lowerBetter ? a[1] - b[1] : b[1] - a[1]))
  const idx = rankedDesc.findIndex(([abbr]) => abbr === team)

  return {
    median: median(values),
    rank: idx >= 0 ? idx + 1 : null,
    n: entries.length,
  }
}

export function ordinal(n) {
  const j = n % 10, k = n % 100
  if (k >= 11 && k <= 13) return `${n}th`
  if (j === 1) return `${n}st`
  if (j === 2) return `${n}nd`
  if (j === 3) return `${n}rd`
  return `${n}th`
}
