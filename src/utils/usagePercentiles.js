// week-lineup-readability-c.md §2 — the league-starter usage pool that colours /week's usage shares.
// Members at a position: ids this league started in a week they played (same rule as
// starterPercentiles.js's buildStarterPool). One value per member: his season-to-date share over ALL
// his played weeks (summed, then divided — buildSeasonUsage, the row's own path); live season only.
// View-only: nothing here reaches projection, scoring or a dynasty value.

import { buildSeasonUsage } from './weeklyUsage'
import { percentileOf, LEGEND_POSITIONS } from './starterPercentiles'

export const USAGE_POOL_MIN_PLAYERS = 15
export const USAGE_POOL_MIN_WEEKS = 3
export const USAGE_SHARE_KINDS = ['snap', 'rush', 'target', 'touch', 'rzRush', 'rzTarget', 'td']

// → { [position]: string[] } member ids (sorted, deduped), positions in LEGEND_POSITIONS only.
// Restates buildStarterPool's membership rule (equality pinned by usagePercentiles.test.js P8).
export function leagueStarterIds({ starterWeeks, playedWeeklyMaps, playerMap } = {}) {
  const rowsByWeek = new Map((playedWeeklyMaps ?? []).map(wk => [wk.week, wk.rows]))
  const sets = {}
  for (const { week, ids } of starterWeeks ?? []) {
    const rows = rowsByWeek.get(week) // absent for the in-progress or a failed week
    if (!rows) continue
    for (const id of ids ?? []) {
      if (rows[id]?.stats?.gp !== 1) continue
      const position = playerMap?.[id]?.position
      if (!LEGEND_POSITIONS.includes(position)) continue
      ;(sets[position] ??= new Set()).add(id)
    }
  }
  const out = {}
  for (const [position, set] of Object.entries(sets)) out[position] = [...set].sort()
  return out
}

// → { [position]: { [kind]: number[] ascending } } — qualifying members' (playedWeeks >= MIN_WEEKS) non-null values.
export function buildUsagePool({ starterWeeks, playedWeeklyMaps, playerMap } = {}) {
  const members = leagueStarterIds({ starterWeeks, playedWeeklyMaps, playerMap })
  const pool = {}
  for (const [position, ids] of Object.entries(members)) {
    const byKind = Object.fromEntries(USAGE_SHARE_KINDS.map(k => [k, []]))
    for (const id of ids) {
      const { usage, playedWeeks } = buildSeasonUsage(playedWeeklyMaps, id, position)
      if (playedWeeks < USAGE_POOL_MIN_WEEKS) continue
      for (const kind of USAGE_SHARE_KINDS) {
        if (Number.isFinite(usage[kind])) byKind[kind].push(usage[kind])
      }
    }
    for (const kind of USAGE_SHARE_KINDS) byKind[kind].sort((a, b) => a - b)
    pool[position] = byKind
  }
  return pool
}

// → { [kind]: number in [0,1] | null } for one row. null when: the share is null/non-finite, playedWeeks <
// USAGE_POOL_MIN_WEEKS, or pool[position]?.[kind] has fewer than USAGE_POOL_MIN_PLAYERS values; else
// percentileOf(pool[position][kind], share).
export function usagePercentiles(pool, position, usage, playedWeeks) {
  const out = {}
  for (const kind of USAGE_SHARE_KINDS) {
    const share = usage?.[kind]
    const values = pool?.[position]?.[kind]
    const ranked = Number.isFinite(share)
      && playedWeeks >= USAGE_POOL_MIN_WEEKS
      && (values?.length ?? 0) >= USAGE_POOL_MIN_PLAYERS
    // PROVISIONAL(no-data): uncoloured usage share · fewer than USAGE_POOL_MIN_PLAYERS qualifying league starters at the position, or the player has fewer than USAGE_POOL_MIN_WEEKS played weeks · more completed weeks
    out[kind] = ranked ? percentileOf(values, share) : null
  }
  return out
}
