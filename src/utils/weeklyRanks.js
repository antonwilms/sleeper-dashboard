// The production-rank logic every surface consumes. Pure, no React, no I/O. View-only.
//
// `rankDual` is the **dual rank**: total-points rank plus points-per-game rank under a per-group
// `min(PPG_RANK_MIN_GAMES, most games)` floor. Beside it sit the line builders
// (`seasonLinesFromCareer`; `liveSeasonLog.js`'s `liveSeasonLines`), `buildRankPeers` (the pop-up
// rails) and `buildLineupRanks` (`/week`'s rank line). My Team's season cells
// (`portfolio/Portfolio.jsx`) call `rankDual` directly. `seasonRanks.js`'s
// `buildSeasonPositionRanks` ranks through `rankDual`, while its `rankPositionSeason` remains a
// PPG-only lookup (no ties, no overall rank). Overall ranks among QB/RB/WR/TE only. Competition
// ranking: equal points share a rank and the next rank skips (1, 2, 2, 4).
//
// The live season comes from Sleeper's weekly stat rows scored here, not from a data-store file,
// so the table never waits on an ingest job (like the rest of the lineup table). Last season is
// `careerStats[deriveDataSeason(careerStats)]` — derived inside, never `season - 1`, so the rank
// and the SNAP sub-line always describe the same year.
//
// Population. Last season's population is whatever `careerStats[dataSeason]` holds: every served
// row on the data-store path, but only `activePlayerIds` (Active/IR/FA or rostered —
// `App.jsx:1022-1026`, filtered at `sleeperStats.js:247`) on the live-API fallback. This season's
// population is every `gp === 1` weekly row, never filtered. On the fallback path the two ranks
// therefore use different populations — accepted (the fallback is the degraded mode, and My Team's
// last-season rank uses the same `careerStats` population), stated, not corrected.

import { deriveDataSeason } from './environment'
import { liveSeasonLines } from './liveSeasonLog'

export const OVERALL_POSITIONS = ['QB', 'RB', 'WR', 'TE']

function competitionRanks(entries) {
  // entries: [[id, points]] -> Map<id, rank>, descending by points
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const ranks = new Map()
  let rank = 0
  let prev = null
  sorted.forEach(([id, pts], i) => {
    if (pts !== prev) { rank = i + 1; prev = pts }
    ranks.set(id, rank)
  })
  return ranks
}

export const PPG_RANK_MIN_GAMES = 3

// linesById: { [id]: { points, games } } → Map<id, { posRank, posRankPpg, overallRank, overallRankPpg }>.
// Entries with no playerMap position, non-finite points or no games are skipped. Total ranks cover every
// entry; PPG ranks only those with at least `min(minGames, most games in the group)` games, the floor
// computed separately for each position group and for the overall (QB/RB/WR/TE) group.
export function rankDual(linesById, playerMap, { minGames = PPG_RANK_MIN_GAMES } = {}) {
  const byPosition = {}
  const overall = []
  for (const [id, line] of Object.entries(linesById ?? {})) {
    const position = playerMap?.[id]?.position
    if (!position || !Number.isFinite(line?.points) || !(line?.games > 0)) continue
    const entry = { id, points: line.points, games: line.games }
    ;(byPosition[position] ??= []).push(entry)
    if (OVERALL_POSITIONS.includes(position)) overall.push(entry)
  }
  const rankGroup = (entries) => {
    const floor = Math.min(minGames, Math.max(...entries.map(e => e.games)))
    return {
      total: competitionRanks(entries.map(e => [e.id, e.points])),
      ppg: competitionRanks(entries.filter(e => e.games >= floor).map(e => [e.id, e.points / e.games])),
    }
  }
  const overallRanks = rankGroup(overall)
  const result = new Map()
  for (const entries of Object.values(byPosition)) {
    const posRanks = rankGroup(entries)
    for (const { id } of entries) {
      result.set(id, {
        posRank: posRanks.total.get(id),
        posRankPpg: posRanks.ppg.get(id) ?? null,
        overallRank: overallRanks.total.get(id) ?? null,
        overallRankPpg: overallRanks.ppg.get(id) ?? null,
      })
    }
  }
  return result
}

// careerStats[season] rows -> { [id]: { points, games } } for rows with gamesPlayed > 0 and finite points.
export function seasonLinesFromCareer(seasonRows) {
  const out = {}
  for (const [id, row] of Object.entries(seasonRows ?? {})) {
    if (row?.gamesPlayed > 0 && Number.isFinite(row.fantasyPoints)) {
      out[id] = { points: row.fantasyPoints, games: row.gamesPlayed }
    }
  }
  return out
}

// Both pop-up rails (in-season and off-season): the top `limit` at `position` by posRank (ties: higher
// points, then id), then — if the player is ranked but outside them — a null separator and the player.
// `ranks` is a rankDual result. Each peer { player_id, positionRank, positionRankPpg, full_name, ppg }.
// Players with no posRank are never listed.
export function buildRankPeers({ lines, ranks, playersMap, position, playerId, limit = 5 }) {
  const toPeer = (id) => ({
    player_id: id,
    positionRank: ranks.get(id).posRank,
    positionRankPpg: ranks.get(id).posRankPpg ?? null,
    full_name: playersMap?.[id]?.full_name ?? id,
    ppg: lines[id].points / lines[id].games,
  })
  const candidates = Object.keys(lines ?? {})
    .filter(id => playersMap?.[id]?.position === position && ranks?.get(id)?.posRank != null)
    .sort((a, b) => (
      ranks.get(a).posRank - ranks.get(b).posRank
      || lines[b].points - lines[a].points
      || (a < b ? -1 : a > b ? 1 : 0)
    ))
  const top = candidates.slice(0, limit)
  const peers = top.map(toPeer)
  if (candidates.includes(playerId) && !top.includes(playerId)) peers.push(null, toPeer(playerId))
  return peers
}

// → { [id]: { lastPos, lastPosPpg, thisPos, thisPosPpg, thisOverall, thisOverallPpg } } for each rendered
// player, each a number or null. Total and per-game ranks from rankDual; this season's games are the weekly
// rows' gp === 1 count (liveSeasonLines).
export function buildLineupRanks({ rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings }) {
  const lastSeason = deriveDataSeason(careerStats)
  const lastRanks = rankDual(seasonLinesFromCareer(careerStats?.[lastSeason]), playerMap)
  const thisRanks = rankDual(liveSeasonLines(playedWeeklyMaps, scoringSettings), playerMap)

  const out = {}
  for (const p of rendered ?? []) {
    const id = p?.id
    if (id == null) continue
    const l = lastRanks.get(id)
    const t = thisRanks.get(id)
    out[id] = {
      lastPos: l?.posRank ?? null,
      lastPosPpg: l?.posRankPpg ?? null,
      thisPos: t?.posRank ?? null,
      thisPosPpg: t?.posRankPpg ?? null,
      thisOverall: t?.overallRank ?? null,
      thisOverallPpg: t?.overallRankPpg ?? null,
    }
  }
  return out
}
