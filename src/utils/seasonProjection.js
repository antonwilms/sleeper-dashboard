import { computeKTCPositionPercentile } from './dynastyScore'
import { interpolateAgeCurve } from './ageCurve'
import { computeShareTrend } from './teamContext'
import { computeMomentum } from './momentum'
import { computeBreakoutFlag, computeBounceBackFlag, computeTdReliance } from './projectionSignals'
import { computeTrajectory, computeConsistency } from './regressionSignals'
import { computeCompBlend } from './compsIntegration'
import { computeEfficiencyFactor } from './efficiencyMetrics'
import { computeUsageFactors } from './usageMetrics'
import { computeTeamRzShareFactor } from './teamRzShare'
import { computeKtcSignals } from './ktcHistory'
import { getCategoryPoints } from './fantasyPoints'

// ---------------------------------------------------------------------------
// Next-season projection
//
// Predicts a player's PPG and total points for the upcoming season by
// combining recent production with age curve, share trend, regression,
// durability, team context, and depth chart signals.
// ---------------------------------------------------------------------------

const ROOKIE_BASELINE_PPG = { QB: 13, RB: 9, WR: 7, TE: 5 }
const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

// Position-aware primary / secondary category mapping for multiplicity (C3).
const POS_PRIMARY   = { QB: 'pass', RB: 'rush', WR: 'rec', TE: 'rec' }
const POS_SECONDARY = { QB: 'rush', RB: 'rec',  WR: 'rush', TE: 'rush' }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ---------------------------------------------------------------------------
// NFL draft-slot factor (D1)
//
// Multiplier table derived from dynasty hit-rate analysis (see task file
// projection-d1-nfl-draft-slot.md §Multiplier table for full justification).
//
// Called only from rookieProjection. Returns an object with all 5 diagnostic
// fields; when draftMatch is null/undefined every field is a neutral sentinel.
// ---------------------------------------------------------------------------
function resolveNflDraftFactor(draftMatch) {
  if (!draftMatch) {
    return {
      nflDraftMultiplier:  1.0,
      nflDraftRound:       null,
      nflDraftPick:        null,
      nflDraftTier:        null,
      nflDraftMatchSource: 'unmatched',
    }
  }
  const { round, pick } = draftMatch
  let mult, tier
  if      (round === 1 && pick <= 3)   { mult = 1.30; tier = 'top-3'   }
  else if (round === 1 && pick <= 8)   { mult = 1.18; tier = 'top-8'   }
  else if (round === 1 && pick <= 15)  { mult = 1.10; tier = 'r1-mid'  }
  else if (round === 1)                { mult = 1.02; tier = 'r1-late' }
  else if (round === 2)                { mult = 0.92; tier = 'r2'      }
  else if (round === 3)                { mult = 0.82; tier = 'r3'      }
  else if (round === 4)                { mult = 0.74; tier = 'r4'      }
  else if (round === 5)                { mult = 0.68; tier = 'r5'      }
  else if (round === 6)                { mult = 0.62; tier = 'r6'      }
  else                                 { mult = 0.58; tier = 'r7'      }
  return {
    nflDraftMultiplier:  mult,
    nflDraftRound:       round,
    nflDraftPick:        pick,
    nflDraftTier:        tier,
    nflDraftMatchSource: 'matched',
  }
}

// ---------------------------------------------------------------------------
// Rookie / first-year projection — used when no qualifying seasons exist
// ---------------------------------------------------------------------------
function rookieProjection(player, playerId, yearsExp, ktcMap, playersMap, collegeStats, positionPeakPPG, nflDraftMatches) {
  const position = player.position
  const age      = player.age ?? 23
  const baseline = ROOKIE_BASELINE_PPG[position] ?? 7

  // Draft-age input correction (Projection C3).
  // Only meaningful for actual rookies (years_exp ≤ 1); for older rookie-path
  // hits (e.g. year-4 player with no qualifying seasons) current age is correct.
  let rookieAgeAtDraft = null
  if (yearsExp != null && yearsExp <= 1) {
    const candidate = age - yearsExp
    if (candidate >= 18 && candidate <= 28) rookieAgeAtDraft = candidate
  }
  const ageForLookup = rookieAgeAtDraft ?? age

  // Age multiplier — lookup table unchanged; only the input expression changes.
  let ageMult
  if      (ageForLookup <= 21) ageMult = 1.15
  else if (ageForLookup === 22) ageMult = 1.05
  else if (ageForLookup === 23) ageMult = 0.95
  else                          ageMult = 0.82

  // KTC market-percentile multiplier
  let ktcMult = 1.0
  let ktcPct  = null
  if (ktcMap?.has?.(playerId)) {
    ktcPct  = computeKTCPositionPercentile(playerId, position, ktcMap, playersMap)
    if (ktcPct != null) ktcMult = 0.70 + (ktcPct / 100) * 0.60
  }

  // ── College composite ────────────────────────────────────────────────────
  const cm = collegeStats?.[playerId]

  // collegeBase — existing 3-bucket peakDominator multiplier, preserved verbatim.
  let collegeBase = 1.0
  if (cm?.peakDominator != null) {
    const dom = cm.peakDominator
    collegeBase = dom >= 30 ? 1.20 : dom >= 20 ? 1.08 : 0.92
  }

  // productionTrend adjust
  const productionTrend = cm?.productionTrend ?? null
  const productionTrendAdjust = ({
    improving:       0.05,
    'peak-final':    0.00,
    declining:      -0.07,
    'single-season': -0.02,
  })[productionTrend] ?? 0.00

  // finalYearDominator adjust — only with 2+ college seasons and a valid peak.
  const finalYearDominator = cm?.finalYearDominator ?? null
  let finalYearAdjust = 0.00
  if ((cm?.seasonsPlayed ?? 0) >= 2 && finalYearDominator != null
      && cm?.peakDominator != null && cm.peakDominator > 0) {
    const r = finalYearDominator / cm.peakDominator
    if      (r >= 0.85) finalYearAdjust =  0.03
    else if (r <  0.55) finalYearAdjust = -0.05
  }

  const collegeMult = clamp(collegeBase + productionTrendAdjust + finalYearAdjust, 0.80, 1.26)

  // breakoutAge — separate (independent) factor.
  const breakoutAge = cm?.breakoutAge ?? null
  let breakoutAgeFactor = 1.00
  if (breakoutAge != null && breakoutAge >= 17 && breakoutAge <= 24) {
    breakoutAgeFactor = breakoutAge <= 19 ? 1.05
                      : breakoutAge === 20 ? 1.02
                      : breakoutAge === 21 ? 1.00
                      : breakoutAge === 22 ? 0.98
                      : 0.96   // 23–24
  }

  // collegeContribution — total college effect, explicitly bounded to ±25%.
  const collegeContribution = clamp(collegeMult * breakoutAgeFactor, 0.75, 1.25)

  // ── NFL draft slot (D1) ──────────────────────────────────────────────────
  const draftMatch = nflDraftMatches?.[playerId] ?? null
  const {
    nflDraftMultiplier,
    nflDraftRound,
    nflDraftPick,
    nflDraftTier,
    nflDraftMatchSource,
  } = resolveNflDraftFactor(draftMatch)

  // Cumulative-effect cap on all four non-baseline multipliers.
  // Natural product range (pre-D1): [0.82×0.70×0.75, 1.15×1.30×1.25] = [0.43, 1.87].
  // Post-D1 with nflDraftMultiplier: [0.249, 2.43]. Clamp [0.45, 1.85] binds at the
  // extreme tails (~1–3% of rookies) without constraining the middle 95%.
  // Mirrors the vet-path combinedNewFactor clamp from B1a/B1b/B2/C1.
  const rookieMultiplierProductRaw =
    ageMult * ktcMult * collegeContribution * nflDraftMultiplier
  const rookieMultiplierProduct = clamp(rookieMultiplierProductRaw, 0.45, 1.85)

  const projectedPPG    = clamp(baseline * rookieMultiplierProduct, 0, 40)
  const projectedGames  = 14
  const projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10

  // Build adjustment summary
  const adjustmentSummary = []
  if (ageMult >= 1.05)    adjustmentSummary.push('Young rookie ↑')
  if (ageMult <= 0.90)    adjustmentSummary.push('Older rookie ↓')
  if (ktcMult > 1.10)     adjustmentSummary.push('High KTC ranking ↑')
  if (ktcMult < 0.90)     adjustmentSummary.push('Low KTC ranking ↓')
  if (collegeMult >= 1.20) adjustmentSummary.push('College dominator ↑')
  if (collegeMult < 1.00) adjustmentSummary.push('Modest college production ↓')
  if (productionTrend === 'improving')  adjustmentSummary.push('College production improving ↑')
  if (productionTrend === 'declining')  adjustmentSummary.push('College production declining ↓')
  if (breakoutAgeFactor > 1.0)          adjustmentSummary.push('Early college breakout ↑')
  if (breakoutAgeFactor < 1.0)          adjustmentSummary.push('Late college breakout ↓')
  // D1 draft-slot summary lines
  if (nflDraftTier === 'top-3')                               adjustmentSummary.push('Top-3 NFL draft pick ↑↑')
  if (nflDraftTier === 'top-8' || nflDraftTier === 'r1-mid') adjustmentSummary.push('Early Round 1 NFL pick ↑')
  if (nflDraftTier === 'r1-late' || nflDraftTier === 'r2')   adjustmentSummary.push('Day 2 NFL capital ↑')
  if (nflDraftTier === 'r6'    || nflDraftTier === 'r7')     adjustmentSummary.push('Late-round NFL pick ↓')

  return {
    projectedPPG:      Math.round(projectedPPG * 10) / 10,
    projectedGames,
    projectedTotalPts,
    confidence: 'rookie',
    factors: {
      basePPG:              baseline,
      ageDelta:             ageMult,
      shareTrend:           1.0,
      regressionFactor:     1.0,
      durabilityFactor:     projectedGames / 17,
      teamFactor:           1.0,
      depthFactor:          1.0,
      ktcMult,
      collegeMult:          Math.round(collegeMult * 1000) / 1000,
      ktcPct,
      collegeBase:          Math.round(collegeBase * 1000) / 1000,
      productionTrend,
      productionTrendAdjust,
      finalYearDominator,
      finalYearAdjust,
      breakoutAge,
      breakoutAgeFactor:    Math.round(breakoutAgeFactor * 1000) / 1000,
      collegeContribution:  Math.round(collegeContribution * 1000) / 1000,
      rookieAgeAtDraft,
      positionMultiplicityRatio: null,
      primaryCategory:           null,
      primaryCategoryPoints:     null,
      secondaryCategoryPoints:   null,
      // D1 — NFL draft slot
      nflDraftMultiplier,
      nflDraftRound,
      nflDraftPick,
      nflDraftTier,
      nflDraftMatchSource,
      rookieMultiplierProduct: Math.round(rookieMultiplierProduct * 1000) / 1000,
      // aDOT capture-only — always null on rookie path (no prior-season stats)
      adot:           null,
      adotDelta:      null,
      adotSampleSize: null,
      // D3 — team-aggregated red-zone share (schema-consistency sentinels; rookie path out of scope)
      teamRzShare:         null,
      teamRzShareFactor:   1.0,
      teamRzShareCategory: null,
    },
    adjustmentSummary,
  }
}

// ---------------------------------------------------------------------------
// Main projection
// ---------------------------------------------------------------------------
export function computeNextSeasonProjection({
  playerId,
  playersMap,
  careerStats,
  empiricalCurves,
  positionPeakPPG,
  historicalShares,
  depthMap,
  teamContext,
  scoringSettings,
  ktcMap,
  collegeStats,
  currentSeason,
  qbQualityByTeam = null,
  ktcHistory = null,
  nflDraftMatches = null,
  historicalTeamTotals = null,
}) {
  const player = playersMap?.[playerId]
  if (!player || !SKILL.has(player.position)) return null

  const position = player.position
  const yearsExp = player.years_exp ?? null

  // ── Step 1: Qualifying seasons ──────────────────────────────────────────
  const allSeasons = Object.keys(careerStats ?? {}).map(Number).sort()
  const qualifying = allSeasons
    .map(s => {
      const d = careerStats?.[s]?.[playerId]
      if (!d || (d.gamesPlayed ?? 0) < 8) return null
      return {
        season: s,
        ppg:    d.fantasyPoints / d.gamesPlayed,
        gamesPlayed: d.gamesPlayed,
        dnpWeeks:    d.dnpWeeks ?? 0,
      }
    })
    .filter(Boolean)

  // Compute historical KTC signals once; used by both veteran and rookie paths.
  // Capture-only (C2): recorded into factors, never moves projectedPPG.
  const ktcSignals = computeKtcSignals(ktcHistory?.series?.[playerId] ?? null)

  // Route true rookies / no-data players to rookie projection
  if (qualifying.length === 0 || (yearsExp != null && yearsExp <= 1)) {
    const r = rookieProjection(player, playerId, yearsExp, ktcMap, playersMap, collegeStats, positionPeakPPG, nflDraftMatches)
    return { ...r, factors: { ...r.factors, ...ktcSignals } }
  }

  // ── Step 2: Base PPG (weighted recent average) ──────────────────────────
  const recent = qualifying.slice(-3)            // [oldest, mid, newest]
  const weightsRaw = recent.length === 3 ? [0.20, 0.30, 0.50]
                  : recent.length === 2 ? [0.30, 0.70]
                  : [1.00]
  // Normalise (already sums to 1.0; defensive)
  const wSum = weightsRaw.reduce((a, b) => a + b, 0)
  const weights = weightsRaw.map(w => w / wSum)
  const basePPG = recent.reduce((acc, s, i) => acc + s.ppg * weights[i], 0)

  // ── Step 3: Age curve delta ─────────────────────────────────────────────
  const age = player.age ?? null
  const curve = empiricalCurves?.[position] ?? []
  let ageDelta = 1.0
  if (age != null && curve.length > 0) {
    const peakPPG = positionPeakPPG?.[position] ?? 1
    const cur  = interpolateAgeCurve(curve, age)
    const next = interpolateAgeCurve(curve, age + 1)
    if (cur > 0) {
      const curFactor  = cur  / peakPPG
      const nextFactor = next / peakPPG
      ageDelta = clamp(nextFactor / Math.max(curFactor, 0.01), 0.80, 1.10)
    }
  }

  // ── Step 4: Share trend multiplier (volatility-modulated) ───────────────
  const trend = computeShareTrend(historicalShares?.[playerId] ?? null)
  const shareTrendRaw = ({
    growing:   1.08,
    expanding: 1.04,
    stable:    1.00,
    shrinking: 0.96,
    declining: 0.92,
  })[trend?.shareTrendLabel] ?? 1.00

  const shareVolatilityLabel = trend?.volatilityLabel ?? null
  const shareVolatilityScale = ({
    entrenched: 1.00,
    moderate:   0.80,
    volatile:   0.50,
  })[shareVolatilityLabel] ?? 1.00

  // Modulate the *deviation from 1.0* — a noisier share series gets a smaller swing.
  const shareTrendMultiplier = 1.0 + (shareTrendRaw - 1.0) * shareVolatilityScale

  // ── Step 5: Regression to mean (consistency-modulated) ──────────────────
  const careerAvg = qualifying.reduce((a, s) => a + s.ppg, 0) / qualifying.length
  const ppgs = qualifying.map(s => s.ppg)          // oldest → newest, all GP>=8
  const lastPPG = qualifying[qualifying.length - 1].ppg
  const outlierRatio = lastPPG / Math.max(careerAvg, 1)

  let regressionFactorRaw
  if      (outlierRatio > 1.35) regressionFactorRaw = 0.88
  else if (outlierRatio > 1.15) regressionFactorRaw = 0.95
  else if (outlierRatio < 0.65) regressionFactorRaw = 1.12
  else if (outlierRatio < 0.85) regressionFactorRaw = 1.05
  else                          regressionFactorRaw = 1.00

  // Consistency dampens the regression correction for steady producers; erratic
  // players (and < 3-season players) keep the full, byte-identical correction.
  const { consistencyScore } = computeConsistency(ppgs)
  const consistencyBand = consistencyScore == null ? null
    : consistencyScore >= 80 ? 'steady'
    : consistencyScore >= 60 ? 'moderate'
    : 'erratic'
  const consistencyScale = ({ steady: 0.50, moderate: 0.80, erratic: 1.00 })[consistencyBand] ?? 1.00
  const regressionFactor = 1.0 + (regressionFactorRaw - 1.0) * consistencyScale

  // ── Step 5b: Momentum multiplier ────────────────────────────────────────
  const { momentum, momentumLabel } = computeMomentum(ppgs, careerAvg)
  const momentumFactor = ({
    accelerating: 1.08,
    improving:    1.04,
    stable:       1.00,
    slowing:      0.96,
    decelerating: 0.92,
  })[momentumLabel] ?? 1.00

  // ── Step 5c: Breakout / bounce-back / TD-reliance adjustments ────────────
  const breakoutPeakPPG = positionPeakPPG?.[position] ?? 20   // cancels in rawRatio

  const isBreakout = (age != null && curve.length > 0)
    ? computeBreakoutFlag(age, lastPPG, curve, breakoutPeakPPG)
    : null

  const isBounceBack = qualifying.length >= 2
    ? computeBounceBackFlag(qualifying)
    : null

  const lastQ         = qualifying[qualifying.length - 1]
  const lastSeasonRaw = careerStats?.[lastQ.season]?.[playerId] ?? {}
  const { tdDependency, isTdReliant: tdReliantRaw } =
    computeTdReliance(lastSeasonRaw.stats, lastSeasonRaw.fantasyPoints, scoringSettings)
  const isTdReliant = tdDependency == null ? null : tdReliantRaw

  const breakoutFactor   = isBreakout   === true ? 1.08 : 1.00
  const bounceBackFactor = isBounceBack === true ? 1.05 : 1.00
  const tdRelianceFactor = isTdReliant  === true ? 0.93 : 1.00

  // ── Position multiplicity (capture-only, C3) ────────────────────────────
  const primaryCategory   = POS_PRIMARY[position]   ?? null
  const secondaryCategory = POS_SECONDARY[position] ?? null
  let positionMultiplicityRatio = null
  let primaryCategoryPoints   = null
  let secondaryCategoryPoints = null
  if (primaryCategory && secondaryCategory && lastSeasonRaw.stats && scoringSettings) {
    const cats = getCategoryPoints(lastSeasonRaw.stats, scoringSettings)
    primaryCategoryPoints   = Math.round(cats[primaryCategory]   * 10) / 10
    secondaryCategoryPoints = Math.round(cats[secondaryCategory] * 10) / 10
    const denom = primaryCategoryPoints + secondaryCategoryPoints
    if (denom > 0) {
      positionMultiplicityRatio = Math.round((secondaryCategoryPoints / denom) * 1000) / 1000
    }
  }

  // ── aDOT capture-only (WR/TE only; Q3 resolution: RB/QB record null) ───────
  // Computed as Sleeper's rec_air_yd / rec_tgt from the most-recent qualifying
  // season. rec_air_yd runs ~half published aDOT (likely air yards on completed
  // receptions, not all targets — see docs/projection.md §aDOT capture-only);
  // within-cohort ranking is preserved. Capture-only: does not enter
  // combinedNewFactor or move projectedPPG. No adjustmentSummary lines.
  let adot = null
  let adotDelta = null
  let adotSampleSize = null
  if (position === 'WR' || position === 'TE') {
    const airStats  = lastSeasonRaw.stats ?? {}
    const lastTgt   = airStats.rec_tgt    ?? null
    const lastAirYd = airStats.rec_air_yd ?? null
    if (lastTgt != null && lastTgt > 0 && lastAirYd != null) {
      adot          = Math.round((lastAirYd / lastTgt) * 1000) / 1000
      adotSampleSize = lastTgt
      if (qualifying.length >= 2) {
        const prevQ   = qualifying[qualifying.length - 2]
        const prevRaw = careerStats?.[prevQ.season]?.[playerId] ?? {}
        const prevTgt = prevRaw.stats?.rec_tgt    ?? null
        const prevAYd = prevRaw.stats?.rec_air_yd ?? null
        if (prevTgt != null && prevTgt > 0 && prevAYd != null) {
          adotDelta = Math.round((adot - prevAYd / prevTgt) * 1000) / 1000
        }
      }
    }
  }

  // ── Step 5d: Trajectory multiplier ──────────────────────────────────────
  const { slope: trajectorySlope, normalizedSlope: trajectoryNormalized } = computeTrajectory(ppgs)
  const trajectoryFactor = trajectoryNormalized == null
    ? 1.00
    : clamp(1.0 + trajectoryNormalized * 0.35, 0.93, 1.07)

  // ── Step 5e: Per-opportunity efficiency factor ──────────────────────────
  const { efficiencyFactor, efficiencyIndex, efficiencyMetrics } =
    computeEfficiencyFactor(position, lastSeasonRaw.stats, careerStats, playersMap)

  // ── Step 5f/5g: Snap share & own-rate red-zone usage (D2) ───────────────
  // Both derived from the most recent qualifying season's raw stats; each is a
  // cohort-percentile multiplier (snap share ±6%, RZ usage ±5%). Snap share is
  // RB/WR/TE only (QB gated); RZ usage is primary-category per position. Neutral
  // (1.0) when the stat fields are absent or the sample is too small.
  const {
    snapShare, snapShareFactor,
    rzUsageRate, rzUsageFactor, rzUsageCategory,
  } = computeUsageFactors(position, lastSeasonRaw.stats, careerStats, playersMap)

  // ── Step 5h: Team-aggregated red-zone share (D3) ─────────────────────────
  // Player's RZ opps ÷ team's total RZ opps for the same season. Distinct from
  // D2 own-rate (corr ≈ 0.39); marginal partial β ≈ +0.20 RB / +0.17 WR/TE
  // after controlling for own-rate, overall share, and snap share. QB gated out
  // (structural: one passer owns ~100% of team RZ → ~zero discrimination).
  // Normalization: cohort-percentile + shrinkage-to-50 → ±5%, [0.95, 1.05].
  // Denominators from historicalTeamTotals[lastQ.season][player.team].
  const { teamRzShare, teamRzShareFactor, teamRzShareCategory } =
    computeTeamRzShareFactor(position, lastSeasonRaw.stats, lastQ.season, player.team,
                             historicalTeamTotals, careerStats, playersMap)

  // ── Step 6: Durability (projected games) ────────────────────────────────
  const gp = recent.map(s => s.gamesPlayed)
  const gpWeights = weightsRaw.map(w => w / wSum)
  let avgGames = recent.reduce((acc, s, i) => acc + gp[i] * gpWeights[i], 0)

  const injurySeasons = qualifying.filter(s => s.gamesPlayed < 10 && s.dnpWeeks >= 3).length
  if      (injurySeasons >= 3) avgGames *= 0.78
  else if (injurySeasons >= 2) avgGames *= 0.88

  // ── Step 6 (continued): Absence-shape refinement ────────────────────────
  const availSeasons = qualifying
    .map(s => careerStats?.[s.season]?.[playerId]?.availability)
    .filter(Boolean)

  let absenceShapeFactor = 1.0
  let absenceShape = null   // sentinel when no Phase-5 data on any season

  if (availSeasons.length > 0) {
    let recurringAbsenceSeasons = 0   // seasons with >= 2 multi-week absence runs
    let hiddenAbsenceSeasons    = 0   // GP>=10 seasons (binary trigger missed) w/ a long absence
    qualifying.forEach(s => {
      const a = careerStats?.[s.season]?.[playerId]?.availability
      if (!a) return
      const segs = Array.isArray(a.absenceSegments) ? a.absenceSegments : []
      const multiWeekRuns = segs.filter(seg => (seg.length ?? 0) >= 2).length
      if (multiWeekRuns >= 2) recurringAbsenceSeasons += 1
      if (s.gamesPlayed >= 10 && (a.longestAbsence ?? 0) >= 4) hiddenAbsenceSeasons += 1
    })

    if      (recurringAbsenceSeasons >= 2) absenceShapeFactor *= 0.90
    else if (recurringAbsenceSeasons >= 1) absenceShapeFactor *= 0.95
    if      (hiddenAbsenceSeasons >= 2)    absenceShapeFactor *= 0.93
    else if (hiddenAbsenceSeasons >= 1)    absenceShapeFactor *= 0.97

    absenceShapeFactor = clamp(absenceShapeFactor, 0.85, 1.0)
    absenceShape = { recurringAbsenceSeasons, hiddenAbsenceSeasons, seasonsWithData: availSeasons.length }
  }

  avgGames *= absenceShapeFactor
  const projectedGames = Math.round(clamp(avgGames, 8, 17))
  const durabilityFactor = projectedGames / 17

  // ── Step 7: Team + depth modifiers ──────────────────────────────────────
  const teamRank = teamContext?.teamOffense?.[player.team]?.rank ?? 16
  const teamFactor = 1.0 + (16 - teamRank) / 200

  const depthOrder = depthMap?.[playerId]?.depthOrder ?? null
  let depthFactor
  if      (depthOrder === 1) depthFactor = 1.05
  else if (depthOrder === 2) depthFactor = 0.88
  else if (depthOrder != null && depthOrder >= 3) depthFactor = 0.68
  else                                            depthFactor = 1.00

  // ── Step 7b: QB1 quality multiplier (WR/TE/RB only) ─────────────────────
  let qbQualityScore  = null
  let qbQualityFactor = 1.0
  if (position !== 'QB') {
    const q = qbQualityByTeam?.[player.team]
    if (q != null && isFinite(q)) {
      qbQualityScore  = Math.round(q)
      // Neutral QB (quality 50) → 1.0; range strictly [0.95, 1.05] by construction.
      qbQualityFactor = 1.0 + (q - 50) / 100 * 0.10
    }
  }

  // ── Combine ─────────────────────────────────────────────────────────────
  // Ten new PPG multipliers (B1a: qbQuality, momentum; B1b: breakout, bounceBack,
  // tdReliance; B2: trajectory; C1: efficiency; D2: snapShare, rzUsage;
  // D3: teamRzShare) share a sanity-rail envelope. The envelope is a GUARDRAIL
  // against pathological stacks, NOT an active moderator — it should fire ~0%
  // on real players.
  //
  // Measured distribution (2012–2025, n=1,504 qualifying vet projections):
  //   min 0.755 · p5 0.82 · med 0.955 · p95 1.135 · max 1.328
  //   Clamp-hit rate at old [0.78,1.30] was ~1%; at [0.67,1.50] it fires 0/1,504.
  // Caveat: qbQualityFactor was forced to 1.0 in the measurement run; real non-QB
  //   tails are up to ±5% wider (est. max ~1.39, min ~0.72). Envelope still covers.
  // Adding D3 (±5%): worst-case theoretical stack ≈ 1.46 < 1.50 — headroom is now
  //   thin; monitor combinedNewFactorRaw p95. At factor #10 (well below #13–14
  //   trigger), do NOT re-widen the envelope — flag if realized p95 nears ~1.40.
  //
  // `combinedNewFactorRaw` captures the pre-envelope product for monitoring.
  // Watch realized p95: when it approaches ~1.40 (≈ factor #13–14), escalate to
  // a normalized additive-index (Option B) rather than widening the rail further.
  const combinedNewFactorRaw =
    qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
      * tdRelianceFactor * trajectoryFactor * efficiencyFactor
      * snapShareFactor * rzUsageFactor * teamRzShareFactor
  const combinedNewFactor = clamp(combinedNewFactorRaw, 0.67, 1.50)
  const rawPPG = basePPG * ageDelta * shareTrendMultiplier * regressionFactor
               * teamFactor * depthFactor * combinedNewFactor
  const pipelinePPG = clamp(rawPPG, 0, 40)

  const confidence = qualifying.length >= 5 ? 'high'
                    : qualifying.length >= 3 ? 'medium'
                    : 'low'

  // ── Step 8: Career-comp ensemble blend ──────────────────────────────────
  const {
    blendedPPG, compPPG, compCount, compAvgSimilarity, compConfidence, compBlendWeight,
  } = computeCompBlend(
    playerId, playersMap, careerStats, positionPeakPPG, position,
    pipelinePPG, confidence,
  )
  const projectedPPG = blendedPPG
  const projectedTotalPts = Math.round(projectedPPG * projectedGames * 10) / 10

  // ── Adjustment summary ──────────────────────────────────────────────────
  const adjustmentSummary = []
  if (ageDelta > 1.03)         adjustmentSummary.push('Age curve improving ↑')
  if (ageDelta < 0.97)         adjustmentSummary.push('Past position peak ↓')
  if (shareTrendMultiplier > 1.03) adjustmentSummary.push('Growing role ↑')
  if (shareTrendMultiplier < 0.97) adjustmentSummary.push('Declining role ↓')
  if (regressionFactor > 1.05) adjustmentSummary.push('Bounce-back from down year ↑')
  if (regressionFactor < 0.95) adjustmentSummary.push('Regression from outlier season ↓')
  if (depthFactor < 0.90)      adjustmentSummary.push('Not confirmed starter ↓')
  if (teamFactor > 1.03)       adjustmentSummary.push('Strong offense ↑')
  if (teamFactor < 0.97)       adjustmentSummary.push('Weak offense ↓')
  if (durabilityFactor < 0.85) adjustmentSummary.push('Injury history ↓')
  if (momentumLabel === 'accelerating' || momentumLabel === 'improving')
    adjustmentSummary.push('Production trending up ↑')
  if (momentumLabel === 'slowing' || momentumLabel === 'decelerating')
    adjustmentSummary.push('Production trending down ↓')
  if (absenceShapeFactor < 0.97)
    adjustmentSummary.push('Recurring absence pattern ↓')
  if (shareVolatilityLabel === 'volatile' && shareTrendRaw !== 1.0)
    adjustmentSummary.push('Volatile role — trend down-weighted')
  if (qbQualityFactor > 1.02) adjustmentSummary.push('Quality QB play ↑')
  if (qbQualityFactor < 0.98) adjustmentSummary.push('Weak QB play ↓')
  if (isBreakout === true)   adjustmentSummary.push('Young breakout — regression softened ↑')
  if (isBounceBack === true) adjustmentSummary.push('Bounced back from lost season ↑')
  if (isTdReliant === true)  adjustmentSummary.push('TD-reliant scoring — extra regression ↓')
  if (consistencyBand === 'steady' && regressionFactorRaw !== 1.0)
    adjustmentSummary.push('Steady producer — regression softened')
  if (trajectoryFactor > 1.03) adjustmentSummary.push('Career trajectory rising ↑')
  if (trajectoryFactor < 0.97) adjustmentSummary.push('Career trajectory declining ↓')
  if (efficiencyFactor > 1.03) adjustmentSummary.push('Efficient per-opportunity production ↑')
  if (efficiencyFactor < 0.97) adjustmentSummary.push('Below-average efficiency ↓')
  if (snapShareFactor > 1.02) adjustmentSummary.push('High snap share ↑')
  if (snapShareFactor < 0.98) adjustmentSummary.push('Low snap share ↓')
  if (rzUsageFactor > 1.02)       adjustmentSummary.push('Red-zone role ↑')
  if (rzUsageFactor < 0.98)       adjustmentSummary.push('Limited red-zone role ↓')
  if (teamRzShareFactor > 1.02)   adjustmentSummary.push('High red-zone share ↑')
  if (teamRzShareFactor < 0.98)   adjustmentSummary.push('Low red-zone share ↓')
  if (compBlendWeight > 0) {
    const blendShift = (projectedPPG - pipelinePPG) / Math.max(pipelinePPG, 1)
    if (blendShift >  0.03) adjustmentSummary.push('Career comps lift projection ↑')
    if (blendShift < -0.03) adjustmentSummary.push('Career comps temper projection ↓')
  }

  return {
    projectedPPG:      Math.round(projectedPPG * 10) / 10,
    projectedGames,
    projectedTotalPts,
    confidence,
    factors: {
      basePPG:          Math.round(basePPG * 10) / 10,
      ageDelta:         Math.round(ageDelta * 1000) / 1000,
      shareTrend:       shareTrendMultiplier,
      regressionFactor:    Math.round(regressionFactor * 1000) / 1000,
      regressionFactorRaw,
      consistencyScore:    consistencyScore != null ? Math.round(consistencyScore) : null,
      consistencyBand,
      consistencyScale:    Math.round(consistencyScale * 1000) / 1000,
      durabilityFactor: Math.round(durabilityFactor * 1000) / 1000,
      teamFactor:       Math.round(teamFactor * 1000) / 1000,
      depthFactor,
      momentumFactor:   Math.round(momentumFactor * 1000) / 1000,
      momentumLabel,
      absenceShapeFactor: Math.round(absenceShapeFactor * 1000) / 1000,
      absenceShape,
      shareTrendRaw:      Math.round(shareTrendRaw * 1000) / 1000,
      shareVolatilityLabel,
      shareVolatilityScale: Math.round(shareVolatilityScale * 1000) / 1000,
      qbQualityFactor:     Math.round(qbQualityFactor * 1000) / 1000,
      qbQualityScore,
      combinedNewFactor:    Math.round(combinedNewFactor * 1000) / 1000,
      combinedNewFactorRaw: Math.round(combinedNewFactorRaw * 1000) / 1000,
      isBreakout,
      breakoutFactor:   Math.round(breakoutFactor * 1000) / 1000,
      isBounceBack,
      bounceBackFactor: Math.round(bounceBackFactor * 1000) / 1000,
      isTdReliant,
      tdRelianceFactor: Math.round(tdRelianceFactor * 1000) / 1000,
      tdDependency:     tdDependency != null ? Math.round(tdDependency * 1000) / 1000 : null,
      trajectoryFactor:     Math.round(trajectoryFactor * 1000) / 1000,
      trajectoryNormalized: trajectoryNormalized != null ? Math.round(trajectoryNormalized * 1000) / 1000 : null,
      efficiencyFactor:  Math.round(efficiencyFactor * 1000) / 1000,
      efficiencyIndex:   efficiencyIndex != null ? Math.round(efficiencyIndex * 1000) / 1000 : null,
      efficiencyMetrics,
      snapShare,
      snapShareFactor:   Math.round(snapShareFactor * 1000) / 1000,
      rzUsageRate,
      rzUsageFactor:     Math.round(rzUsageFactor * 1000) / 1000,
      rzUsageCategory,
      // D3 — team-aggregated red-zone share
      teamRzShare,
      teamRzShareFactor: Math.round(teamRzShareFactor * 1000) / 1000,
      teamRzShareCategory,
      positionMultiplicityRatio,
      primaryCategory,
      primaryCategoryPoints,
      secondaryCategoryPoints,
      adot,
      adotDelta,
      adotSampleSize,
      pipelinePPG:       Math.round(pipelinePPG * 10) / 10,
      compPPG,
      compCount,
      compAvgSimilarity,
      compConfidence:    Math.round(compConfidence * 1000) / 1000,
      compBlendWeight:   Math.round(compBlendWeight * 1000) / 1000,
      ...ktcSignals,
    },
    adjustmentSummary,
  }
}
