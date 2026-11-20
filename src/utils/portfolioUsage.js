// My Team's in-season usage lines (myteam-m1-live-season.md §3.1). View-only, pure: never feeds
// projection, scoring, snapshots or `factors`. Imports `buildWindowStats` (./marketWindowStats) and
// `buildAvailabilityGrid` (./availabilityGrid) only — SHARE is Market's games-played share (CR-34 keys),
// not the season-total share `buildUsageHistory` gives the out-of-season layout.
import { buildWindowStats } from './marketWindowStats'
import { buildAvailabilityGrid } from './availabilityGrid'

/**
 * @param {{ ids: Iterable<string>, liveRows: object|null, liveSeason: number|null, careerStats: object|null,
 *   dataSeason: number|null, playerMap: object|null, gameLogsByYear: object|null }} args
 * @returns {Map<string, { live: UsageLine|null, prior: UsageLine|null }>}
 * UsageLine = { weeks: Array<'P'|'D'|'B'|'X'>|null, played: number|null, missed: number|null,
 *               share: number|null, snap: number|null }
 */
export function buildInSeasonUsage({ ids, liveRows, liveSeason, careerStats, dataSeason, playerMap, gameLogsByYear }) {
  const hasLive = liveRows != null && Number.isFinite(liveSeason)
  const priorRows = Number.isFinite(dataSeason) ? (careerStats?.[dataSeason] ?? null) : null

  const liveStats = hasLive
    ? buildWindowStats({
      window: { id: 'live', kind: 'live', seasons: [liveSeason] }, careerStats,
      currentSeasonTotals: { season: liveSeason, complete: true, players: liveRows }, playerMap, gameLogsByYear,
    })
    : null
  const priorStats = priorRows != null
    ? buildWindowStats({
      window: { id: String(dataSeason), kind: 'season', seasons: [dataSeason] }, careerStats,
      currentSeasonTotals: null, playerMap, gameLogsByYear,
    })
    : null

  const line = (rows, stats, season, id, position) => {
    const row = rows?.[id]
    const entry = stats?.get(id)
    if (row == null && entry == null) return null
    const weeks = Array.isArray(row?.weeklyStatus)
      ? buildAvailabilityGrid({ [season]: rows }, id, [season]).rows[0].weeks
      : null
    return {
      weeks,
      played: weeks ? weeks.filter(w => w === 'P').length : null,
      missed: weeks ? weeks.filter(w => w === 'D').length : null,
      share: position === 'RB' ? (entry?.usage.carryShare ?? null)
        : position === 'WR' || position === 'TE' ? (entry?.usage.tgtShare ?? null) : null,
      snap: position === 'RB' || position === 'WR' || position === 'TE' ? (entry?.usage.snapPct ?? null) : null,
    }
  }

  const out = new Map()
  for (const id of ids) {
    const position = playerMap?.[id]?.position
    out.set(id, {
      live: hasLive ? line(liveRows, liveStats, liveSeason, id, position) : null,
      prior: priorRows != null ? line(priorRows, priorStats, dataSeason, id, position) : null,
    })
  }
  return out
}
