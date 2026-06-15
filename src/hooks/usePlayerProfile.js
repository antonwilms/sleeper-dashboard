import { useMemo, useCallback } from 'react'
import { useProfileData } from '../context/ProfileDataContext'
import { findCareerComps, compsProjectedPPG } from '../utils/careerComps'
import { buildTeamDepthChart } from '../utils/teamContext'

// ---------------------------------------------------------------------------
// usePlayerProfile
//
// Pure data hook — reads from ProfileDataContext, derives everything the
// PlayerProfile component needs to render.  UI-only state (focusSeason,
// weeklyOpen) stays in the component.
//
// Calling this hook for multiple playerIds simultaneously is safe — each
// call is independent, enabling a future side-by-side comparison view
// without any changes to this hook or the profile component.
// ---------------------------------------------------------------------------

export function usePlayerProfile(playerId) {
  const { careerStats, playersMap, playerRows, positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, advStats } = useProfileData()

  // ── Identity ──────────────────────────────────────────────────────────────
  const player    = playersMap?.[playerId] ?? {}
  const playerRow = useMemo(
    () => playerRows?.find(r => r.player_id === playerId) ?? null,
    [playerRows, playerId]
  )

  // ── All seasons, sorted ascending ─────────────────────────────────────────
  const allSeasons = useMemo(
    () => Object.keys(careerStats ?? {}).map(Number).sort(),
    [careerStats]
  )
  const mostRecentSeason = allSeasons[allSeasons.length - 1] ?? null

  // ── Career history rows ────────────────────────────────────────────────────
  // One row per season where the player has at least 1 game played.
  const careerHistory = useMemo(() => {
    if (!careerStats) return []
    return allSeasons
      .map(season => {
        const d = careerStats[season]?.[playerId]
        if (!d || d.gamesPlayed === 0) return null
        return {
          season,
          ppg:          Math.round((d.fantasyPoints / d.gamesPlayed) * 100) / 100,
          gamesPlayed:  d.gamesPlayed,
          gamesStarted: d.gamesStarted ?? null,
          byeWeeks:     d.byeWeeks     ?? null,
          dnpWeeks:     d.dnpWeeks     ?? null,
          fantasyPoints: d.fantasyPoints,
          isMostRecent: season === mostRecentSeason,
        }
      })
      .filter(Boolean)
  }, [allSeasons, careerStats, playerId, mostRecentSeason])

  const careerAvgPPG = useMemo(() => {
    if (careerHistory.length === 0) return 0
    return careerHistory.reduce((s, r) => s + r.ppg, 0) / careerHistory.length
  }, [careerHistory])

  const careerTotalPts = useMemo(
    () => Math.round(careerHistory.reduce((s, r) => s + r.fantasyPoints, 0) * 10) / 10,
    [careerHistory]
  )

  const careerTotalGP = useMemo(
    () => careerHistory.reduce((s, r) => s + r.gamesPlayed, 0),
    [careerHistory]
  )

  // ── Historical position ranks ──────────────────────────────────────────────
  // Per-season rank among all players at the same position with > 0 games.
  const historicalRanks = useMemo(() => {
    const position = player.position
    if (!position || !careerStats) return {}
    const ranks = {}
    for (const [season, seasonData] of Object.entries(careerStats)) {
      const peers = Object.entries(seasonData)
        .filter(([id, d]) => playersMap?.[id]?.position === position && d.gamesPlayed > 0)
        .map(([id, d]) => ({ id, ppg: d.fantasyPoints / d.gamesPlayed }))
        .sort((a, b) => b.ppg - a.ppg)
      const idx = peers.findIndex(p => p.id === playerId)
      ranks[season] = idx >= 0 ? idx + 1 : null
    }
    return ranks
  }, [careerStats, playerId, playersMap, player.position])

  // ── Available seasons (for the season-selector dropdown) ──────────────────
  const availableSeasons = useMemo(
    () => allSeasons.filter(s => (careerStats?.[s]?.[playerId]?.gamesPlayed ?? 0) > 0),
    [allSeasons, careerStats, playerId]
  )

  // ── Season data accessor (drives the season-detail section) ───────────────
  // Returns a stable-shaped object so the component can destructure safely.
  const getSeasonData = useCallback((season) => {
    const d = careerStats?.[season]?.[playerId] ?? {}
    return {
      gamesPlayed:   d.gamesPlayed  ?? null,
      fantasyPoints: d.fantasyPoints ?? null,
      weeklyPoints:  d.weeklyPoints  ?? {},
      rawStats: Object.entries(d.stats ?? {})
        .filter(([, v]) => v != null && v !== 0)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)),
    }
  }, [careerStats, playerId])

  // ── Dynasty score (already computed in playerRows) ────────────────────────
  const dynastyScore = playerRow?.dynastyScore ?? null

  // ── Career comparables ────────────────────────────────────────────────────
  const comps = useMemo(() => {
    if (!careerStats || !positionPeakPPG || dynastyScore?.confidence === 'prospect') return null
    return findCareerComps(playerId, playersMap, careerStats, positionPeakPPG)
  }, [playerId, careerStats, playersMap, positionPeakPPG, dynastyScore?.confidence])

  const projectedPPG = useMemo(() => {
    if (!comps?.length || !positionPeakPPG || !player.position) return null
    return compsProjectedPPG(comps, positionPeakPPG, player.position)
  }, [comps, positionPeakPPG, player.position])

  // ── Position peers (top 5 at same position + profiled player if outside) ──
  const positionPeers = useMemo(() => {
    if (!playerRows || !player.position) return []
    const samePos = playerRows
      .filter(r => r.position === player.position && r.currentSeasonPPG > 0)
      .sort((a, b) => a.positionRank - b.positionRank)
    const top5       = samePos.slice(0, 5)
    const isInTop5   = top5.some(r => r.player_id === playerId)
    const profiledRow = samePos.find(r => r.player_id === playerId)
    // null entries are rendered as ellipsis separators in the component
    return (!isInTop5 && profiledRow) ? [...top5, null, profiledRow] : top5
  }, [playerRows, player.position, playerId])

  // ── Positional ranks ──────────────────────────────────────────────────────
  const recentRank      = playerRow?.recentRank      ?? null
  const peakRank        = playerRow?.peakRank        ?? null
  const consistencyRank = playerRow?.consistencyRank ?? null
  const dynastyRank     = playerRow?.dynastyRank     ?? null
  const rankMovement    = playerRow?.rankMovement    ?? null
  const movementLabel   = playerRow?.movementLabel   ?? null

  // ── Role rank & share history ─────────────────────────────────────────────
  const roleRank    = playerRow?.roleRank ?? null
  const shareHistory = useMemo(
    () => historicalShares?.[playerId]?.slice(-5) ?? null,
    [historicalShares, playerId]
  )

  // ── College metrics ───────────────────────────────────────────────────────
  const collegeMetrics = collegeStats?.[playerId] ?? null

  // ── Next-season projection ───────────────────────────────────────────────
  const projection = seasonProjections?.[playerId] ?? null
  const nextSeasonRank = playerRow?.nextSeasonRank ?? null

  // ── Team depth chart ──────────────────────────────────────────────────────
  const teamDepthChart = useMemo(() => {
    if (!player.team) return null
    return buildTeamDepthChart(player.team, playersMap, playerRows)
  }, [player.team, playersMap, playerRows])

  // ── Ownership ─────────────────────────────────────────────────────────────
  const ownership = playerRow?.ownerTeamName ?? null

  // ── KTC market value ──────────────────────────────────────────────────────
  const ktcValue = ktcMap?.get(playerId)?.value ?? null

  // ── Market divergence (pre-computed on playerRow) ─────────────────────────
  const divergenceSignal = playerRow?.divergenceSignal ?? null
  const dynRank          = playerRow?.dynRank          ?? null
  const ktcRank          = playerRow?.ktcRank          ?? null

  // ── Advstats (view-only; served file is the single source) ────────────────
  const advStatsRow    = advStats?.byId?.[playerId] ?? null
  const advStatsSeason = advStats?.year ?? null

  // ── Reused in-app usage stats (NOT recomputed) ────────────────────────────
  // Snap share: most-recent qualifying season's off_snp/tm_off_snp, already computed
  // in the projection pipeline (usageMetrics.computeUsageFactors) and surfaced on
  // projection.factors.snapShare. null for QB / missing fields.
  const snapShare = projection?.factors?.snapShare ?? null

  // Carry/target share: most-recent entry of historicalShares (already in shareHistory).
  // `share` is target share for WR/TE, carry share for RB.
  const usageShare = (shareHistory && shareHistory.length > 0)
    ? { value: shareHistory[shareHistory.length - 1].share,
        season: shareHistory[shareHistory.length - 1].season }
    : null

  return {
    // Identity
    player,
    dynastyScore,
    ownership,
    ktcValue,
    divergenceSignal,
    dynRank,
    ktcRank,

    // Positional ranks
    recentRank,
    peakRank,
    consistencyRank,
    dynastyRank,
    rankMovement,
    movementLabel,

    // Career data
    careerHistory,
    careerAvgPPG,
    careerTotalPts,
    careerTotalGP,
    historicalRanks,

    // Season detail
    availableSeasons,
    mostRecentSeason,
    getSeasonData,

    // Comparables
    comps,
    projectedPPG,

    // Peers
    positionPeers,

    // Role
    roleRank,
    shareHistory,

    // College
    collegeMetrics,

    // Team depth chart
    teamDepthChart,

    // Next-season projection
    projection,
    nextSeasonRank,

    // Advstats (view-only)
    advStatsRow,
    advStatsSeason,
    snapShare,
    usageShare,

    // Context values needed for rendering (e.g. comp PPG conversion)
    positionPeakPPG,
  }
}
