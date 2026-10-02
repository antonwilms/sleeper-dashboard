// weekly-decision-2a-lineup-truth.md §4/§5 — byes and per-team W-L-T records, from the
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

// W-L-T from the schedule file's scores, REG games only, both team codes through
// normalizeTeamForSchedule (CR-16). `schedule` is a `complete`-gated loader result or null, as for
// buildRegWeekIndex. A game with both scores counts toward W/L/T (equal = tie) and `lastWeek`; a
// game with a null score and `week <= throughWeek` counts toward `unscored` — the file has not
// caught up with a week Sleeper reports complete. A bye adds nothing, so a team on bye in the
// latest week is not marked as trailing. A team enters the map once it has any scored or `unscored`
// game; callers render `—` when `w + l + t === 0`, never `0-0`.
// -> { [eraTeam]: { w, l, t, lastWeek, unscored } } | {}
export function buildTeamRecords(schedule, { throughWeek = Infinity } = {}) {
  if (!schedule) return {}
  const records = {}
  const rec = (team) => (records[team] ??= { w: 0, l: 0, t: 0, lastWeek: 0, unscored: 0 })
  for (const g of schedule.games ?? []) {
    if (g.gameType !== 'REG') continue
    const home = normalizeTeamForSchedule(g.homeTeam)
    const away = normalizeTeamForSchedule(g.awayTeam)
    if (!home || !away) continue
    if (g.homeScore != null && g.awayScore != null) {
      const h = rec(home)
      const a = rec(away)
      if (g.homeScore > g.awayScore) { h.w++; a.l++ }
      else if (g.homeScore < g.awayScore) { h.l++; a.w++ }
      else { h.t++; a.t++ }
      h.lastWeek = Math.max(h.lastWeek, g.week)
      a.lastWeek = Math.max(a.lastWeek, g.week)
    } else if (g.week <= throughWeek) {
      rec(home).unscored++
      rec(away).unscored++
    }
  }
  return records
}
