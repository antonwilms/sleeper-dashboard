// ---------------------------------------------------------------------------
// Career arc vectors
// ---------------------------------------------------------------------------

// Builds a career arc vector for a player: normalizedPPG per career year,
// where year 1 = their first season with gamesPlayed ≥ 8.
// normalizedPPG = PPG / positionPeakPPG (clamped to [0, 1.5] to handle outliers).
export function buildCareerArcVector(playerId, careerStats, positionPeakPPG, position) {
  const peakPPG = positionPeakPPG?.[position] ?? 20

  const qualifyingSeasons = Object.entries(careerStats)
    .map(([season, seasonData]) => {
      const d = seasonData[playerId]
      if (!d || (d.gamesPlayed ?? 0) < 8) return null
      return { season: Number(season), ppg: d.fantasyPoints / d.gamesPlayed }
    })
    .filter(Boolean)
    .sort((a, b) => a.season - b.season)

  return qualifyingSeasons.map(({ ppg }) =>
    Math.min(ppg / Math.max(peakPPG, 1), 1.5)
  )
}

// ---------------------------------------------------------------------------
// Similarity function
// ---------------------------------------------------------------------------

// Compares two career arc vectors over their overlapping career years.
// Returns 0-1 where 1 = identical trajectory.
export function computeArcSimilarity(vectorA, vectorB) {
  const overlapLen = Math.min(vectorA.length, vectorB.length)
  if (overlapLen < 2) return 0

  let sumSq = 0
  for (let i = 0; i < overlapLen; i++) {
    const diff = vectorA[i] - vectorB[i]
    sumSq += diff * diff
  }
  const distance = Math.sqrt(sumSq)
  return 1 / (1 + distance)
}

// ---------------------------------------------------------------------------
// Session-level cache (recomputed on each page load — fast in-memory math)
// ---------------------------------------------------------------------------
// Keyed by playerId only; correctness assumes positionPeakPPG only changes together with careerStats (App.jsx memo chain).
const compsCache = new Map()

// ---------------------------------------------------------------------------
// Find career comparables
// ---------------------------------------------------------------------------

// Returns up to topN players at the same position whose career arc most
// closely matches the target player's, up to the target's current career length.
// Each result includes theirSubsequentSeasons — what the comp did AFTER
// the overlap point, which is the actual predictive value.
export function findCareerComps(playerId, playersMap, careerStats, positionPeakPPG, topN = 3) {
  if (compsCache.has(playerId)) return compsCache.get(playerId)

  const player   = playersMap[playerId]
  const position = player?.position
  if (!player || !position) {
    compsCache.set(playerId, [])
    return []
  }

  const targetVector = buildCareerArcVector(playerId, careerStats, positionPeakPPG, position)
  if (targetVector.length < 2) {
    compsCache.set(playerId, [])
    return []
  }

  const candidates = []

  for (const [candidateId, playerInfo] of Object.entries(playersMap)) {
    if (candidateId === playerId) continue
    if (playerInfo.position !== position) continue

    const candidateVector = buildCareerArcVector(candidateId, careerStats, positionPeakPPG, position)
    if (candidateVector.length < targetVector.length) continue

    // Compare only the overlapping career years (target's full length)
    const targetSlice    = targetVector
    const candidateSlice = candidateVector.slice(0, targetVector.length)
    const similarity     = computeArcSimilarity(targetSlice, candidateSlice)

    if (similarity < 0.6) continue

    // Subsequent seasons = what the comp did after the overlap point
    const theirSubsequentSeasons = candidateVector.slice(targetVector.length)

    candidates.push({
      player_id:              candidateId,
      full_name:              playerInfo.full_name ?? candidateId,
      similarity:             Math.round(similarity * 100),
      theirSubsequentSeasons,
      targetVector,
      candidateVector,
    })
  }

  candidates.sort((a, b) => b.similarity - a.similarity)
  const result = candidates.slice(0, topN)

  compsCache.set(playerId, result)
  return result
}

// ---------------------------------------------------------------------------
// Interpretive stat: average PPG over comps' next 2 seasons
// ---------------------------------------------------------------------------

// Given the comps array from findCareerComps, compute the average normalised
// PPG across all comps' subsequent seasons (up to 2), then convert back to
// an absolute PPG estimate using positionPeakPPG.
export function compsProjectedPPG(comps, positionPeakPPG, position) {
  const peakPPG = positionPeakPPG?.[position] ?? 20
  const values  = []

  for (const comp of comps) {
    const next2 = comp.theirSubsequentSeasons.slice(0, 2)
    for (const v of next2) values.push(v * peakPPG)
  }

  if (values.length === 0) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}
