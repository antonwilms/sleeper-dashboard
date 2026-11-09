// Pop-up → team page link targets. View-only. A Sleeper team code links only when it maps to a
// CURRENT franchise in the schedule domain (the /teams/:abbr route param domain); null, 'FA' and
// stale codes (OAK) never link.
import { NFL_TEAMS } from './marketFilters'
import { normalizeTeamForSchedule } from './nflStats'

export const CURRENT_TEAM_CODES = new Set(NFL_TEAMS.map(normalizeTeamForSchedule))

export function teamPageCode(sleeperTeam) {
  const code = normalizeTeamForSchedule(sleeperTeam)
  return code != null && CURRENT_TEAM_CODES.has(code) ? code : null
}

export function teamDepthChartPath(sleeperTeam) {
  const code = teamPageCode(sleeperTeam)
  return code ? `/teams/${code}?view=depth` : null
}
