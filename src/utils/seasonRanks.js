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

// Global pass over careerStats. Returns:
//   ranksByPlayer: Map<playerId, Array<{ season:number, rank:number, points:number }>>
//   refByPosRank:  { [position]: { [rank:number]: number } }  // avg total points at that finish
export function buildSeasonPositionRanks(careerStats, playersMap) {
  const ranksByPlayer = new Map()
  const acc = {}                                  // pos -> rank -> { sum, n }
  for (const [seasonStr, seasonData] of Object.entries(careerStats || {})) {
    const season = Number(seasonStr)
    const positions = new Set()
    for (const id of Object.keys(seasonData)) {
      const pos = playersMap?.[id]?.position
      if (pos) positions.add(pos)
    }
    for (const pos of positions) {
      for (const [id, { rank, points }] of rankPositionSeason(seasonData, playersMap, pos)) {
        if (!ranksByPlayer.has(id)) ranksByPlayer.set(id, [])
        ranksByPlayer.get(id).push({ season, rank, points })
        acc[pos] ??= {}
        acc[pos][rank] ??= { sum: 0, n: 0 }
        acc[pos][rank].sum += points
        acc[pos][rank].n   += 1
      }
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
//   { season, rank, points, refAvg:number|null, delta:number|null }
export function computeCeilingFloor(playerSeasons, position, refByPosRank) {
  if (!playerSeasons || playerSeasons.length === 0) return null
  let ceiling = playerSeasons[0], floor = playerSeasons[0]
  for (const s of playerSeasons) {
    if (s.rank < ceiling.rank || (s.rank === ceiling.rank && s.points > ceiling.points)) ceiling = s
    if (s.rank > floor.rank   || (s.rank === floor.rank   && s.points < floor.points))   floor = s
  }
  const decorate = s => {
    const refAvg = refByPosRank?.[position]?.[s.rank] ?? null
    return { season: s.season, rank: s.rank, points: s.points, refAvg,
             delta: refAvg == null ? null : Math.round(s.points - refAvg) }
  }
  return { ceiling: decorate(ceiling), floor: decorate(floor) }
}
