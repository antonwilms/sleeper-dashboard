import { normalizeTeamForSchedule } from './nflStats'
import { computeYardsPerGame } from './opponentStrength'
import { rankMetricsTable } from './environment'

// week-w2a-lineup-matchup-layout.md §1 — the /week lineup's matchup columns: facts or one-step
// differences, view-only, nothing here feeds a projection. Only the implied total has backtest
// support (weeklyOwnProjection.js header: Vegas ×0.5 improved RMSE; scaling by points allowed made it
// worse); spread, yards allowed, pace and PROE are context. Never imports weeklyOwnProjection.js — the
// hook passes `vegasFor` (single-importer rule, weeklyDecisionViewOnly.test.js).
// Keys: the opponent's yards are read by `opponentEra` and team metrics by the era-accurate code
// (CR-16) — never the Sleeper code (`LA` not `LAR`).

export const YARDS_KIND = { QB: 'pass', WR: 'pass', TE: 'pass', RB: 'rush' }

const EMPTY = () => ({
  implied: null, impliedBaseline: null, impliedBaselineWeeks: 0, spread: null, yards: null, pace: null, proe: null,
})

function countRanked(teamMetrics, metric) {
  let n = 0
  for (const m of Object.values(teamMetrics ?? {})) if (m?.[metric] != null) n += 1
  return n
}

/**
 * @param {object} p
 * @param {object[]} p.rows  lineup rows (filled starters + bench)
 * @param {(sleeperTeam:string) => object|null} p.vegasFor  vegasFactor result or null (Sleeper domain)
 * @param {object|null} p.currentAllowed  era-keyed defence map, live season
 * @param {object|null} p.priorAllowed  era-keyed defence map, prior season
 * @param {number|null} p.priorSeason  the season priorAllowed describes
 * @param {object|null} p.teamMetrics  buildTeamMetricsTable(...) (era-keyed) or null
 * @returns {{ [player_id:string]: object }}
 */
export function buildMatchupColumns({ rows, vegasFor, currentAllowed, priorAllowed, priorSeason, teamMetrics }) {
  const out = {}
  const ranks = teamMetrics ? rankMetricsTable(teamMetrics, ['pace', 'proe']) : null
  const of = { pace: countRanked(teamMetrics, 'pace'), proe: countRanked(teamMetrics, 'proe') }
  for (const row of rows ?? []) {
    if (row?.player_id == null) continue
    const cols = EMPTY()
    out[row.player_id] = cols
    const team = row.team
    if (typeof team !== 'string' || team === '' || team === 'FA') continue

    if (!row.bye && row.opponent != null) {
      const own = vegasFor(team)
      const opp = vegasFor(row.opponent)
      cols.implied = own?.implied ?? null
      cols.impliedBaseline = own?.baseline ?? null
      cols.impliedBaselineWeeks = own?.baselineWeeks ?? 0
      cols.spread = cols.implied != null && opp?.implied != null ? opp.implied - cols.implied : null
      const kind = YARDS_KIND[row.position]
      if (kind && row.opponentEra != null) {
        const current = computeYardsPerGame(currentAllowed, row.opponentEra)?.[kind] ?? null
        const prior = computeYardsPerGame(priorAllowed, row.opponentEra)?.[kind] ?? null
        if (current != null || prior != null) cols.yards = { kind, current, prior, priorSeason }
      }
    }

    const era = normalizeTeamForSchedule(team)
    const m = teamMetrics?.[era]
    if (m?.pace != null) cols.pace = { value: m.pace, rank: ranks?.pace?.[era] ?? null, of: of.pace }
    if (m?.proe != null) cols.proe = { value: m.proe, rank: ranks?.proe?.[era] ?? null, of: of.proe }
  }
  return out
}
