/**
 * src/utils/dynastyScore.test.js
 *
 * Golden-master precision tests for computeDynastyScore.
 * Snapshots are captured against the unmodified source and must remain
 * byte-identical after the helper de-dup refactor (momentum + consistency).
 *
 * DO NOT run `vitest -u` to force-pass a failing snapshot — a shift means
 * a formula divergence that must be investigated.
 *
 * Console noise: computeDynastyScore + computeProspectScore emit console.log
 * in non-production env (Vitest runs as 'test'). Suppressed in beforeEach.
 * Pass empiricalCurves directly (never call computeEmpiricalAgeCurves, which
 * logs unconditionally).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Suppress console noise from dynastyScore's diagnostic logging.
vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

import { computeDynastyScore } from './dynastyScore.js'
import {
  makeSeasonEntry,
  defaultCurves,
  breakoutCurves,
  DEFAULT_PEAK_PPG,
  defaultPPRScoring,
  defaultVetCareerStats,
  clampHiCareerStats,
  clampLoCareerStats,
} from '../__fixtures__/factories.js'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal playersMap entry — only the fields dynastyScore.js reads. */
function makePlayer(position, age, years_exp) {
  return { position, age, years_exp }
}

describe('computeDynastyScore — golden-master precision tests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // ── Scenario 1: Stable 5-season vet (Path C, all signals active) ───────────
  // Five 12-PPG/14-GP seasons → momentum='stable', trajectory flat, consistency 100.
  it('stable 5-season vet: Path C, momentum stable, all signals fire', () => {
    const playerId = 'P_DS_STABLE'
    const playersMap = { [playerId]: makePlayer('RB', 26, 5) }
    const careerStats = defaultVetCareerStats(playerId)

    const result = computeDynastyScore(
      playerId,
      playersMap,
      careerStats,
      defaultCurves(),
      DEFAULT_PEAK_PPG,
      null,               // dynastyDraftPick
      defaultPPRScoring(),
      null,               // ktcMap
      null,               // teamContext
      { [playerId]: { depthOrder: 1 } },
      null,               // historicalShares
    )

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.confidence).toBe('high')
    expect(result.signals.momentumLabel).toBe('stable')
    expect(result.signals.momentum).not.toBeNull()
    expect(result.signals.consistencyScore).toBe(100)
    expect(result.signals.isTdReliant).toBe(false)

    expect(result).toMatchInlineSnapshot(`
      {
        "components": {
          "ageAdjusted": {
            "value": 50,
          },
          "currentLevel": {
            "percentile": 0,
            "value": 0,
          },
          "opportunityQuality": {
            "efficiencyPercentile": 0,
            "shareScore": null,
            "value": 0,
            "volumePercentile": 0,
          },
          "reliability": {
            "consistencyScore": 100,
            "durabilityScore": 82,
            "value": 90,
          },
          "trajectory": {
            "slope": 0,
            "value": 50,
          },
        },
        "confidence": "high",
        "isRookie": false,
        "label": "Sell Now",
        "score": 36,
        "signals": {
          "ageCurveFactor": 0.67,
          "carryShare": null,
          "consistencyScore": 100,
          "currentShare": null,
          "depthMultiplier": 1.15,
          "depthOrder": 1,
          "draftCapital": null,
          "durabilityScore": 82,
          "injurySeasonCount": 0,
          "isBounceBack": false,
          "isBreakout": false,
          "isLateCareer": false,
          "isProspect": false,
          "isTdReliant": false,
          "ktcInfluenced": false,
          "momentum": 0,
          "momentumLabel": "stable",
          "peakAge": 25,
          "peakSeason": {
            "ppg": 12,
            "season": 2020,
          },
          "seasonsOfData": 5,
          "shareHistory": null,
          "shareTrendLabel": null,
          "shareVolatility": null,
          "targetShare": null,
          "tdDependency": 0.036,
          "teamOffenseRank": null,
          "yearsFromPeak": 1,
        },
      }
    `)
  })

  // ── Scenario 2: Accelerating bounce-back breakout (Path C, positive signals) ─
  // ppgs [8,8,8,14,14] with 2023 GP=9 → momentum accelerating, isBreakout, isBounceBack, label='Breakout'.
  it('accelerating breakout bounce-back: momentumLabel accelerating, isBreakout, isBounceBack', () => {
    const playerId = 'P_DS_HI'
    const playersMap = { [playerId]: makePlayer('RB', 24, 5) }
    const careerStats = clampHiCareerStats(playerId)

    const result = computeDynastyScore(
      playerId,
      playersMap,
      careerStats,
      breakoutCurves(),
      DEFAULT_PEAK_PPG,
      null,
      defaultPPRScoring(),
    )

    expect(result.confidence).toBe('high')
    expect(result.signals.momentumLabel).toBe('accelerating')
    expect(result.signals.isBreakout).toBe(true)
    expect(result.signals.isBounceBack).toBe(true)
    expect(result.label).toBe('Breakout')

    expect(result).toMatchInlineSnapshot(`
      {
        "components": {
          "ageAdjusted": {
            "value": 93,
          },
          "currentLevel": {
            "percentile": 0,
            "value": 0,
          },
          "opportunityQuality": {
            "efficiencyPercentile": 0,
            "shareScore": null,
            "value": 0,
            "volumePercentile": 0,
          },
          "reliability": {
            "consistencyScore": 68,
            "durabilityScore": 75,
            "value": 72,
          },
          "trajectory": {
            "slope": 0.198,
            "value": 80,
          },
        },
        "confidence": "high",
        "isRookie": false,
        "label": "Breakout",
        "score": 53,
        "signals": {
          "ageCurveFactor": 0.42,
          "carryShare": null,
          "consistencyScore": 68,
          "currentShare": null,
          "depthMultiplier": null,
          "depthOrder": null,
          "draftCapital": null,
          "durabilityScore": 75,
          "injurySeasonCount": 0,
          "isBounceBack": true,
          "isBreakout": true,
          "isLateCareer": false,
          "isProspect": false,
          "isTdReliant": false,
          "ktcInfluenced": false,
          "momentum": 0.577,
          "momentumLabel": "accelerating",
          "peakAge": 25,
          "peakSeason": {
            "ppg": 14,
            "season": 2023,
          },
          "seasonsOfData": 5,
          "shareHistory": null,
          "shareTrendLabel": null,
          "shareVolatility": null,
          "targetShare": null,
          "tdDependency": 0.031,
          "teamOffenseRank": null,
          "yearsFromPeak": -1,
        },
      }
    `)
  })

  // ── Scenario 3: Declining TD-reliant vet (Path C, negative signals) ─────────
  // ppgs [14,14,14,8,8], last season rush_td=8 → decelerating, isTdReliant, effectiveReliability penalty.
  it('declining TD-reliant vet: momentumLabel decelerating, isTdReliant, reliability penalty', () => {
    const playerId = 'P_DS_LO'
    const playersMap = { [playerId]: makePlayer('RB', 26, 6) }
    const careerStats = clampLoCareerStats(playerId)

    const result = computeDynastyScore(
      playerId,
      playersMap,
      careerStats,
      defaultCurves(),
      DEFAULT_PEAK_PPG,
      null,
      defaultPPRScoring(),
    )

    expect(result.confidence).toBe('high')
    expect(result.signals.momentumLabel).toBe('decelerating')
    expect(result.signals.isTdReliant).toBe(true)
    // effectiveReliability = round(reliabilityScore * 0.90) — reliability penalty applied
    expect(result.components.reliability.value).toBeLessThan(
      Math.round(
        result.components.reliability.consistencyScore * 0.45 +
        result.components.reliability.durabilityScore  * 0.55
      )
    )

    expect(result).toMatchInlineSnapshot(`
      {
        "components": {
          "ageAdjusted": {
            "value": 33,
          },
          "currentLevel": {
            "percentile": 0,
            "value": 0,
          },
          "opportunityQuality": {
            "efficiencyPercentile": 0,
            "shareScore": null,
            "value": 0,
            "volumePercentile": 0,
          },
          "reliability": {
            "consistencyScore": 72,
            "durabilityScore": 82,
            "value": 77,
          },
          "trajectory": {
            "slope": -0.177,
            "value": 23,
          },
        },
        "confidence": "high",
        "isRookie": false,
        "label": "Sell Now",
        "score": 22,
        "signals": {
          "ageCurveFactor": 0.67,
          "carryShare": null,
          "consistencyScore": 72,
          "currentShare": null,
          "depthMultiplier": null,
          "depthOrder": null,
          "draftCapital": null,
          "durabilityScore": 82,
          "injurySeasonCount": 0,
          "isBounceBack": false,
          "isBreakout": false,
          "isLateCareer": false,
          "isProspect": false,
          "isTdReliant": true,
          "ktcInfluenced": false,
          "momentum": -0.517,
          "momentumLabel": "decelerating",
          "peakAge": 25,
          "peakSeason": {
            "ppg": 14,
            "season": 2020,
          },
          "seasonsOfData": 5,
          "shareHistory": null,
          "shareTrendLabel": null,
          "shareVolatility": null,
          "targetShare": null,
          "tdDependency": 0.429,
          "teamOffenseRank": null,
          "yearsFromPeak": 1,
        },
      }
    `)
  })

  // ── Scenario 4: Two-season player (Path B, consistency default = 50) ─────────
  // 2 qualifying seasons → prospect blend; consistency null→50 shim is the key pin.
  it('two-season player: Path B blend, signals.consistencyScore === 50', () => {
    const playerId = 'P_DS_TWO'
    const playersMap = { [playerId]: makePlayer('WR', 23, 2) }
    const careerStats = {
      2023: { [playerId]: makeSeasonEntry(168, 14) },
      2024: { [playerId]: makeSeasonEntry(196, 14) },
    }

    const result = computeDynastyScore(
      playerId,
      playersMap,
      careerStats,
      defaultCurves(),
      DEFAULT_PEAK_PPG,
      null,
      defaultPPRScoring(),
    )

    expect(result.confidence).toBe('low')
    // The critical pin: < 3 seasons → computeConsistency returns null → ?? 50 shim
    expect(result.signals.consistencyScore).toBe(50)
    expect(result.signals.momentum).toBeNull()
    expect(result.signals.momentumLabel).toBeNull()

    expect(result).toMatchInlineSnapshot(`
      {
        "components": {
          "ageAdjusted": {
            "value": 80,
          },
          "currentLevel": {
            "percentile": 0,
            "value": 0,
          },
          "opportunityQuality": {
            "efficiencyPercentile": 0,
            "shareScore": null,
            "value": 0,
            "volumePercentile": 0,
          },
          "reliability": {
            "consistencyScore": 50,
            "durabilityScore": 82,
            "value": 68,
          },
          "trajectory": {
            "slope": 0.154,
            "value": 73,
          },
        },
        "confidence": "low",
        "isRookie": false,
        "label": "Breakout",
        "score": 42,
        "signals": {
          "ageCurveFactor": 0.49,
          "carryShare": null,
          "consistencyScore": 50,
          "currentShare": null,
          "depthMultiplier": null,
          "depthOrder": null,
          "draftCapital": null,
          "durabilityScore": 82,
          "injurySeasonCount": 0,
          "isBounceBack": false,
          "isBreakout": true,
          "isLateCareer": false,
          "isProspect": false,
          "isTdReliant": false,
          "ktcInfluenced": false,
          "momentum": null,
          "momentumLabel": null,
          "peakAge": 27,
          "peakSeason": {
            "ppg": 14,
            "season": 2024,
          },
          "seasonsOfData": 2,
          "shareHistory": null,
          "shareTrendLabel": null,
          "shareVolatility": null,
          "targetShare": null,
          "tdDependency": 0.031,
          "teamOffenseRank": null,
          "yearsFromPeak": -4,
        },
      }
    `)
  })

  // ── Scenario 5: One-season player (edge — consistency=50, momentum=null) ──────
  // Single qualifying season → consistency <3→50, momentum <4→null.
  // years_exp=2 routes to Path B (not true-prospect path).
  it('one-season player: momentum null, consistencyScore 50, no crash', () => {
    const playerId = 'P_DS_ONE'
    const playersMap = { [playerId]: makePlayer('RB', 25, 2) }
    const careerStats = {
      2024: { [playerId]: makeSeasonEntry(168, 14) },
    }

    const result = computeDynastyScore(
      playerId,
      playersMap,
      careerStats,
      defaultCurves(),
      DEFAULT_PEAK_PPG,
      null,
      defaultPPRScoring(),
    )

    expect(result.confidence).toBe('low')
    expect(result.signals.momentum).toBeNull()
    expect(result.signals.momentumLabel).toBeNull()
    expect(result.signals.consistencyScore).toBe(50)

    expect(result).toMatchInlineSnapshot(`
      {
        "components": {
          "ageAdjusted": {
            "value": 52,
          },
          "currentLevel": {
            "percentile": 0,
            "value": 0,
          },
          "opportunityQuality": {
            "efficiencyPercentile": 0,
            "shareScore": null,
            "value": 0,
            "volumePercentile": 0,
          },
          "reliability": {
            "consistencyScore": 50,
            "durabilityScore": 82,
            "value": 68,
          },
          "trajectory": {
            "slope": 0,
            "value": 50,
          },
        },
        "confidence": "low",
        "isRookie": false,
        "label": "Sell Now",
        "score": 34,
        "signals": {
          "ageCurveFactor": 0.64,
          "carryShare": null,
          "consistencyScore": 50,
          "currentShare": null,
          "depthMultiplier": null,
          "depthOrder": null,
          "draftCapital": null,
          "durabilityScore": 82,
          "injurySeasonCount": 0,
          "isBounceBack": false,
          "isBreakout": false,
          "isLateCareer": false,
          "isProspect": false,
          "isTdReliant": false,
          "ktcInfluenced": false,
          "momentum": null,
          "momentumLabel": null,
          "peakAge": 25,
          "peakSeason": {
            "ppg": 12,
            "season": 2024,
          },
          "seasonsOfData": 1,
          "shareHistory": null,
          "shareTrendLabel": null,
          "shareVolatility": null,
          "targetShare": null,
          "tdDependency": 0.036,
          "teamOffenseRank": null,
          "yearsFromPeak": 0,
        },
      }
    `)
  })
})
