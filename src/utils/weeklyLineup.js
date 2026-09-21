// weekly-decision-1-lineup.md §4 — assembles the ten lineup rows for `/week`. Takes already
// resolved inputs; fetches nothing. Pure, no React, no I/O.

import { buildBestLineup } from './lineup'
import { calculateFantasyPoints } from './fantasyPoints'
import { normalizeTeamForSchedule } from './nflStats'
import { blendWeight } from './blendWeights'
import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

export function buildWeeklyLineup({
  myPlayers,
  rosterPositions,
  projections,
  scoringSettings,
  usageByPlayer,
  formByPlayer,
  fpaTable,
  fpaRanks,
  playerMap,
}) {
  // leagueData.rosterTeams' enriched players key on `id` (App.jsx:813's enrichPlayer), while
  // buildBestLineup reads `p.player_id` (lineup.js:49-55). Passing the roster shape through
  // unmapped does not error — player_id is undefined for every entry, the pool's `seen` Set
  // dedupes on undefined, and the whole roster collapses to a single player. buildLeagueLineups
  // (lineup.js:174) remaps for exactly this reason; do the same here.
  const pool = (myPlayers ?? [])
    .filter(p => p != null)
    .map(p => ({
      player_id: p.player_id ?? p.id,
      position: p.position,
      full_name: p.full_name,
      team: p.team,
    }))

  // The missing-row branch must be explicit: calculateFantasyPoints({}, scoring) returns 0, not
  // null (fantasyPoints.js:12-21 starts total=0 and skips absent keys). 0 is finite, so
  // buildBestLineup would sort an unprojected player ABOVE every genuine null and could start him
  // over a real option. Returning null explicitly here is the only thing that makes the "nulls
  // last" ordering in buildBestLineup mean what it says.
  const getPoints = p => {
    const row = projections?.[p.player_id]
    if (!row?.stats) return null // no projection published — absent, not zero
    return calculateFantasyPoints(row.stats, scoringSettings ?? {})
  }

  const { slots } = buildBestLineup(pool, rosterPositions, getPoints)

  // buildBestLineup (lineup.js:49-55) only carries player_id/name/position/points onto each slot —
  // it does not pass `team` through. Re-attach it here from the pool for the team chip (§6).
  const teamByPlayerId = new Map(pool.map(p => [p.player_id, p.team]))

  const decoratedSlots = slots.map(slot => {
    if (slot.player_id === null) {
      return { ...slot, team: null, role: null, opponent: null, bye: false, allows: null, allowsRank: null, weight: null, usage: null, form: [null, null, null] }
    }

    const team = teamByPlayerId.get(slot.player_id) ?? null
    // `role` — playerMap[id].depth_chart_position + depth_chart_order, matching Portfolio.jsx:
    // 334-336's treatment of the same fields for the same players. No invented ranking beyond that.
    const pmEntry = playerMap?.[slot.player_id]
    const role = pmEntry?.depth_chart_position && pmEntry?.depth_chart_order != null
      ? `${pmEntry.depth_chart_position}${pmEntry.depth_chart_order}`
      : null
    const projRow = projections?.[slot.player_id]
    // Opponent comes from the projections payload. Absent -> that player's team is on bye this
    // week: render the opponent cell as a bye, not as `—`, and keep the row in its slot.
    const opponent = projRow?.opponent ?? null
    const bye = opponent == null

    let allows = null
    let allowsRank = null
    let weight = null
    if (!bye) {
      // fpaTable is keyed ERA-ACCURATE; `opponent` from the projections payload is the SLEEPER
      // domain. These differ for LAR/LAC/LV — apply normalizeTeamForSchedule at this one join
      // rather than hand-rolling a remap or skipping it because most codes happen to agree.
      const oppEra = normalizeTeamForSchedule(opponent)
      const posKey = slot.position ? slot.position.toLowerCase() : null
      allows = posKey ? fpaTable?.[oppEra]?.[posKey] ?? null : null
      allowsRank = posKey ? fpaRanks?.[oppEra]?.[posKey] ?? null : null
      const gCur = posKey ? fpaTable?.[oppEra]?.weights?.[posKey] ?? 0 : 0
      weight = gCur >= FPA_PRIOR_DROP_GAMES ? 1 : blendWeight(gCur, PRIOR_WEIGHT_GAMES)
    }

    const usage = usageByPlayer?.[slot.player_id] ?? null
    // Form: fewer than three played weeks -> leading nulls, never padded with 0.
    const form = formByPlayer?.[slot.player_id] ?? [null, null, null]

    return { ...slot, team, role, opponent, bye, allows, allowsRank, weight, usage, form }
  })

  return { slots: decoratedSlots }
}
