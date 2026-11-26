import { rankDual, seasonLinesFromCareer } from './weeklyRanks'

// Ranks players of `position` within ONE season by league-scored PPG
// (fantasyPoints/gamesPlayed), descending; gamesPlayed>0 only.
// Returns Map<playerId, { rank, points, ppg }>  (rank is 1-based).
export function rankPositionSeason(seasonData, playersMap, position) {
  const peers = Object.entries(seasonData)
    .filter(([id, d]) => playersMap?.[id]?.position === position && d.gamesPlayed > 0)
    .map(([id, d]) => ({ id, ppg: d.fantasyPoints / d.gamesPlayed, points: d.fantasyPoints }))
    .sort((a, b) => b.ppg - a.ppg)
  const out = new Map()
  peers.forEach((p, i) => out.set(p.id, { rank: i + 1, points: p.points, ppg: p.ppg }))
  return out
}

// Global pass over careerStats. `rank` is the TOTAL-points position rank (competition ranking, ties
// share); `rankPpg` is the per-game rank under rankDual's games floor (null below it). Returns:
//   ranksByPlayer: Map<playerId, Array<{ season:number, rank:number, rankPpg:number|null, points:number }>>
//   refByPosRank:  { [position]: { [rank:number]: number } }  // avg total points at that total-points rank
export function buildSeasonPositionRanks(careerStats, playersMap) {
  const ranksByPlayer = new Map()
  const acc = {}                                  // pos -> rank -> { sum, n }
  for (const [seasonStr, seasonData] of Object.entries(careerStats || {})) {
    const season = Number(seasonStr)
    const ranks = rankDual(seasonLinesFromCareer(seasonData), playersMap)
    for (const [id, r] of ranks) {
      const pos = playersMap[id].position
      const points = seasonData[id].fantasyPoints
      if (!ranksByPlayer.has(id)) ranksByPlayer.set(id, [])
      ranksByPlayer.get(id).push({ season, rank: r.posRank, rankPpg: r.posRankPpg, points })
      acc[pos] ??= {}
      acc[pos][r.posRank] ??= { sum: 0, n: 0 }
      acc[pos][r.posRank].sum += points
      acc[pos][r.posRank].n   += 1
    }
  }
  const refByPosRank = {}
  for (const [pos, byRank] of Object.entries(acc)) {
    refByPosRank[pos] = {}
    for (const [rank, { sum, n }] of Object.entries(byRank)) refByPosRank[pos][rank] = sum / n
  }
  return { ranksByPlayer, refByPosRank }
}

// Picks ceiling (best/min rank) and floor (worst/max rank) from one player's
// season list and decorates with the per-rank reference delta.
// Tie rule: ceiling tie -> higher points (best version); floor tie -> lower points.
// Returns { ceiling, floor } | null. Each season:
//   { season, rank, rankPpg:number|null, points, refAvg:number|null, delta:number|null }
export function computeCeilingFloor(playerSeasons, position, refByPosRank) {
  if (!playerSeasons || playerSeasons.length === 0) return null
  let ceiling = playerSeasons[0], floor = playerSeasons[0]
  for (const s of playerSeasons) {
    if (s.rank < ceiling.rank || (s.rank === ceiling.rank && s.points > ceiling.points)) ceiling = s
    if (s.rank > floor.rank   || (s.rank === floor.rank   && s.points < floor.points))   floor = s
  }
  const decorate = s => {
    const refAvg = refByPosRank?.[position]?.[s.rank] ?? null
    return { season: s.season, rank: s.rank, rankPpg: s.rankPpg ?? null, points: s.points, refAvg,
             delta: refAvg == null ? null : Math.round(s.points - refAvg) }
  }
  return { ceiling: decorate(ceiling), floor: decorate(floor) }
}
