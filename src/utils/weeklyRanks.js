// week-lineup-cleanup.md §4 — the rank line under each player on `/week`: position rank last
// season and this season, and overall rank this season. Pure, no React, no I/O. View-only.
//
// Ranks are by TOTAL league-scored points, not per game (Sleeper's own convention) — unlike
// `seasonRanks.js`'s `rankPositionSeason` (by PPG, no ties, no overall rank). My Team's POS RANK
// and in-season rank sub-lines use these functions too (`portfolio/Portfolio.jsx`). Overall ranks among QB/RB/WR/TE only. Competition ranking:
// equal points share a rank and the next rank skips (1, 2, 2, 4).
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

import { calculateFantasyPoints } from './fantasyPoints'
import { deriveDataSeason } from './environment'

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

// → Map<id, { posRank, overallRank }>. Entries with non-finite points or no playerMap position are
// skipped; overallRank is null outside OVERALL_POSITIONS.
export function rankByTotalPoints(pointsById, playerMap) {
  const byPosition = {}
  const overall = []
  for (const [id, pts] of Object.entries(pointsById ?? {})) {
    const position = playerMap?.[id]?.position
    if (!position || !Number.isFinite(pts)) continue
    ;(byPosition[position] ??= []).push([id, pts])
    if (OVERALL_POSITIONS.includes(position)) overall.push([id, pts])
  }
  const overallRanks = competitionRanks(overall)
  const result = new Map()
  for (const entries of Object.values(byPosition)) {
    const posRanks = competitionRanks(entries)
    for (const [id] of entries) {
      result.set(id, { posRank: posRanks.get(id), overallRank: overallRanks.get(id) ?? null })
    }
  }
  return result
}

// careerStats[season] rows -> { [id]: fantasyPoints } for rows with gamesPlayed > 0 and finite points.
export function seasonPointsFromCareer(seasonRows) {
  const out = {}
  for (const [id, row] of Object.entries(seasonRows ?? {})) {
    if (row?.gamesPlayed > 0 && Number.isFinite(row.fantasyPoints)) out[id] = row.fantasyPoints
  }
  return out
}

// Sums league-scored points over every `gp === 1` row across the played weeks — all players in the
// payload, not just the roster. `TEAM_*` aggregate rows are skipped explicitly.
export function seasonPointsFromWeekly(playedWeeklyMaps, scoringSettings) {
  const out = {}
  for (const wk of playedWeeklyMaps ?? []) {
    for (const [id, row] of Object.entries(wk?.rows ?? {})) {
      if (id.startsWith('TEAM_')) continue
      if (row?.stats?.gp !== 1) continue
      out[id] = (out[id] ?? 0) + calculateFantasyPoints(row.stats, scoringSettings ?? {})
    }
  }
  return out
}

// → { [id]: { lastPos, thisPos, thisOverall } } for each rendered player, each a number or null.
export function buildLineupRanks({ rendered, careerStats, playedWeeklyMaps, playerMap, scoringSettings }) {
  const lastSeason = deriveDataSeason(careerStats)
  const lastRanks = rankByTotalPoints(seasonPointsFromCareer(careerStats?.[lastSeason]), playerMap)
  const thisRanks = rankByTotalPoints(seasonPointsFromWeekly(playedWeeklyMaps, scoringSettings), playerMap)

  const out = {}
  for (const p of rendered ?? []) {
    const id = p?.id
    if (id == null) continue
    out[id] = {
      lastPos: lastRanks.get(id)?.posRank ?? null,
      thisPos: thisRanks.get(id)?.posRank ?? null,
      thisOverall: thisRanks.get(id)?.overallRank ?? null,
    }
  }
  return out
}
