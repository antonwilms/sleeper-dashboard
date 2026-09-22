// weekly-decision-2-panels.md §3 — the season, week by week. Pure, no React, no I/O. Byes come
// from `weeklySchedule.js`'s `resolveTeamWeek` — the SAME function W2a's lineup rows use — so the
// grid and the lineup table can never disagree about whether a player's team plays a given week.
//
// Section membership (starters/bench/IR/taxi-excluded) is the CALLER's job — `groups` arrives
// already assembled from W2a's lineup rows plus `myTeam.reserve`. This module resolves cells only.

import { calculateFantasyPoints } from './fantasyPoints'
import { resolveTeamWeek } from './weeklySchedule'
import { hasScoringProjection } from './weeklyLineup'

// REG season length — same constant gameLog.js's per-week loop uses (`weeklyStatus[week-1]`,
// weeks 1-18).
const SEASON_WEEKS = 18

// The team a player played for in week `w`, used only for the bye/DNP distinction — never for a
// points value (a week with no row has no points either).
//
// For `week >= currentWeek` this is always the roster team (W2a's own current-week source, so the
// grid and the table agree). Otherwise: that week's own row's `team` if non-null; else the nearest
// PRECEDING fetched week with a non-null row team; else the nearest FOLLOWING one; else the roster
// team. Resolving from the week's own row before the roster team matters for a traded player — a
// static roster-team fallback would put his new team's byes across weeks he played for his old one.
function resolveTeamForWeek({ player, week, currentWeek, weeksByNumber }) {
  if (week >= currentWeek) return player.team ?? null

  const ownTeam = weeksByNumber.get(week)?.rows?.[player.id]?.team
  if (ownTeam != null) return ownTeam

  for (let k = week - 1; k >= 1; k--) {
    const t = weeksByNumber.get(k)?.rows?.[player.id]?.team
    if (t != null) return t
  }

  const maxFetchedWeek = Math.max(0, ...weeksByNumber.keys())
  for (let k = week + 1; k <= maxFetchedWeek; k++) {
    const t = weeksByNumber.get(k)?.rows?.[player.id]?.team
    if (t != null) return t
  }

  return player.team ?? null
}

// One cell, in the six-kind precedence order the task file specifies: played, bye, projected,
// dnp, future, unknown. `unknown` is its own kind — never rendered as `—` (asserts "played, didn't
// score") or dashed (asserts a bye that may never have happened).
function resolveCell({ player, week, currentWeek, weeksByNumber, failedWeekSet, scheduleIndex, projections, scoringSettings }) {
  const isPast = week < currentWeek
  const isCurrent = week === currentWeek

  const ownRow = weeksByNumber.get(week)?.rows?.[player.id] ?? null
  if (isPast && ownRow?.stats?.gp === 1) {
    return { week, kind: 'played', points: calculateFantasyPoints(ownRow.stats, scoringSettings ?? {}) }
  }

  const team = resolveTeamForWeek({ player, week, currentWeek, weeksByNumber })
  const teamWeek = resolveTeamWeek(scheduleIndex, team, week)

  if (teamWeek.status === 'bye') {
    return { week, kind: 'bye', points: null }
  }

  if (isCurrent) {
    const projRow = projections?.[player.id]
    const points = hasScoringProjection(projRow?.stats, scoringSettings)
      ? calculateFantasyPoints(projRow.stats, scoringSettings ?? {})
      : null
    return { week, kind: 'projected', points }
  }

  if (isPast) {
    // Checked before the dnp branch: a failed fetch has no rows at all, so without this a failed
    // week would read `dnp` and assert "he did not play" about a week we simply never fetched.
    // PROVISIONAL(no-data): the `unknown` cell kind · this week's stats fetch failed, so nothing
    // can be said about it · a successful fetch for that week would resolve it to one of the other
    // five kinds
    if (failedWeekSet.has(week)) return { week, kind: 'unknown', points: null }
    if (teamWeek.status === 'game') return { week, kind: 'dnp', points: null }
    // PROVISIONAL(no-data): the `unknown` cell kind · the schedule can't answer whether this team
    // played this week (incomplete schedule or an unresolved team) · a complete schedule would
    // resolve it to one of the other five kinds
    return { week, kind: 'unknown', points: null }
  }

  // future, not a bye
  return { week, kind: 'future', points: null }
}

/**
 * @param {{ groups: Array<{key: string, players: Array<{id: string, name: string, team: string|null}>}>,
 *   weeklyMaps: Array<{week: number, rows: object}>, failedWeeks: number[],
 *   scheduleIndex: ReturnType<typeof import('./weeklySchedule').buildRegWeekIndex>,
 *   projections: object, scoringSettings: object, currentWeek: number }} args
 * @returns {Array<{key: string, rows: Array<{id: string, name: string, cells: Array<{week: number, kind: string, points: number|null}>}>}>}
 */
export function buildSeasonGrid({ groups, weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek }) {
  const weeksByNumber = new Map((weeklyMaps ?? []).map(m => [m.week, m]))
  const failedWeekSet = new Set(failedWeeks ?? [])

  return (groups ?? []).map(group => ({
    key: group.key,
    rows: (group.players ?? []).map(player => ({
      id: player.id,
      name: player.name,
      cells: Array.from({ length: SEASON_WEEKS }, (_, i) => {
        const week = i + 1
        return resolveCell({ player, week, currentWeek, weeksByNumber, failedWeekSet, scheduleIndex, projections, scoringSettings })
      }),
    })),
  }))
}
