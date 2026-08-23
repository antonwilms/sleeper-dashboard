import { normalizeTeamForSchedule } from './nflStats'

// Extracted out of teams/Teams.jsx (dp-v2 Slice 6a) in Slice 6b — team detail's holdings block
// needs the exact same per-team exposure computation the index already builds for all 32 teams
// at once, and the pre-extraction functions were module-local/unexported there. Behaviour-
// preserving move: 6a's own tests (teams/Teams.test.jsx) pass unedited against this module.
//
// YOUR EXPOSURE — scoped to rows owned by myTeamName, grouped by
// normalizeTeamForSchedule(nfl_team). `nfl_team` is playerMap[id].team, the SLEEPER domain (LAR),
// while teamContext keys the era-accurate domain (LA) — ungated, every Rams player lands in an
// unmatched bucket and the LA row silently reads "none" (CR-16's domain boundary). `nfl_team` is
// the literal string 'FA' for a free agent, not null — a real asset that belongs in the value
// DENOMINATOR but has no team bucket, so shares sum to <= 100% and are never rescaled to 100%
// (doing so would silently redistribute value the user holds in unrostered players).
export function buildExposure(playerRows, myTeamName) {
  if (myTeamName == null) return null
  const myRows = (playerRows ?? []).filter(r => r.ownerTeamName === myTeamName)
  let denom = 0
  const byTeam = new Map()
  for (const r of myRows) {
    if (r.ktcValue != null) denom += r.ktcValue
    const bucket = normalizeTeamForSchedule(r.nfl_team)
    if (!bucket || bucket === 'FA') continue
    const cur = byTeam.get(bucket) ?? { count: 0, value: 0, hasValue: false }
    cur.count += 1
    // hasValue tracks whether ANY owned player on this team has a known ktcValue — a bucket whose
    // players are all null-valued must render "—", not a computed "0.0%" (which would falsely
    // claim a measured zero share rather than an unknown one).
    if (r.ktcValue != null) { cur.value += r.ktcValue; cur.hasValue = true }
    byTeam.set(bucket, cur)
  }
  return { byTeam, denom }
}

export function exposureForTeam(exposureData, team) {
  if (exposureData == null) return null
  const bucket = exposureData.byTeam.get(team)
  const count = bucket?.count ?? 0
  const share = (bucket?.hasValue && exposureData.denom > 0) ? bucket.value / exposureData.denom : null
  return { count, share }
}
