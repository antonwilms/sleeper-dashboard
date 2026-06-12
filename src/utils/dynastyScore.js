import { computeShareTrend } from './teamContext'
import { computeMomentum } from './momentum'
import { computeConsistency } from './regressionSignals'
import { interpolateAgeCurve } from './ageCurve'
import { computeBreakoutFlag, computeBounceBackFlag, computeTdReliance } from './projectionSignals'
import { classifyInjurySeason } from './durabilitySignals'

// ---------------------------------------------------------------------------
// Empirical age curves
// ---------------------------------------------------------------------------

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// Hard caps on the peak age used as the normalisation baseline.
// The active-players-only dataset suffers survivorship bias at late ages
// (only elite veterans survive to 34+), which inflates the empirical peak.
// These caps anchor the peak to realistic career-development knowledge.
const PEAK_AGE_CAPS = { QB: 32, RB: 25, WR: 28, TE: 29 }

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function rollingAvg3(points) {
  return points.map((p, i) => {
    const window = points.slice(Math.max(0, i - 1), i + 2)
    return { age: p.age, medianPPG: window.reduce((s, w) => s + w.medianPPG, 0) / window.length }
  })
}

// Builds empirical age curves from careerStats + playersMap.
// Returns { QB: [{age, medianPPG}], RB: [...], WR: [...], TE: [...] }
// and positionPeakPPG: { QB: number, RB: number, WR: number, TE: number }
export function computeEmpiricalAgeCurves(careerStats, playersMap) {
  // Collect all qualifying player-seasons: { position, age, ppg }
  const byPositionAge = { QB: {}, RB: {}, WR: {}, TE: {} }

  for (const [season, seasonData] of Object.entries(careerStats)) {
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 10) continue
      const player = playersMap[playerId]
      if (!player || !SKILL_POSITIONS.has(player.position)) continue

      // Estimate age during that season: current age minus years since season
      const currentAge = player.age
      if (currentAge == null) continue
      const currentYear = new Date().getFullYear()
      const seasonYear = Number(season)
      const ageAtSeason = Math.round(currentAge - (currentYear - seasonYear))
      if (ageAtSeason < 18 || ageAtSeason > 42) continue

      const ppg = data.fantasyPoints / data.gamesPlayed
      if (!Number.isFinite(ppg)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[age curve] non-finite PPG excluded from ${player.position} age-${ageAtSeason} bucket: player=${playerId} season=${season} gp=${data.gamesPlayed} fp=${data.fantasyPoints}`)
        }
        continue
      }
      const pos = player.position
      if (!byPositionAge[pos][ageAtSeason]) byPositionAge[pos][ageAtSeason] = []
      byPositionAge[pos][ageAtSeason].push(ppg)
    }
  }

  const curves = {}
  const positionPeakPPG = {}

  for (const pos of Object.keys(byPositionAge)) {
    const raw = Object.entries(byPositionAge[pos])
      .map(([age, ppgs]) => ({ age: Number(age), medianPPG: median(ppgs) }))
      .sort((a, b) => a.age - b.age)

    const smoothed = rollingAvg3(raw)
    curves[pos] = smoothed

    if (smoothed.length > 0) {
      // Find the empirically derived peak age (highest smoothed medianPPG).
      const peakPoint = smoothed.reduce(
        (best, p) => p.medianPPG > best.medianPPG ? p : best,
        smoothed[0]
      )
      const derivedPeakAge = peakPoint.age

      // Cap the peak age to remove survivorship-bias inflation.
      const cap = PEAK_AGE_CAPS[pos] ?? null
      const cappedPeakAge = cap != null ? Math.min(derivedPeakAge, cap) : derivedPeakAge

      // Always log so we can see when the cap is active.
      if (process.env.NODE_ENV !== 'production') {
        if (cap != null && derivedPeakAge > cap) {
          console.log(`[age curve] ${pos}: derived peak ${derivedPeakAge}, capped to ${cap}`)
        } else {
          console.log(`[age curve] ${pos}: derived peak ${derivedPeakAge} (within cap)`)
        }
      }

      // Use the medianPPG at the capped peak age as the normalisation baseline.
      const cappedPeakPoint = smoothed.reduce(
        (best, p) => Math.abs(p.age - cappedPeakAge) < Math.abs(best.age - cappedPeakAge) ? p : best,
        smoothed[0]
      )
      positionPeakPPG[pos] = Math.max(cappedPeakPoint.medianPPG, 1)
    } else {
      positionPeakPPG[pos] = 1
    }
  }

  return { curves, positionPeakPPG }
}

function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50
  let below = 0
  for (const v of sortedPool) { if (v < value) below++ }
  return Math.round((below / sortedPool.length) * 100)
}

// ---------------------------------------------------------------------------
// Volume-adjusted opportunity quality (replaces simple efficiency)
// ---------------------------------------------------------------------------

function getEfficiencyAndVolume(position, stats, gamesPlayed) {
  const s = stats ?? {}
  const gp = Math.max(gamesPlayed, 1)
  let eff = null, vol = null

  if (position === 'QB') {
    const att = s.pass_att ?? 0
    if (att > 0) {
      eff = (s.pass_yd ?? 0) / att
      vol = att / gp
    }
  } else if (position === 'RB') {
    const carries = s.rush_att ?? 0
    const rec     = s.rec ?? 0
    if (carries > 0) {
      eff = (s.rush_yd ?? 0) / carries
      vol = (carries + rec) / gp
    }
  } else if (position === 'WR' || position === 'TE') {
    const rec = s.rec ?? 0
    if (rec > 0) {
      eff = (s.rec_yd ?? 0) / rec
      const tgt = s.rec_tgt ?? 0
      if (tgt > 0) {
        const catchRate = rec / tgt
        eff = eff * 0.70 + (catchRate * 30) * 0.30
      }
      vol = rec / gp
    }
  }

  return { eff, vol }
}

// Computes opportunity quality (0–100) for a single player.
// Uses the most recent qualifying season (gamesPlayed ≥ 8) for both
// the player and the position pool, ensuring a consistent comparison basis.
// playerShare: { carryShare, targetShare } from teamContext — optional.
function computeOpportunityQuality(playerId, position, seasonHistory, careerStats, playersMap, playerShare = null) {
  if (!SKILL_POSITIONS.has(position) || seasonHistory.length === 0) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 }
  }

  // Season to use for both player and pool
  const targetSeason     = seasonHistory[seasonHistory.length - 1].season
  const targetSeasonData = careerStats[targetSeason] ?? {}

  const playerData = targetSeasonData[playerId]
  if (!playerData || (playerData.gamesPlayed ?? 0) < 8) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 }
  }

  // Build sorted pools from all same-position players with ≥ 8 games that season
  const effPool = [], volPool = []
  for (const [id, data] of Object.entries(targetSeasonData)) {
    const p = playersMap[id]
    if (!p || p.position !== position || (data.gamesPlayed ?? 0) < 8) continue
    const { eff, vol } = getEfficiencyAndVolume(position, data.stats, data.gamesPlayed)
    if (eff != null && isFinite(eff)) effPool.push(eff)
    if (vol != null && isFinite(vol)) volPool.push(vol)
  }
  effPool.sort((a, b) => a - b)
  volPool.sort((a, b) => a - b)

  const { eff: playerEff, vol: playerVol } =
    getEfficiencyAndVolume(position, playerData.stats, playerData.gamesPlayed)

  if (playerEff == null || playerVol == null) {
    return { opportunityScore: 50, efficiencyPercentile: 50, volumePercentile: 50 }
  }

  const efficiencyPercentile = percentileRank(effPool, playerEff)
  const volumePercentile     = percentileRank(volPool, playerVol)

  let opportunityScore
  let shareScore = null

  if (position === 'RB' && playerShare?.carryShare != null) {
    shareScore     = Math.round(clamp(playerShare.carryShare * 200, 0, 100))
    opportunityScore = Math.round(efficiencyPercentile * 0.40 + volumePercentile * 0.30 + shareScore * 0.30)
  } else if ((position === 'WR' || position === 'TE') && playerShare?.targetShare != null) {
    shareScore     = Math.round(clamp(playerShare.targetShare * 400, 0, 100))
    opportunityScore = Math.round(efficiencyPercentile * 0.40 + volumePercentile * 0.30 + shareScore * 0.30)
  } else {
    opportunityScore = Math.round(efficiencyPercentile * 0.55 + volumePercentile * 0.45)
  }

  return { opportunityScore, efficiencyPercentile, volumePercentile, shareScore }
}

// ---------------------------------------------------------------------------
// Positional ranks
// ---------------------------------------------------------------------------

// Returns a Map<player_id, { recentRank, peakRank, consistencyRank, dynastyRank,
//                             rankMovement, movementLabel }>
// Run once after playerRows is fully built (post-divergence).
export function computePositionalRanks(playerRows, careerStats, currentSeason) {
  if (!playerRows?.length || !careerStats || !currentSeason) return new Map()

  const allSeasons = Object.keys(careerStats).map(Number).sort()

  const byPosition = {}
  for (const row of playerRows) {
    if (!['QB', 'RB', 'WR', 'TE'].includes(row.position)) continue
    ;(byPosition[row.position] ??= []).push(row)
  }

  const result = new Map()

  for (const [, rows] of Object.entries(byPosition)) {
    // ── Recent rank ──────────────────────────────────────────────────────────
    const recentPPG = new Map()
    for (const row of rows) {
      const cd = careerStats[currentSeason]?.[row.player_id]
      if ((cd?.gamesPlayed ?? 0) >= 6) {
        recentPPG.set(row.player_id, row.currentSeasonPPG)
      } else {
        let fallback = null
        for (let i = allSeasons.length - 1; i >= 0; i--) {
          const s = allSeasons[i]
          if (s >= currentSeason) continue
          if (s < currentSeason - 3) break  // don't reach back more than 3 seasons
          const d = careerStats[s]?.[row.player_id]
          if (d && (d.gamesPlayed ?? 0) >= 8) { fallback = d.fantasyPoints / d.gamesPlayed; break }
        }
        recentPPG.set(row.player_id, fallback)
      }
    }
    const sortedRecent = [...rows].sort((a, b) => (recentPPG.get(b.player_id) ?? -1) - (recentPPG.get(a.player_id) ?? -1))
    const recentRankMap = new Map(sortedRecent.map((r, i) => [r.player_id, i + 1]))

    // ── Last season rank (for movement) ─────────────────────────────────────
    const lastSeason = currentSeason - 1
    const lastPPG = new Map()
    for (const row of rows) {
      const d = careerStats[lastSeason]?.[row.player_id]
      if (d && (d.gamesPlayed ?? 0) >= 8) lastPPG.set(row.player_id, d.fantasyPoints / d.gamesPlayed)
    }
    const qualifiedLast = rows.filter(r => lastPPG.has(r.player_id))
    const sortedLast = [...qualifiedLast].sort((a, b) => lastPPG.get(b.player_id) - lastPPG.get(a.player_id))
    const lastRankMap = new Map(sortedLast.map((r, i) => [r.player_id, i + 1]))

    // ── Peak rank ────────────────────────────────────────────────────────────
    const peakPPG = new Map()
    for (const row of rows) {
      let best = null
      for (const season of allSeasons) {
        const d = careerStats[season]?.[row.player_id]
        if (d && (d.gamesPlayed ?? 0) >= 8) {
          const ppg = d.fantasyPoints / d.gamesPlayed
          if (best === null || ppg > best) best = ppg
        }
      }
      if (best !== null) peakPPG.set(row.player_id, best)
    }
    const sortedPeak = [...rows].sort((a, b) => (peakPPG.get(b.player_id) ?? -1) - (peakPPG.get(a.player_id) ?? -1))
    const peakRankMap = new Map(sortedPeak.map((r, i) => [r.player_id, i + 1]))

    // ── Consistency rank (last 3 completed seasons, weighted 50/30/20) ───────
    const seasons3 = [currentSeason - 1, currentSeason - 2, currentSeason - 3]

    function buildSeasonRank(season) {
      const q = rows.filter(r => (careerStats[season]?.[r.player_id]?.gamesPlayed ?? 0) >= 8)
      const sorted = [...q].sort((a, b) => {
        const pa = careerStats[season][a.player_id].fantasyPoints / careerStats[season][a.player_id].gamesPlayed
        const pb = careerStats[season][b.player_id].fantasyPoints / careerStats[season][b.player_id].gamesPlayed
        return pb - pa
      })
      return { rankMap: new Map(sorted.map((r, i) => [r.player_id, i + 1])), penalty: q.length + 5 }
    }

    const [{ rankMap: r1Map, penalty: p1 }, { rankMap: r2Map, penalty: p2 }, { rankMap: r3Map, penalty: p3 }] =
      seasons3.map(buildSeasonRank)

    const weightedRankMap = new Map()
    for (const row of rows) {
      const id = row.player_id
      const qualifying = [r1Map.has(id), r2Map.has(id), r3Map.has(id)].filter(Boolean).length
      if (qualifying < 2) continue
      const w = (r1Map.get(id) ?? p1) * 0.50 + (r2Map.get(id) ?? p2) * 0.30 + (r3Map.get(id) ?? p3) * 0.20
      weightedRankMap.set(id, w)
    }
    const sortedConsistency = [...rows]
      .filter(r => weightedRankMap.has(r.player_id))
      .sort((a, b) => weightedRankMap.get(a.player_id) - weightedRankMap.get(b.player_id))
    const consistencyRankMap = new Map(sortedConsistency.map((r, i) => [r.player_id, i + 1]))

    // ── Dynasty rank ─────────────────────────────────────────────────────────
    const sortedDynasty = [...rows]
      .filter(r => r.dynastyScore?.score != null)
      .sort((a, b) => b.dynastyScore.score - a.dynastyScore.score)
    const dynastyRankMap = new Map(sortedDynasty.map((r, i) => [r.player_id, i + 1]))

    // ── Assemble ──────────────────────────────────────────────────────────────
    for (const row of rows) {
      const id         = row.player_id
      const recentRank = recentRankMap.get(id) ?? null
      const lastRank   = lastRankMap.get(id)   ?? null
      let rankMovement  = null
      let movementLabel = null
      if (recentRank !== null && lastRank !== null) {
        rankMovement  = lastRank - recentRank
        movementLabel = rankMovement >= 3 ? 'up' : rankMovement <= -3 ? 'down' : 'stable'
      }
      result.set(id, {
        recentRank,
        peakRank:        peakRankMap.get(id)        ?? null,
        consistencyRank: consistencyRankMap.get(id) ?? null,
        dynastyRank:     dynastyRankMap.get(id)     ?? null,
        rankMovement,
        movementLabel,
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Role ranks
// ---------------------------------------------------------------------------

// Ranks RB/WR/TE players within each position group by weighted recent carry
// or target share (most recent 3 seasons, 50/30/20). Null for players with
// fewer than 2 seasons of share data or for QBs.
export function computeRoleRanks(playerRows, historicalShares) {
  if (!playerRows?.length || !historicalShares) return new Map()

  const byPosition = {}
  for (const row of playerRows) {
    if (!['RB', 'WR', 'TE'].includes(row.position)) continue
    const history = historicalShares[row.player_id]
    if (!history || history.length < 2) continue

    const recent = history.slice(-3)
    const yr1 = recent[recent.length - 1]?.share ?? null
    const yr2 = recent[recent.length - 2]?.share ?? null
    const yr3 = recent[recent.length - 3]?.share ?? null
    const w1 = yr1 != null ? 0.50 : 0
    const w2 = yr2 != null ? 0.30 : 0
    const w3 = yr3 != null ? 0.20 : 0
    const totalW = w1 + w2 + w3
    if (totalW === 0) continue

    const weightedShare = ((yr1 ?? 0) * w1 + (yr2 ?? 0) * w2 + (yr3 ?? 0) * w3) / totalW
    ;(byPosition[row.position] ??= []).push({ player_id: row.player_id, weightedShare })
  }

  const result = new Map()
  for (const rows of Object.values(byPosition)) {
    rows.sort((a, b) => b.weightedShare - a.weightedShare)
    rows.forEach((r, i) => result.set(r.player_id, i + 1))
  }
  return result
}

// ---------------------------------------------------------------------------
// Market divergence
// ---------------------------------------------------------------------------

// Compares dynasty score rank vs KTC rank within each position group.
// Adds { divergence, divergencePct, divergenceSignal, dynRank, ktcRank, positionDepth }
// to every row that has both values; rows without either value are returned unchanged.
export function computeMarketDivergence(playerRows) {
  if (!playerRows?.length) return playerRows

  // Build per-position arrays for players that have both scores
  const byPosition = {}
  for (const row of playerRows) {
    if (row.dynastyScore?.score == null || row.ktcValue == null) continue
    ;(byPosition[row.position] ??= []).push(row)
  }

  const divergenceMap = new Map()

  for (const rows of Object.values(byPosition)) {
    const positionDepth = rows.length

    const byDyn = [...rows].sort((a, b) => b.dynastyScore.score - a.dynastyScore.score)
    const dynRankMap = new Map(byDyn.map((r, i) => [r.player_id, i + 1]))

    const byKtc = [...rows].sort((a, b) => b.ktcValue - a.ktcValue)
    const ktcRankMap = new Map(byKtc.map((r, i) => [r.player_id, i + 1]))

    for (const row of rows) {
      const dynRank       = dynRankMap.get(row.player_id)
      const ktcRank       = ktcRankMap.get(row.player_id)
      const divergence    = ktcRank - dynRank
      const divergencePct = (divergence / positionDepth) * 100

      let divergenceSignal = null
      if      (divergencePct >  25) divergenceSignal = 'undervalued'
      else if (divergencePct < -25) divergenceSignal = 'overvalued'

      divergenceMap.set(row.player_id, { divergence, divergencePct, divergenceSignal, dynRank, ktcRank, positionDepth })
    }
  }

  return playerRows.map(row => {
    const d = divergenceMap.get(row.player_id)
    return d ? { ...row, ...d } : row
  })
}

// ---------------------------------------------------------------------------
// KTC position percentile
// ---------------------------------------------------------------------------

// Returns the percentile (0–100) of this player's KTC value within their
// position group. Returns null if the player has no KTC value or fewer than
// 5 players at that position have KTC values.
export function computeKTCPositionPercentile(playerId, position, ktcMap, playersMap) {
  if (!ktcMap?.size) return null

  const playerValue = ktcMap.get(playerId)?.value
  if (playerValue == null) return null

  const positionValues = []
  for (const [id, entry] of ktcMap.entries()) {
    if (playersMap[id]?.position === position) positionValues.push(entry.value)
  }

  if (positionValues.length < 5) return null

  positionValues.sort((a, b) => a - b)
  let below = 0
  for (const v of positionValues) { if (v < playerValue) below++ }
  return Math.round((below / positionValues.length) * 100)
}

// ---------------------------------------------------------------------------
// Prospect scoring
// ---------------------------------------------------------------------------

const POSITION_PRIOR_PPG = { QB: 14, RB: 12, WR: 9, TE: 7 }

function ageMultiplier(age) {
  if (age <= 21) return 1.20
  if (age === 22) return 1.10
  if (age === 23) return 1.00
  if (age === 24) return 0.88
  return 0.75
}

function draftMultiplier(pick) {
  // No draft data = mild pessimism: player was implicitly passed over by the market.
  if (!pick) return 0.75
  const { round, pick: pickNo } = pick
  if (round === 1 && pickNo <= 3)  return 1.30
  if (round === 1 && pickNo <= 8)  return 1.15
  if (round === 1 && pickNo <= 12) return 1.05
  // pick_no is the overall pick number, so round-1 picks 13+ in >12-team leagues would otherwise fall through to the R4+ tier.
  if (round === 1)                 return 1.05
  if (round === 2)                 return 0.90
  if (round === 3)                 return 0.78
  return 0.65
}

// Normalises a PPG against the position peak (0–1 scale, clamped).
function normalisePPG(ppg, peakPPG) {
  return Math.min(ppg / Math.max(peakPPG, 1), 1)
}

export function computeProspectScore(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPercentile = null) {
  const position = player.position
  const age      = player.age ?? 23
  const priorPPG = (POSITION_PRIOR_PPG[position] ?? 9) * ageMultiplier(age) * draftMultiplier(dynastyDraftPick)
  const peakPPG  = positionPeakPPG?.[position] ?? 20

  let prospectScore = normalisePPG(priorPPG, peakPPG) * 100

  let gamesPlayed = 0
  if (currentSeasonStats && (currentSeasonStats.gamesPlayed ?? 0) > 0) {
    if (!Number.isFinite(currentSeasonStats.gamesPlayed) || !Number.isFinite(currentSeasonStats.fantasyPoints)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[prospectScore] non-finite current-season totals — evidence blend skipped: player=${player.player_id ?? player.full_name} gp=${currentSeasonStats.gamesPlayed} fp=${currentSeasonStats.fantasyPoints}`)
      }
    } else {
      gamesPlayed = currentSeasonStats.gamesPlayed
      const evidenceWeight = Math.min(gamesPlayed, 12)
      const priorWeight    = 8
      const evidencePPG    = currentSeasonStats.fantasyPoints / gamesPlayed
      const blendedPPG     = (priorPPG * priorWeight + evidencePPG * evidenceWeight) / (priorWeight + evidenceWeight)
      prospectScore = normalisePPG(blendedPPG, peakPPG) * 100
    }
  }

  // KTC blend: when available, dynasty manager consensus anchors 60% of the score
  const ktcInfluenced = ktcPercentile != null
  if (ktcInfluenced) {
    prospectScore = ktcPercentile * 0.60 + prospectScore * 0.40
  }

  // No-market-signal cap.
  // The position priors assume an NFL-starter baseline. Applying that prior to
  // a player with no KTC value AND no premium dynasty draft capital (R1 or R2)
  // gives random Day 3 / UDFA picks the same score as legitimate prospects.
  // Cap the score in that case so they can't ranked alongside true prospects.
  const hasPremiumPick = dynastyDraftPick != null && dynastyDraftPick.round <= 2
  const hasMarketSignal = ktcInfluenced || hasPremiumPick
  if (!hasMarketSignal) {
    prospectScore = Math.min(prospectScore, 35)
  }

  if (process.env.NODE_ENV !== 'production') {
    const dm = draftMultiplier(dynastyDraftPick)
    const am = ageMultiplier(age)
    const pickStr = dynastyDraftPick ? `R${dynastyDraftPick.round}P${dynastyDraftPick.pick}` : 'none'
    console.log(
      `[prospectScore] ${player.full_name ?? player.player_id} (${position}): ` +
      `age=${age}, pick=${pickStr}, ageMult=${am.toFixed(2)}, draftMult=${dm.toFixed(2)}, ` +
      `priorPPG=${priorPPG.toFixed(1)}, ktcPct=${ktcPercentile ?? 'n/a'}, score=${Math.round(prospectScore)}`
    )
  }

  return {
    score:        Math.round(prospectScore),
    gamesPlayed,
    isRookie:     true,
    draftCapital: dynastyDraftPick ?? null,
    ktcInfluenced,
  }
}

// ---------------------------------------------------------------------------
// Weighted linear regression (trajectory)
// ---------------------------------------------------------------------------

function weightedLinearRegression(xs, ys) {
  // More recent seasons get higher weight: index+1 (so season 1 of N gets weight 1, last gets N)
  const n = xs.length
  const ws = xs.map((_, i) => i + 1)
  const wSum  = ws.reduce((a, b) => a + b, 0)
  const wxSum = ws.reduce((s, w, i) => s + w * xs[i], 0)
  const wySum = ws.reduce((s, w, i) => s + w * ys[i], 0)
  const wxxSum = ws.reduce((s, w, i) => s + w * xs[i] * xs[i], 0)
  const wxySum = ws.reduce((s, w, i) => s + w * xs[i] * ys[i], 0)
  const denom = wSum * wxxSum - wxSum * wxSum
  if (Math.abs(denom) < 1e-10) return 0
  return (wSum * wxySum - wxSum * wySum) / denom
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ---------------------------------------------------------------------------
// Recency-weighted PPG helper (used for current-level percentile ranking)
// ---------------------------------------------------------------------------

// Returns lastSeasonPPG * 0.70 + priorSeasonPPG * 0.30 when ≥ 2 qualifying
// seasons exist, otherwise falls back to the single qualifying season PPG.
// A qualifying season requires gamesPlayed ≥ 8.
function recencyWeightedPPG(playerId, careerStats, allSeasons) {
  const qualifying = allSeasons
    .map(season => {
      const d = careerStats[season]?.[playerId]
      if (!d) return null
      const gpRaw = d.gamesPlayed ?? 0
      if (!Number.isFinite(gpRaw) || gpRaw < 8 || !Number.isFinite(d.fantasyPoints)) return null
      return d.fantasyPoints / d.gamesPlayed
    })
    .filter(v => v != null)

  if (qualifying.length === 0) return 0
  if (qualifying.length === 1) return qualifying[0]
  const last  = qualifying[qualifying.length - 1]
  const prior = qualifying[qualifying.length - 2]
  return last * 0.70 + prior * 0.30
}

// ---------------------------------------------------------------------------
// Main dynasty score
// ---------------------------------------------------------------------------

export function computeDynastyScore(
  playerId, playersMap, careerStats, empiricalCurves,
  positionPeakPPG, dynastyDraftPick, scoringSettings, ktcMap = null, teamContext = null, depthMap = null,
  historicalShares = null
) {
  const player   = playersMap[playerId]
  const position = player?.position
  const age      = player?.age ?? null
  const yearsExp = player?.years_exp ?? null

  // Skip non-skill positions
  if (!player || !SKILL_POSITIONS.has(position)) {
    return { score: null, label: 'N/A', confidence: 'none', isRookie: false, components: null, signals: null }
  }

  const peakPPG = positionPeakPPG?.[position] ?? 20
  const curve   = empiricalCurves?.[position] ?? []

  // Derive the capped peak age (mirrors the logic in computeEmpiricalAgeCurves)
  // so we can compute yearsFromPeak for the late-career label gate.
  const derivedCurvePeakAge = curve.length > 0
    ? curve.reduce((best, p) => p.medianPPG > best.medianPPG ? p : best, curve[0]).age
    : null
  const positionAgeCap = PEAK_AGE_CAPS[position] ?? null
  const peakAge = derivedCurvePeakAge != null
    ? (positionAgeCap != null ? Math.min(derivedCurvePeakAge, positionAgeCap) : derivedCurvePeakAge)
    : null
  const yearsFromPeak = peakAge != null && age != null ? age - peakAge : null
  const isLateCareer  = yearsFromPeak != null && yearsFromPeak >= 5

  // Build season history (gamesPlayed ≥ 8), sorted oldest → newest
  const allSeasons = Object.keys(careerStats).map(Number).sort()
  const seasonHistory = allSeasons
    .map(season => {
      const d = careerStats[season]?.[playerId]
      if (!d) return null
      const gpRaw = d.gamesPlayed ?? 0
      if (Number.isFinite(gpRaw) && gpRaw < 8) return null
      if (!Number.isFinite(gpRaw) || !Number.isFinite(d.fantasyPoints)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[dynastyScore] non-finite season totals skipped: player=${playerId} season=${season} gp=${d.gamesPlayed} fp=${d.fantasyPoints}`)
        }
        return null
      }
      return { season, ppg: d.fantasyPoints / d.gamesPlayed, gamesPlayed: gpRaw, fantasyPoints: d.fantasyPoints }
    })
    .filter(Boolean)

  const mostRecentSeason = allSeasons[allSeasons.length - 1]
  const currentSeasonData = careerStats[mostRecentSeason] ?? {}
  const currentSeasonStats = currentSeasonData[playerId] ?? null

  // KTC percentile within position — used by prospect paths A and B
  const ktcPct = computeKTCPositionPercentile(playerId, position, ktcMap, playersMap)

  // ── PATH A: True prospect ────────────────────────────────────────────────
  // years_exp ≤ 1, OR years_exp ≤ 3 with no qualifying seasons AND KTC-valued
  // (the market still treats them as a development asset).
  const hasKTC = ktcMap?.has?.(playerId) ?? false
  const isTrueProspect =
    (yearsExp != null && yearsExp <= 1) ||
    (yearsExp != null && yearsExp <= 3 && seasonHistory.length === 0 && hasKTC)

  if (isTrueProspect) {
    const prospect = computeProspectScore(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPct)
    const ps = prospect.score
    const dc = prospect.draftCapital

    let label
    if      (ps >= 70 && age <= 22) label = 'Elite Prospect'
    else if (ps >= 70 && age <= 24) label = 'High Prospect'
    else if (ps >= 50)              label = 'Prospect'
    else if (dc)                    label = 'Late Prospect'
    else                            label = 'Unranked Prospect'

    return {
      score:      ps,
      label,
      confidence: 'prospect',
      isRookie:   true,
      components: null,
      signals: {
        isBreakout:     false,
        isBounceBack:   false,
        isProspect:     true,
        draftCapital:   dc,
        gamesPlayed:    prospect.gamesPlayed,
        seasonsOfData:  0,
        ageCurveFactor: null,
        peakSeason:     null,
        ktcInfluenced:  prospect.ktcInfluenced,
      },
    }
  }

  // ── PATH A2: Unproven veteran ────────────────────────────────────────────
  // years_exp ≥ 2 with zero qualifying seasons — the player has had time and
  // has not produced. That is information, not unknown. KTC can rescue
  // the score slightly if the market sees value.
  if (yearsExp != null && yearsExp >= 2 && seasonHistory.length === 0) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
    return {
      score,
      label:      'Limited Data',
      confidence: 'none',
      isRookie:   false,
      components: null,
      signals: {
        isBreakout:     false,
        isBounceBack:   false,
        isProspect:     false,
        isUnprovenVet:  true,
        draftCapital:   null,
        gamesPlayed:    currentSeasonStats?.gamesPlayed ?? 0,
        seasonsOfData:  0,
        ageCurveFactor: null,
        peakSeason:     null,
        ktcInfluenced:  ktcPct != null,
      },
    }
  }

  // ── PATH A3: Stale data ──────────────────────────────────────────────────
  // The player has qualifying seasons in history, but the most recent one is
  // ≥ 2 seasons old. Component scoring would credit those stale seasons as if
  // they were current, producing inflated ranks for inactive players.
  // Treat as "Limited Data" — KTC can still rescue the score slightly.
  const lastQS = seasonHistory[seasonHistory.length - 1]?.season ?? null
  const seasonsSinceLastQS = lastQS != null ? mostRecentSeason - lastQS : Infinity
  if (seasonHistory.length > 0 && seasonsSinceLastQS >= 2) {
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
    return {
      score,
      label:      'Limited Data',
      confidence: 'none',
      isRookie:   false,
      components: null,
      signals: {
        isBreakout:     false,
        isBounceBack:   false,
        isProspect:     false,
        isStaleData:    true,
        lastQualifyingSeason: lastQS,
        seasonsSinceLastQS,
        draftCapital:   null,
        gamesPlayed:    currentSeasonStats?.gamesPlayed ?? 0,
        seasonsOfData:  seasonHistory.length,
        ageCurveFactor: null,
        peakSeason:     null,
        ktcInfluenced:  ktcPct != null,
      },
    }
  }

  // ── PATH A4: Data gap ─────────────────────────────────────────────────────
  // No qualifying seasons and none of the routing gates above matched (e.g.
  // years_exp == null in Sleeper metadata). Without this guard the components
  // block below dereferences seasonHistory[-1] → TypeError inside the
  // playerRows useMemo. Degrade to the A2 "Limited Data" contract.
  if (seasonHistory.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[dynastyScore] zero qualifying seasons fell through routing gates (years_exp=${yearsExp}): player=${playerId} → Limited Data`)
    }
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
    return {
      score,
      label:      'Limited Data',
      confidence: 'none',
      isRookie:   false,
      components: null,
      signals: {
        isBreakout:     false,
        isBounceBack:   false,
        isProspect:     false,
        isDataGap:      true,
        draftCapital:   null,
        gamesPlayed:    Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
        seasonsOfData:  0,
        ageCurveFactor: null,
        peakSeason:     null,
        ktcInfluenced:  ktcPct != null,
      },
    }
  }

  // ── Components (Paths B and C) ────────────────────────────────────────────

  // A. Age-adjusted
  const expectedMedianPPG = age != null ? interpolateAgeCurve(curve, age) : peakPPG * 0.7
  const ageFactor = expectedMedianPPG / peakPPG
  const currentPPG = seasonHistory[seasonHistory.length - 1].ppg
  const rawRatio = ageFactor > 0 ? (currentPPG / peakPPG) / ageFactor : 0
  const ageAdjScore = clamp(rawRatio * 50, 0, 100)

  // B. Trajectory (weighted linear regression over normalised PPG)
  // NOTE: trajectory is intentionally NOT shared with regressionSignals.computeTrajectory —
  // that helper floors the denominator at max(meanPPG, 4) for the projection; dynasty uses
  // unfloored slope/meanPPG. See docs/dynasty-scoring.md. Do not dedup.
  const ppgs = seasonHistory.map(s => s.ppg)
  const meanPPG = ppgs.reduce((a, b) => a + b, 0) / ppgs.length
  const xs = seasonHistory.map((_, i) => i)
  const slope = weightedLinearRegression(xs, ppgs)
  const normalizedSlope = meanPPG > 0 ? slope / meanPPG : 0
  const trajectoryScore = clamp(50 + normalizedSlope * 150, 0, 100)

  // Momentum signal — only when ≥ 4 qualifying seasons exist (see momentum.js)
  const { momentum, momentumLabel } = computeMomentum(ppgs, meanPPG)

  // C. Current level — recency-weighted PPG percentile among same position.
  // Both the target player and every peer in the pool use the same weighted
  // formula so the comparison is on a consistent basis.
  const rankingPPG = recencyWeightedPPG(playerId, careerStats, allSeasons)
  const positionRankingPPGs = Object.entries(currentSeasonData)
    .filter(([id, d]) => {
      const p = playersMap[id]
      return p && p.position === position && (d.gamesPlayed ?? 0) >= 8
    })
    .map(([id]) => recencyWeightedPPG(id, careerStats, allSeasons))
    .filter(v => v > 0)
    .sort((a, b) => a - b)
  const currentLevelScore = percentileRank(positionRankingPPGs, rankingPPG)

  // D. Reliability = consistency (CV-based) × 0.45 + durability (games played) × 0.55

  // Consistency sub-score (CV-based); shared formula in regressionSignals.js.
  // Helper returns null for < 3 qualifying seasons → preserve the inline default of 50.
  const { consistencyScore: consistencyRaw } = computeConsistency(ppgs)
  const consistencyScore = consistencyRaw ?? 50

  // Durability sub-score — uses ALL seasons in careerStats with recency weighting
  const allPlayerSeasons = allSeasons
    .map((season, idx) => {
      const d = careerStats[season]?.[playerId]
      return d && (d.gamesPlayed ?? 0) > 0
        ? { gamesPlayed: d.gamesPlayed, dnpWeeks: d.dnpWeeks ?? 0, weight: idx + 1 }
        : null
    })
    .filter(Boolean)

  let durabilityScore = 50
  let injurySeasonCount = 0
  if (allPlayerSeasons.length > 0) {
    const totalWeight     = allPlayerSeasons.reduce((s, { weight }) => s + weight, 0)
    const weightedAvgGames = allPlayerSeasons.reduce((s, { gamesPlayed, weight }) => s + gamesPlayed * weight, 0) / totalWeight
    // A season is injury-affected only when the low-games trigger is backed by
    // positive evidence the player was a meaningful contributor (this season or
    // an adjacent one) — distinguishes "couldn't play" from "wasn't the guy".
    // Iterates allSeasons (not the derived allPlayerSeasons array) so the season
    // number is available for classifyInjurySeason; gp===0 present-but-benched
    // seasons (dnp≥3) are intentionally included — a full-season IR for a prior
    // contributor counts via the adjacent-season rescue.
    // See src/utils/durabilitySignals.js and docs/dynasty-scoring.md → Reliability.
    injurySeasonCount = allSeasons.filter(
      season => classifyInjurySeason(careerStats, playerId, position, season)
    ).length
    let base = clamp((weightedAvgGames / 17) * 100, 0, 100)
    if      (injurySeasonCount >= 3) base *= 0.70
    else if (injurySeasonCount >= 2) base *= 0.85
    durabilityScore = Math.round(base)
  }

  const reliabilityScore = Math.round(consistencyScore * 0.45 + durabilityScore * 0.55)

  // E. Opportunity quality (efficiency × volume × share, position-specific)
  const playerShare = teamContext?.playerShares?.[playerId] ?? null
  const { opportunityScore: rawOpportunityScore, efficiencyPercentile, volumePercentile, shareScore } =
    computeOpportunityQuality(playerId, position, seasonHistory, careerStats, playersMap, playerShare)

  // Depth chart multiplier — only if depth_chart_order data is available
  const depthOrder = depthMap?.[playerId]?.depthOrder ?? null
  let depthMultiplier = 1.0
  if      (depthOrder === 1) depthMultiplier = 1.15
  else if (depthOrder === 2) depthMultiplier = 0.90
  else if (depthOrder >= 3)  depthMultiplier = 0.70

  const depthAdjustedOQ = depthOrder != null
    ? Math.round(clamp(rawOpportunityScore * depthMultiplier, 0, 100))
    : rawOpportunityScore

  // Share trend boost — historical carry/target share trajectory
  const shareTrend = historicalShares ? computeShareTrend(historicalShares[playerId]) : null
  const shareTrendBoost = shareTrend
    ? shareTrend.shareTrendLabel === 'growing'   ?  8
    : shareTrend.shareTrendLabel === 'expanding' ?  4
    : shareTrend.shareTrendLabel === 'shrinking' ? -4
    : shareTrend.shareTrendLabel === 'declining' ? -8
    : 0
    : 0
  const opportunityScore = Math.round(clamp(depthAdjustedOQ + shareTrendBoost, 0, 100))

  // ── TD dependency signal ───────────────────────────────────────────────────
  // Uses the most recent qualifying season's raw stat totals + scoringSettings.
  const mostRecentQualifyingSeason = seasonHistory[seasonHistory.length - 1].season
  const mostRecentRawStats = careerStats[mostRecentQualifyingSeason]?.[playerId]?.stats ?? {}
  const mostRecentTotalFP  = seasonHistory[seasonHistory.length - 1].fantasyPoints

  const { tdDependency: tdDependencyRaw, isTdReliant } =
    computeTdReliance(mostRecentRawStats, mostRecentTotalFP, scoringSettings)
  const tdDependency = tdDependencyRaw ?? 0   // helper returns null when scoringSettings is falsy; inline used 0

  // Apply reliability penalty when TD-reliant — volatile scoring inflates consistency
  const effectiveReliability = isTdReliant
    ? Math.round(reliabilityScore * 0.90)
    : reliabilityScore

  // ── Composite ─────────────────────────────────────────────────────────────
  let componentScore = Math.round(
    ageAdjScore        * 0.28 +
    trajectoryScore    * 0.25 +
    currentLevelScore  * 0.22 +
    effectiveReliability * 0.10 +
    opportunityScore   * 0.15
  )

  // PATH B: blend with prospect prior
  let confidence
  let finalScore = componentScore
  let pathBKtcInfluenced = false
  if (seasonHistory.length <= 2) {
    const prospect = computeProspectScore(player, dynastyDraftPick, currentSeasonStats, positionPeakPPG, ktcPct)
    finalScore = Math.round(prospect.score * 0.4 + componentScore * 0.6)
    pathBKtcInfluenced = prospect.ktcInfluenced
    confidence = 'low'
  } else {
    confidence = seasonHistory.length <= 4 ? 'moderate' : 'high'
  }

  if (!Number.isFinite(finalScore)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[dynastyScore] non-finite finalScore (componentScore=${componentScore}): player=${playerId} → Limited Data`)
    }
    const score = Math.round(15 + (ktcPct ?? 0) * 0.20)
    return {
      score,
      label:      'Limited Data',
      confidence: 'none',
      isRookie:   false,
      components: null,
      signals: {
        isBreakout:     false,
        isBounceBack:   false,
        isProspect:     false,
        isNonFinite:    true,
        draftCapital:   null,
        gamesPlayed:    Number.isFinite(currentSeasonStats?.gamesPlayed) ? currentSeasonStats.gamesPlayed : 0,
        seasonsOfData:  seasonHistory.length,
        ageCurveFactor: null,
        peakSeason:     null,
        ktcInfluenced:  ktcPct != null,
      },
    }
  }

  // ── Special signals ───────────────────────────────────────────────────────
  const isBreakout   = computeBreakoutFlag(age, currentPPG, curve, peakPPG)
  const isBounceBack = computeBounceBackFlag(seasonHistory)

  const peakEntry = seasonHistory.reduce((best, s) => s.ppg > (best?.ppg ?? 0) ? s : best, null)
  const peakSeason = peakEntry ? { season: peakEntry.season, ppg: Math.round(peakEntry.ppg * 10) / 10 } : null

  // ── Label ─────────────────────────────────────────────────────────────────
  let label

  // Late-career gate: player ≥ 5 years past their position's capped peak age.
  // Bypasses the standard label logic — peak-era labels (Elite, Peak Window, etc.)
  // are misleading for genuinely post-peak players regardless of their current score.
  if (isLateCareer) {
    label = finalScore >= 55 ? 'Veteran Producer'
          : finalScore >= 40 ? 'Managed Decline'
          : finalScore >= 20 ? 'Sell Now'
          : 'Fading'
  } else if (isBreakout) {
    label = 'Breakout'
  } else if (isBounceBack) {
    label = 'Bounce-back'
  } else if (finalScore >= 80) {
    label = 'Elite'
  } else if (finalScore >= 70 && slope > 0) {
    label = 'Ascending Star'
  } else if (finalScore >= 70) {
    label = 'Peak Window'
  } else if (finalScore >= 55 && age != null && age <= 25) {
    label = 'Developing'
  } else if (finalScore >= 55 && slope > 0) {
    label = 'Rising'
  } else if (finalScore >= 55) {
    label = 'Solid Floor'
  } else if (finalScore >= 40 && slope >= 0) {
    label = 'Plateau'
  } else if (finalScore >= 40) {
    label = 'Managed Decline'
  } else if (finalScore >= 20) {
    label = 'Sell Now'
  } else {
    label = 'Fading'
  }

  // Depth 3+ label gate: deep backups can't justify labels above "Solid Floor"
  if (depthOrder != null && depthOrder >= 3) {
    const LABELS_ABOVE_FLOOR = new Set(['Elite', 'Ascending Star', 'Peak Window', 'Developing', 'Rising', 'Breakout', 'Bounce-back'])
    if (LABELS_ABOVE_FLOOR.has(label)) label = 'Solid Floor'
  }

  return {
    score:      finalScore,
    label,
    confidence,
    isRookie:   false,
    components: {
      ageAdjusted:  { value: Math.round(ageAdjScore) },
      trajectory:   { value: Math.round(trajectoryScore), slope: Math.round(normalizedSlope * 1000) / 1000 },
      currentLevel: { value: currentLevelScore, percentile: currentLevelScore },
      reliability:  { value: reliabilityScore, consistencyScore: Math.round(consistencyScore), durabilityScore },
      opportunityQuality: { value: opportunityScore, efficiencyPercentile, volumePercentile, shareScore },
    },
    signals: {
      isBreakout,
      isBounceBack,
      isProspect:        false,
      draftCapital:      dynastyDraftPick ?? null,
      seasonsOfData:     seasonHistory.length,
      ageCurveFactor:    Math.round(ageFactor * 100) / 100,
      peakSeason,
      injurySeasonCount,
      durabilityScore,
      consistencyScore:  Math.round(consistencyScore),
      tdDependency:      Math.round(tdDependency * 1000) / 1000,
      isTdReliant,
      momentum:          momentum != null ? Math.round(momentum * 1000) / 1000 : null,
      momentumLabel,
      peakAge,
      yearsFromPeak,
      isLateCareer,
      ktcInfluenced:     pathBKtcInfluenced,
      carryShare:        playerShare?.carryShare  ?? null,
      targetShare:       playerShare?.targetShare ?? null,
      teamOffenseRank:   playerShare?.teamOffenseRank ?? null,
      depthOrder,
      depthMultiplier:   depthOrder != null ? depthMultiplier : null,
      shareTrendLabel:   shareTrend?.shareTrendLabel   ?? null,
      shareVolatility:   shareTrend?.volatilityLabel   ?? null,
      currentShare:      shareTrend?.recentShare       ?? null,
      shareHistory:      historicalShares?.[playerId]?.slice(-5) ?? null,
    },
  }
}
