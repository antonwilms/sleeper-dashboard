/**
 * src/__fixtures__/factories.js
 *
 * Factory helpers for integration tests of computeNextSeasonProjection.
 *
 * USAGE
 * -----
 * Each factory returns an object with an `.asOptions()` method that passes directly as
 * computeNextSeasonProjection's options object:
 *
 *   const r = computeNextSeasonProjection(makeVet().asOptions())
 *
 * Override any input for a specific test:
 *
 *   const r = computeNextSeasonProjection(
 *     makeVet({ player: { age: 30 }, qbQualityByTeam: { KC: 0 } }).asOptions()
 *   )
 *
 * ISOLATION
 * ---------
 * careerComps.js keeps a module-level `compsCache` keyed by player ID.
 * efficiencyMetrics.js keeps a `cohortCache` keyed by careerStats object identity.
 * Use a unique `playerId` for each test that exercises either cache so results
 * cannot bleed between tests. The P_* constants below reserve unique namespaces
 * for the integration test file — add new IDs here when adding new test scenarios.
 *
 * Option keys (all 15 accepted by computeNextSeasonProjection; order is irrelevant)
 * ---------------------------------------------------------------------------------
 * playerId         string
 * playersMap       { [player_id]: { position, age, years_exp, team, depth_chart_order } }
 * careerStats      { [season]: { [player_id]: { fantasyPoints, gamesPlayed, dnpWeeks, stats } } }
 * empiricalCurves  { [position]: [{ age, medianPPG }] }
 * positionPeakPPG  { QB, RB, WR, TE }
 * historicalShares { [player_id]: shareTrendData }
 * depthMap         { [player_id]: { depthOrder } }
 * teamContext       { teamOffense: { [team]: { rank } } }
 * scoringSettings  object | null
 * ktcMap           Map<player_id, { value, confidence }> | null
 * collegeStats     { [player_id]: collegeData } | null
 * currentSeason    number
 * qbQualityByTeam  { [team]: number } | null
 * ktcHistory       { series: { [player_id]: [...] } } | null
 * nflDraftMatches  { [player_id]: NflDraftMatch } | null
 */

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const DEFAULT_PEAK_PPG = { QB: 22, RB: 18, WR: 18, TE: 14 }

// Age curves — realistic shape for each position. Used for ageDelta and breakout.
export function defaultCurves() {
  return {
    QB: [{ age: 25, medianPPG: 18 }, { age: 30, medianPPG: 20 }, { age: 35, medianPPG: 14 }],
    RB: [{ age: 22, medianPPG: 10 }, { age: 26, medianPPG: 12 }, { age: 30, medianPPG: 7  }],
    WR: [{ age: 22, medianPPG: 8  }, { age: 27, medianPPG: 12 }, { age: 32, medianPPG: 7  }],
    TE: [{ age: 24, medianPPG: 7  }, { age: 28, medianPPG: 10 }, { age: 33, medianPPG: 6  }],
  }
}

// Standard PPR scoring settings.
export function defaultPPRScoring() {
  return {
    pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2,
    rush_yd: 0.1,  rush_td: 6, rush_2pt: 2,
    rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2,
    fum_lost: -2, fum_rec_td: 6,
  }
}

// ---------------------------------------------------------------------------
// Season-entry builders
// ---------------------------------------------------------------------------

/**
 * Build one player-season entry for use in careerStats[season][playerId].
 * stats defaults to a light RB workload that stays below MIN_COHORT_OPPS (30
 * rush_att) so the player never enters the efficiency cohort pool unless the
 * caller explicitly raises rush_att — keeps efficiency neutral by default.
 */
export function makeSeasonEntry(fantasyPoints, gamesPlayed, stats = {}) {
  return {
    fantasyPoints,
    gamesPlayed,
    dnpWeeks: 0,
    stats: {
      rush_att: 20, rush_yd: 100, rush_td: 1,
      rush_rz_att: 2,
      rec_tgt: 15, rec: 10, rec_yd: 80, rec_td: 0,
      rec_rz_tgt: 2,
      pass_att: 0, pass_yd: 0, pass_td: 0, pass_int: 0,
      ...stats,
    },
  }
}

// ---------------------------------------------------------------------------
// Veteran career-stats helpers
// ---------------------------------------------------------------------------

/**
 * Five stable seasons at 12 PPG (14 games each). Produces a "medium" confidence
 * baseline vet: no outlier (regressionFactor ≈ 1), stable momentum, rising
 * trajectory (negligible), efficiency neutral (pool stays empty).
 */
export function defaultVetCareerStats(playerId) {
  const s = () => makeSeasonEntry(168, 14)   // 12 ppg × 14 gp = 168
  return {
    2020: { [playerId]: s() },
    2021: { [playerId]: s() },
    2022: { [playerId]: s() },
    2023: { [playerId]: s() },
    2024: { [playerId]: s() },
  }
}

/**
 * Five seasons that drive every positive combinedNewFactor signal above the
 * [0.78, 1.30] clamp's upper bound — used by the clamp-from-above test.
 *
 * ppgs = [8, 8, 8, 14, 14] with 2023 GP=9 (shortened for bounce-back):
 *   momentum   → 'accelerating' (factor 1.08)
 *   trajectory → normalizedSlope → clamp top (factor 1.07)
 *   bounceBack → true  (factor 1.05)  2023 GP=9 < 10, 2024 PPG >= prior max
 *   breakout   → true  (factor 1.08)  requires caller to pass breakoutCurves()
 */
export function clampHiCareerStats(playerId) {
  return {
    2020: { [playerId]: makeSeasonEntry(112, 14) },   // ppg =  8
    2021: { [playerId]: makeSeasonEntry(112, 14) },   // ppg =  8
    2022: { [playerId]: makeSeasonEntry(112, 14) },   // ppg =  8
    // 2023: shortened season — GP=9 qualifies (≥8) but triggers bounce-back gate (<10)
    2023: { [playerId]: makeSeasonEntry(126, 9)  },   // ppg = 14
    2024: { [playerId]: makeSeasonEntry(196, 14) },   // ppg = 14
  }
}

/**
 * Age curves with a deliberately low medianPPG at age 24 so a 14-PPG player
 * blows past the 1.3× rawRatio threshold and triggers isBreakout = true.
 * Pass as empiricalCurves when building the clamp-from-above fixture.
 */
export function breakoutCurves() {
  return {
    ...defaultCurves(),
    RB: [{ age: 22, medianPPG: 6 }, { age: 26, medianPPG: 9 }],
    // interpolateAgeCurve(curve, 24) → 7.5 → ageFactor = 7.5/18 ≈ 0.417
    // rawRatio = (14/18) / 0.417 ≈ 1.86 > 1.3 → breakout = true
  }
}

/**
 * Five declining seasons [14, 14, 14, 8, 8]. Drives every negative signal:
 *   momentum   → 'decelerating' (factor 0.92)
 *   trajectory → normalizedSlope negative → clamp bottom (factor 0.93)
 *   bounceBack → false (prior GP=14 ≥ 10)
 *   isBreakout → false (age 26 > 24)
 *
 * Combine with qbQualityByTeam: {team: 0} and scoringSettings + high-TD stats
 * to also drive qbQuality → 0.95 and tdReliance → true (0.93).
 */
export function clampLoCareerStats(playerId) {
  // 2024 last season: high TD dependency so isTdReliant fires.
  // stats: 60 rush_att (≥30 → enters cohort as pool of 1 → percentile 0 → penalty)
  //        rush_td:8 with fp=112 → tdDependency = 48/112 ≈ 0.43 > 0.40 → reliant
  const lastSeason = makeSeasonEntry(112, 14, { rush_att: 60, rush_yd: 50, rush_td: 8 })
  return {
    2020: { [playerId]: makeSeasonEntry(196, 14) },   // ppg = 14
    2021: { [playerId]: makeSeasonEntry(196, 14) },   // ppg = 14
    2022: { [playerId]: makeSeasonEntry(196, 14) },   // ppg = 14
    2023: { [playerId]: makeSeasonEntry(112, 14) },   // ppg =  8
    2024: { [playerId]: lastSeason              },    // ppg =  8
  }
}

// ---------------------------------------------------------------------------
// Comp-blend fixtures
// ---------------------------------------------------------------------------

/**
 * Build a careerStats object for a comp-blend integration test.
 * Target player has 2 qualifying seasons (PPG 12, 14) — confidence = 'low'.
 * Comp player has 4 seasons (first 2 identical to target, then 2 at PPG=17)
 * so similarity = 100 and theirSubsequentSeasons = 2 (eligible).
 *
 * @param {string} tgtId   target player ID
 * @param {string} compId  comp player ID
 */
export function compBlendCareerStats(tgtId, compId) {
  // 2 qualifying seasons for target (confidence = 'low')
  // peakPPG = 18 (RB) → arc = [12/18, 14/18] = [0.667, 0.778]
  const tgt2023 = makeSeasonEntry(168, 14)  // ppg=12
  const tgt2024 = makeSeasonEntry(196, 14)  // ppg=14

  // 4 qualifying seasons for comp — first 2 match target, then 2 at ppg=17
  // arc = [12/18, 14/18, 17/18, 17/18]; similarity over first 2 = 1.0
  const comp2021 = makeSeasonEntry(168, 14)  // ppg=12
  const comp2022 = makeSeasonEntry(196, 14)  // ppg=14
  const comp2023 = makeSeasonEntry(238, 14)  // ppg=17
  const comp2024 = makeSeasonEntry(238, 14)  // ppg=17

  return {
    2021: {              [compId]: comp2021 },
    2022: {              [compId]: comp2022 },
    2023: { [tgtId]: tgt2023, [compId]: comp2023 },
    2024: { [tgtId]: tgt2024, [compId]: comp2024 },
  }
}

// ---------------------------------------------------------------------------
// Main vet factory
// ---------------------------------------------------------------------------

/**
 * Constructs a fully-equipped veteran player fixture for computeNextSeasonProjection.
 *
 * @param {Object} overrides
 * @param {string}  [overrides.playerId]         — unique ID; use a new one per test
 * @param {Object}  [overrides.player]           — merged into player entry
 * @param {Object}  [overrides.careerStats]      — replaces defaultVetCareerStats entirely
 * @param {Object}  [overrides.extraPlayers]     — merged into playersMap (e.g. comp players)
 * @param {Object}  [overrides.empiricalCurves]
 * @param {Object}  [overrides.positionPeakPPG]
 * @param {Object}  [overrides.historicalShares]
 * @param {Object}  [overrides.depthMap]
 * @param {Object}  [overrides.teamContext]
 * @param {Object|null} [overrides.scoringSettings]
 * @param {Map|null}    [overrides.ktcMap]
 * @param {Object|null} [overrides.collegeStats]
 * @param {number}  [overrides.currentSeason]
 * @param {Object|null} [overrides.qbQualityByTeam]
 * @param {Object|null} [overrides.ktcHistory]
 * @param {Object|null} [overrides.nflDraftMatches]
 * @param {Object|null} [overrides.historicalTeamTotals]
 */
export function makeVet(overrides = {}) {
  const playerId = overrides.playerId ?? 'P_VET_DEF'
  const player = {
    position: 'RB', age: 26, years_exp: 5, team: 'KC', depth_chart_order: 1,
    ...overrides.player,
  }
  const cs = overrides.careerStats ?? defaultVetCareerStats(playerId)

  return {
    playerId,
    asOptions: () => ({
      playerId,
      playersMap:           { [playerId]: player, ...(overrides.extraPlayers ?? {}) },
      careerStats:          cs,
      empiricalCurves:      overrides.empiricalCurves        ?? defaultCurves(),
      positionPeakPPG:      overrides.positionPeakPPG        ?? DEFAULT_PEAK_PPG,
      historicalShares:     overrides.historicalShares        ?? {},
      depthMap:             overrides.depthMap               ?? { [playerId]: { depthOrder: 1 } },
      teamContext:          overrides.teamContext             ?? { teamOffense: { KC: { rank: 8 } } },
      scoringSettings:      overrides.scoringSettings        ?? null,
      ktcMap:               overrides.ktcMap                 ?? null,
      collegeStats:         overrides.collegeStats           ?? null,
      currentSeason:        overrides.currentSeason          ?? 2025,
      qbQualityByTeam:      overrides.qbQualityByTeam        ?? null,
      ktcHistory:           overrides.ktcHistory             ?? null,
      nflDraftMatches:      overrides.nflDraftMatches        ?? null,
      historicalTeamTotals: overrides.historicalTeamTotals   ?? null,
    }),
  }
}

// ---------------------------------------------------------------------------
// Rookie factory
// ---------------------------------------------------------------------------

/**
 * Constructs a rookie / rookie-path player fixture for computeNextSeasonProjection.
 * Defaults: WR, age 22, years_exp 0, empty careerStats → routes to rookie path.
 *
 * @param {Object} overrides  same keys as makeVet; careerStats defaults to {}
 * @param {Object|null} [overrides.nflDraftMatches]
 */
export function makeRookie(overrides = {}) {
  const playerId = overrides.playerId ?? 'P_ROO_DEF'
  const player = {
    position: 'WR', age: 22, years_exp: 0, team: 'KC', depth_chart_order: 1,
    ...overrides.player,
  }

  return {
    playerId,
    asOptions: () => ({
      playerId,
      playersMap:       { [playerId]: player, ...(overrides.extraPlayers ?? {}) },
      careerStats:      overrides.careerStats      ?? {},
      empiricalCurves:  overrides.empiricalCurves  ?? defaultCurves(),
      positionPeakPPG:  overrides.positionPeakPPG  ?? DEFAULT_PEAK_PPG,
      historicalShares: overrides.historicalShares  ?? {},
      depthMap:         overrides.depthMap          ?? {},
      teamContext:      overrides.teamContext        ?? {},
      scoringSettings:  overrides.scoringSettings   ?? null,
      ktcMap:           overrides.ktcMap            ?? null,
      collegeStats:     overrides.collegeStats      ?? null,
      currentSeason:    overrides.currentSeason     ?? 2025,
      qbQualityByTeam:  overrides.qbQualityByTeam   ?? null,
      ktcHistory:       overrides.ktcHistory        ?? null,
      nflDraftMatches:  overrides.nflDraftMatches   ?? null,
    }),
  }
}

// ---------------------------------------------------------------------------
// KTC map builder (≥5 players required for computeKTCPositionPercentile)
// ---------------------------------------------------------------------------

/**
 * Build a ktcMap (Map) with the given player at a high percentile.
 * Pads with 4 extra players at the same position so the ≥5 requirement is met.
 *
 * @param {string} playerId
 * @param {string} position
 * @param {number} value        KTC dynasty value for the target player
 * @param {Object} playersMap   reference to the playersMap used in the test;
 *                              the 4 padding players are added to it in-place.
 */
export function makeKtcMap(playerId, position, value, playersMap) {
  const map = new Map()
  map.set(playerId, { value, confidence: 'high' })
  for (let i = 1; i <= 4; i++) {
    const padId = `ktc_pad_${position}_${i}`
    map.set(padId, { value: value - i * 500, confidence: 'low' })
    // Register pad player in playersMap so computeKTCPositionPercentile counts them.
    playersMap[padId] = { position, age: 25, years_exp: 3, team: 'SF' }
  }
  return map
}
