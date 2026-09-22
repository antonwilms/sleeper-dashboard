// weekly-decision-2a-lineup-truth.md §4/§5 — byes and per-team scheduled-game counts, from the
// live NFL schedule. Pure, view-only, no React, no I/O. One util, two callers: this slice's lineup
// rows, and W2 §3's season grid.

import { normalizeTeamForSchedule, denormalizeTeamForSchedule } from './nflStats'

// schedule: a loadNflSchedule result the CALLER has already gated on `complete` — pass null
// otherwise. REG games only. Both team codes go through normalizeTeamForSchedule (CR-16), the
// same way strengthOfSchedule.js's buildSosTable treats schedule codes.
// -> Map<week:number, Map<eraTeam:string, { opponentEra:string, scored:boolean }>> | null
export function buildRegWeekIndex(schedule) {
  if (!schedule) return null
  const index = new Map()
  for (const g of schedule.games ?? []) {
    if (g.gameType !== 'REG') continue
    const home = normalizeTeamForSchedule(g.homeTeam)
    const away = normalizeTeamForSchedule(g.awayTeam)
    if (!home || !away) continue
    // homeScore != null — the played/unplayed gate strengthOfSchedule.js:35 already uses.
    const scored = g.homeScore != null
    if (!index.has(g.week)) index.set(g.week, new Map())
    const wk = index.get(g.week)
    wk.set(home, { opponentEra: away, scored })
    wk.set(away, { opponentEra: home, scored })
  }
  return index
}

// team: SLEEPER domain (a roster's playerMap team, or a weekly stat row's `team`). resolveTeamWeek
// itself runs it through normalizeTeamForSchedule BEFORE the index lookup — normalising only the
// schedule's codes (a no-op on a file already keyed `LA`) would leave every Rams player on 'bye'.
// -> { status: 'game', opponentEra, opponent } | { status: 'bye' } | { status: 'unknown' }
export function resolveTeamWeek(index, team, week) {
  if (!index) return { status: 'unknown' }
  if (!team || team === 'FA') return { status: 'unknown' }
  const wk = index.get(week)
  // No REG games at all for `week` — guards week 0, week 19+ and a malformed file. Without this,
  // every team would read "bye".
  if (!wk || wk.size === 0) return { status: 'unknown' }

  const eraTeam = normalizeTeamForSchedule(team)
  const entry = wk.get(eraTeam)
  if (!entry) return { status: 'bye' }
  return { status: 'game', opponentEra: entry.opponentEra, opponent: denormalizeTeamForSchedule(entry.opponentEra) }
}

// Counts `eraTeam`'s REG games in weeks 1..week that are either scored, or in week `latestWeek`
// itself (an unscored game in the actual latest completed week still counts — the schedule's own
// cron can lag; an unscored game in any other week, including a `week` below `latestWeek` that a
// caller is probing, was cancelled/postponed and is not counted).
export function scheduledGamesThrough(index, eraTeam, week, latestWeek) {
  if (!index) return 0
  let count = 0
  for (let w = 1; w <= week; w++) {
    const wk = index.get(w)
    const entry = wk?.get(eraTeam)
    if (!entry) continue
    if (entry.scored || w === latestWeek) count++
  }
  return count
}
