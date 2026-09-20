// Portfolio Slice D — remaining strength of schedule, per (team, position). Pure, view-only.
// Reads the schedule's `gameType`, `homeTeam`, `awayTeam` and `homeScore` (CR-08): `homeScore` is
// the played/unplayed gate, relying on the loader's documented "null for unplayed" semantics.
// Ranking reuses opponentStrength.js's `rankFpaTable` verbatim — the row shape here matches
// `buildFpaTable`'s, and `opponents` is an inert sibling key exactly as `weights` is there.

import { normalizeTeamForSchedule } from './nflStats'
import { FPA_POSITIONS } from './opponentStrength'

/**
 * Average fantasy points allowed to each position by a team's REMAINING opponents.
 * @param {{games: Array<object>}|null} schedule  loadNflSchedule(year) result; gated on `complete`
 *        by the CALLER, which passes null when incomplete
 * @param {ReturnType<typeof import('./opponentStrength').buildFpaTable>} fpaTable  era-accurate keys
 * @returns {{[team:string]: {qb:number|null, rb:number|null, wr:number|null, te:number|null,
 *            opponents:number}}}
 */
export function buildSosTable(schedule, fpaTable) {
  const opponentsByTeam = {}
  const add = (team, opp) => { (opponentsByTeam[team] ??= []).push(opp) }

  for (const g of schedule?.games ?? []) {
    if (g.gameType !== 'REG') continue
    // Schedule domain → the era-accurate domain fpaTable is keyed in (CR-16).
    const home = normalizeTeamForSchedule(g.homeTeam)
    const away = normalizeTeamForSchedule(g.awayTeam)
    if (!home || !away) continue
    // Every team in the REG schedule gets a row, even with nothing left to play — `opponents: 0`
    // is "the season is over", an absent row is "there is no schedule". Collapsing the two loses
    // the distinction `opponents` exists for (§2.2).
    opponentsByTeam[home] ??= []
    opponentsByTeam[away] ??= []
    // Unplayed only. `homeScore != null`, never truthiness and never `result`: a 0-0 score and a
    // tie (`result === 0`) are both PLAYED games.
    if (g.homeScore != null) continue
    add(home, away)
    add(away, home)
  }

  const table = {}
  for (const [team, opps] of Object.entries(opponentsByTeam)) {
    const row = { opponents: opps.length }
    for (const pos of FPA_POSITIONS) {
      // An opponent with no value for this position is dropped from numerator AND denominator.
      const vals = opps.map(o => fpaTable?.[o]?.[pos]).filter(v => v != null && Number.isFinite(v))
      row[pos] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }
    table[team] = row
  }
  return table
}
