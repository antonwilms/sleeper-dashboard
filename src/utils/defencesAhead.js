// myteam-m2b-defences-ahead.md §4.1 — the rows behind My Team's "Defences ahead" card: per starting-ten
// player, this week's opponent with every number This week's old "Defences you face" panel showed,
// plus the rest of the regular season's opponents and the points each allows to the row's position
// group. Pure, no React, no I/O; view-only (no projection/scoring module may import it —
// weeklyDecisionViewOnly.test.js).
//
// Era-domain join (CR-16): `opponentEra` (`LA`) keys fpaTable/fpaRanks, the two allowed halves and the
// record maps — the domain buildDefenceSeasonAllowed/buildTeamRecords key on. `opponent` (Sleeper
// domain, `LAR`) is display only.

import { resolveTeamWeek } from './weeklySchedule'
import { allowsForOpponent } from './weeklyLineup'
import { computeFpaPerGame, computeYardsPerGame } from './opponentStrength'

// Halves of the defence load that dropped weeks — surfaced in DefencesAhead's footer.
export function buildDefenceFailedWeeks(defenceAllowed) {
  return [defenceAllowed?.prior, defenceAllowed?.current]
    .filter(h => h?.failedWeeks?.length > 0)
    .map(h => ({ season: h.season, weeks: h.failedWeeks }))
}

// -> { weeks: number[], rows: Row[] }
// weeks = [currentWeek + 1 .. lastWeek] (empty when currentWeek >= lastWeek).
export function buildDefencesAhead({
  slots, teamOf, scheduleIndex, currentWeek, lastWeek, fpaTable, fpaRanks,
  priorAllowed, currentAllowed, priorRecords = {}, currentRecords = {},
}) {
  const weeks = []
  for (let w = currentWeek + 1; w <= lastWeek; w++) weeks.push(w)

  const rows = (slots ?? [])
    .filter(s => s.player_id != null)
    .map(s => {
      const team = teamOf(s.player_id)
      const pos = s.position ? s.position.toLowerCase() : null
      const r = resolveTeamWeek(scheduleIndex, team, currentWeek)
      const bye = r.status === 'bye'
      const opponent = r.status === 'game' ? r.opponent : null
      const opponentEra = r.status === 'game' ? r.opponentEra : null
      const { allows, allowsRank, weight } = allowsForOpponent({
        fpaTable, fpaRanks, opponentEra, position: s.position,
      })

      const empty = bye || opponent == null
      const era = opponentEra
      const prior = !empty && pos ? computeFpaPerGame(priorAllowed, era, pos) : null
      const current = !empty && pos ? computeFpaPerGame(currentAllowed, era, pos) : null
      const yardsPrior = empty ? null : computeYardsPerGame(priorAllowed, era)
      const yardsCurrent = empty ? null : computeYardsPerGame(currentAllowed, era)
      const recPrior = empty ? null : (priorRecords?.[era] ?? null)
      const recCurrent = empty ? null : (currentRecords?.[era] ?? null)
      // The blend drops the prior once gCur reaches FPA_PRIOR_DROP_GAMES — the ONLY case where
      // allowsForOpponent sets `weight` to exactly 1 (blendWeight's n/(n+k) formula
      // never reaches 1 for a finite n below the drop threshold, so this reuses the row's own
      // weight rather than re-deriving gCur here).
      const notBlended = weight === 1

      const ahead = weeks.map(week => {
        const w = resolveTeamWeek(scheduleIndex, team, week)
        if (w.status === 'game') {
          return {
            week, status: 'game', opponent: w.opponent, opponentEra: w.opponentEra,
            allows: pos ? fpaTable?.[w.opponentEra]?.[pos] ?? null : null,
            allowsRank: pos ? fpaRanks?.[w.opponentEra]?.[pos] ?? null : null,
          }
        }
        return { week, status: w.status, opponent: null, opponentEra: null, allows: null, allowsRank: null }
      })

      return {
        slot: s.slot, player_id: s.player_id, name: s.name, position: s.position, team,
        opponent, opponentEra, bye, allows, allowsRank, weight, notBlended,
        prior, current, yardsPrior, yardsCurrent, recPrior, recCurrent, ahead,
      }
    })

  return { weeks, rows }
}
