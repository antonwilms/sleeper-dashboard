// weekly-decision-2a-lineup-truth.md §3/§4 — assembles `/week`'s starters (as set in Sleeper) and
// bench rows. Takes already-resolved inputs; fetches nothing. Pure, no React, no I/O. The table is
// the lineup AS SET IN SLEEPER — nothing here ranks or selects players.

import { startingSlots } from './lineup'
import { calculateFantasyPoints } from './fantasyPoints'
import { normalizeTeamForSchedule } from './nflStats'
import { blendWeight } from './blendWeights'
import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'
import { resolveTeamWeek } from './weeklySchedule'

function emptyRow(slot) {
  return {
    slot, player_id: null, name: null, position: null, team: null, role: null,
    opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null,
    weight: null, usage: null, form: [null, null, null], points: null,
  }
}

// r = resolveTeamWeek(scheduleIndex, player.team, currentWeek). Schedule-authoritative whenever it
// can answer; projections.opponent is the fallback only when the schedule cannot (§4: this is a
// deliberate refinement of the brief so the VS column has one source per load).
function resolveOpponent({ scheduleIndex, team, currentWeek, projRow }) {
  const r = resolveTeamWeek(scheduleIndex, team, currentWeek)
  if (r.status === 'game') return { opponent: r.opponent, opponentEra: r.opponentEra, bye: false }
  if (r.status === 'bye') return { opponent: null, opponentEra: null, bye: true }
  // unknown
  const opponent = projRow?.opponent ?? null
  const opponentEra = opponent != null ? normalizeTeamForSchedule(opponent) : null
  return { opponent, opponentEra, bye: false }
}

// A projection row counts only if its stats carry at least one key the league scores
// (a key of scoringSettings with a finite, non-zero weight). Sleeper publishes rows whose stats
// hold only draft-ranking keys (e.g. adp_dd_ppr) — those are "no projection", not a projection of 0.
export function hasScoringProjection(stats, scoringSettings) {
  if (!stats || !scoringSettings) return false
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (!Number.isFinite(multiplier) || multiplier === 0) continue
    if (stats[key] != null) return true
  }
  return false
}

function buildRow({
  slot, enriched, currentWeek, scheduleIndex, projections, scoringSettings,
  usageByPlayer, formByPlayer, fpaTable, fpaRanks, playerMap,
}) {
  const id = enriched.id
  const projRow = projections?.[id]

  const { opponent, opponentEra, bye } = resolveOpponent({
    scheduleIndex, team: enriched.team, currentWeek, projRow,
  })

  const pmEntry = playerMap?.[id]
  const role = pmEntry?.depth_chart_position && pmEntry?.depth_chart_order != null
    ? `${pmEntry.depth_chart_position}${pmEntry.depth_chart_order}`
    : null

  let allows = null
  let allowsRank = null
  let weight = null
  if (opponentEra != null) {
    const posKey = enriched.position ? enriched.position.toLowerCase() : null
    allows = posKey ? fpaTable?.[opponentEra]?.[posKey] ?? null : null
    allowsRank = posKey ? fpaRanks?.[opponentEra]?.[posKey] ?? null : null
    const gCur = posKey ? fpaTable?.[opponentEra]?.weights?.[posKey] ?? 0 : 0
    weight = gCur >= FPA_PRIOR_DROP_GAMES ? 1 : blendWeight(gCur, PRIOR_WEIGHT_GAMES)
  }

  // The "no projection" branch must be explicit and cover two absent shapes: a missing row, and
  // an ADP-only row (Sleeper ships `{ adp_dd_ppr }` rows that carry no scoring stat).
  // calculateFantasyPoints({}, scoring) returns 0, not null (fantasyPoints.js starts total=0 and
  // skips absent keys), so hasScoringProjection is the gate, not stats' truthiness.
  const points = hasScoringProjection(projRow?.stats, scoringSettings)
    ? calculateFantasyPoints(projRow.stats, scoringSettings ?? {})
    : null

  const usage = usageByPlayer?.[id] ?? null
  const form = formByPlayer?.[id] ?? [null, null, null]

  return {
    slot, player_id: id, name: enriched.full_name, position: enriched.position, team: enriched.team,
    role, opponent, opponentEra, bye, allows, allowsRank, weight, usage, form, points,
  }
}

// Finite points desc, nulls last; ties by name asc, then id.
function compareBenchRows(a, b) {
  const aFinite = a.points !== null
  const bFinite = b.points !== null
  if (aFinite && bFinite && a.points !== b.points) return b.points - a.points
  if (aFinite !== bFinite) return aFinite ? -1 : 1
  const aName = a.name ?? ''
  const bName = b.name ?? ''
  if (aName !== bName) return aName < bName ? -1 : 1
  const aId = String(a.player_id)
  const bId = String(b.player_id)
  return aId < bId ? -1 : aId > bId ? 1 : 0
}

export function buildWeeklyLineup({
  myTeam,
  rosterPositions,
  currentWeek,
  scheduleIndex,
  projections,
  scoringSettings,
  usageByPlayer,
  formByPlayer,
  fpaTable,
  fpaRanks,
  playerMap,
}) {
  const slotList = startingSlots(rosterPositions)
  const starterSlots = myTeam?.starterSlots ?? []
  // App.jsx's `starters` array already carries the enrichPlayer stub for every filled slot id
  // (including ids with no playerMap entry) — id-keyed lookup here always finds a match for a
  // filled slot.
  const byId = new Map((myTeam?.starters ?? []).map(p => [p.id, p]))

  const rowArgs = { currentWeek, scheduleIndex, projections, scoringSettings, usageByPlayer, formByPlayer, fpaTable, fpaRanks, playerMap }

  const starters = slotList.map((slot, i) => {
    const id = starterSlots[i] ?? null
    if (id === null) return emptyRow(slot)
    const enriched = byId.get(id)
    return buildRow({ slot, enriched, ...rowArgs })
  })

  // Surplus: starterSlots longer than the slot list. Rostered, sit in no slot, excluded from
  // myTeam.bench (splitRosterIds in rosterSlots.js). Without this they would vanish from both sections.
  const surplusIds = starterSlots.slice(slotList.length).filter(id => id != null)
  const surplusRows = surplusIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(enriched => buildRow({ slot: 'BN', enriched, ...rowArgs }))

  // myTeam.bench no longer contains taxi at the source (App.jsx splitRosterIds,
  // lineup-pool-startable.md); this filter stays so /week never trusts bench's composition (D3).
  const taxiIds = new Set((myTeam?.taxi ?? []).map(p => p.id))
  const benchRows = (myTeam?.bench ?? [])
    .filter(p => !taxiIds.has(p.id))
    .map(enriched => buildRow({ slot: 'BN', enriched, ...rowArgs }))

  const bench = [...benchRows, ...surplusRows].sort(compareBenchRows)

  return { starters, bench }
}
