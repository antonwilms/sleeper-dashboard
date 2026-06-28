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

import { computeDynastyScore, computeEmpiricalAgeCurves, computeProspectScore, computePositionalRanks } from './dynastyScore.js'
import {
  makeSeasonEntry,
  defaultCurves,
  breakoutCurves,
  DEFAULT_PEAK_PPG,
  defaultPPRScoring,
  defaultVetCareerStats,
  clampHiCareerStats,
  clampLoCareerStats,
  makeKtcMap,
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

// ---------------------------------------------------------------------------
// Injury-vs-backup heuristic (durabilitySignals.js integration)
// ---------------------------------------------------------------------------
// These tests exercise the new classifyInjurySeason gate through computeDynastyScore.
// Uses targeted signal/component assertions rather than full inline snapshots since
// exact scores depend on many factors; injurySeasonCount is the key pin.
// ---------------------------------------------------------------------------

describe('injury-season gate — backup not penalised (dynasty)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('backup season (gs=0, thin stats, no adjacent starter) → injurySeasonCount === 0, durabilityScore not reduced', () => {
    // Career backup WR: all seasons have gs=0 and thin stats, no snap data.
    // None of the low-gp seasons trigger the contributor check → all classify as non-injury.
    const playerId = 'P_DS_BACKUP'
    const playersMap = { [playerId]: makePlayer('WR', 25, 5) }

    // backupEntry: gp<10, dnp≥3, gs=0, rec_tgt well below VOLUME_FLOOR[WR]=4/gp
    const backupEntry = (gp, dnp) => ({
      gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: 0,
      fantasyPoints: gp * 5,
      stats: { rec_tgt: 5, rec: 3, rec_yd: 30, rec_td: 0 },
    })

    const careerStats = {
      2020: { [playerId]: backupEntry(8, 4) },
      2021: { [playerId]: backupEntry(8, 4) },
      2022: { [playerId]: backupEntry(8, 4) },
      2023: { [playerId]: backupEntry(8, 4) },
      2024: { [playerId]: backupEntry(8, 4) },
    }

    const result = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    expect(result.signals.injurySeasonCount).toBe(0)
    // With no injury penalty: base is purely from weighted avg games / 17
    // durabilityScore should be > 0 (not hammered by ×0.70/×0.85)
    const expectedBase = Math.round((8 / 17) * 100)
    expect(result.components.reliability.durabilityScore).toBe(expectedBase)
  })

  it('starter injury season (gs high) → injurySeasonCount ≥ 1, lower durabilityScore vs backup baseline', () => {
    // Same low-gp/high-dnp seasons but gamesStarted is high → contributor evidence fires
    const playerId = 'P_DS_INJURY'
    const playersMap = { [playerId]: makePlayer('WR', 25, 5) }

    const injuryEntry = (gp, dnp) => ({
      gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: gp,   // all games started
      fantasyPoints: gp * 5,
      stats: { rec_tgt: 5, rec: 3, rec_yd: 30, rec_td: 0 },
    })

    const careerStats = {
      2020: { [playerId]: injuryEntry(8, 4) },
      2021: { [playerId]: injuryEntry(8, 4) },
      2022: { [playerId]: injuryEntry(8, 4) },
      2023: { [playerId]: injuryEntry(8, 4) },
      2024: { [playerId]: injuryEntry(8, 4) },
    }

    const result = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    expect(result.signals.injurySeasonCount).toBeGreaterThanOrEqual(3)
    // ≥3 injury seasons → durabilityScore *= 0.70
    const baseBeforePenalty = Math.round((8 / 17) * 100)
    const penalisedBase = Math.round(baseBeforePenalty * 0.70)
    expect(result.components.reliability.durabilityScore).toBe(penalisedBase)
    // Backup version has no penalty, so its durabilityScore should be higher
    expect(result.components.reliability.durabilityScore).toBeLessThan(baseBeforePenalty)
  })

  // Correction 2 — full-IR adjacent rescue:
  // A gp=0/dnp≥3 season (present-but-benched) increments injurySeasonCount when
  // an adjacent season shows the player was a starter.
  it('full-IR season (gp=0, dnp≥3) with prior full-starter neighbour → adjacent rescue increments count', () => {
    const playerId = 'P_DS_IR'
    const playersMap = { [playerId]: makePlayer('RB', 26, 5) }

    const fullStarter = (gp) => ({
      gamesPlayed: gp, dnpWeeks: 0, gamesStarted: gp,
      fantasyPoints: gp * 12,
      stats: { rush_att: 200, rush_yd: 900, rush_td: 8 },
    })
    // gp=0 / dnp=8: present in response but never played (full-season IR)
    const fullIR = {
      gamesPlayed: 0, dnpWeeks: 8, gamesStarted: 0,
      fantasyPoints: 0, stats: {},
    }

    const careerStats = {
      2022: { [playerId]: fullStarter(16) },   // prior year: full starter → neighbour rescue
      2023: { [playerId]: fullIR },             // target: gp=0, dnp=8 (base trigger fires)
      2024: { [playerId]: fullStarter(15) },   // next year: also starter
    }

    const resultIR = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    // Adjacent rescue: 2022 (or 2024) starter rescues the 2023 full-IR season
    expect(resultIR.signals.injurySeasonCount).toBeGreaterThanOrEqual(1)
  })

  it('gp=0/dnp≥3 season where neighbours are also backups → NOT counted (no rescue)', () => {
    const playerId = 'P_DS_IR_NORESCUE'
    const playersMap = { [playerId]: makePlayer('RB', 26, 5) }

    // Backup seasons with gp≥8 so they appear in seasonHistory (avoiding Path A2)
    // but gs=0 and thin stats so they provide no contributor evidence for rescue.
    const backupEntry = (gp, dnp) => ({
      gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: 0,
      fantasyPoints: gp * 3,
      stats: { rush_att: 10, rush_yd: 30, rush_td: 0 },  // rush_att/gp ≈ 1 << RB VOLUME_FLOOR 8
    })
    const fullIR = {
      gamesPlayed: 0, dnpWeeks: 8, gamesStarted: 0,
      fantasyPoints: 0, stats: {},
    }

    const careerStats = {
      2021: { [playerId]: backupEntry(10, 0) },  // backup neighbour — qualifying (gp≥8), no contributor evidence
      2022: { [playerId]: backupEntry(10, 0) },  // backup neighbour — qualifying (gp≥8), no contributor evidence
      2023: { [playerId]: fullIR },              // target: gp=0, dnp=8
      2024: { [playerId]: backupEntry(10, 0) },  // backup neighbour — qualifying (gp≥8), no contributor evidence
    }

    const resultNoRescue = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    // No rescue from backup neighbours → injurySeasonCount stays 0
    expect(resultNoRescue.signals.injurySeasonCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests 1–7: robustness guards (D1-B / D1-C)
// ---------------------------------------------------------------------------

describe('robustness guards (D1-B / D1-C)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('1: D1-C — null years_exp + zero qualifying seasons returns Limited Data, does not throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_NULLEXP'
    const playersMap = { [playerId]: makePlayer('RB', 26, null) }
    // 5 GP — below the ≥8 threshold, so seasonHistory stays empty
    const careerStats = { 2024: { [playerId]: makeSeasonEntry(40, 5) } }

    let result
    expect(() => {
      result = computeDynastyScore(playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())
    }).not.toThrow()

    expect(result.score).toBe(15)
    expect(result.label).toBe('Limited Data')
    expect(result.confidence).toBe('none')
    expect(result.components).toBeNull()
    expect(result.signals.isDataGap).toBe(true)
    expect(result.signals.seasonsOfData).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('years_exp=null')
  })

  it('1 variant: D1-C with ktcMap — score includes KTC percentile contribution', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_NULLEXP_KTC'
    const playersMap = { [playerId]: makePlayer('RB', 26, null) }
    const careerStats = { 2024: { [playerId]: makeSeasonEntry(40, 5) } }
    const ktcMap = makeKtcMap(playerId, 'RB', 5000, playersMap)

    const result = computeDynastyScore(playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring(), ktcMap)

    expect(result.label).toBe('Limited Data')
    expect(result.signals.isDataGap).toBe(true)
    expect(result.signals.ktcInfluenced).toBe(true)
    expect(result.score).toBeGreaterThan(15)
  })

  it('2: D1-C sanity — null years_exp + qualifying season routes to components, no A4 warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_NULLEXP_Q'
    const playersMap = { [playerId]: makePlayer('RB', 26, null) }
    // 12 GP ≥ 8 — qualifies
    const careerStats = { 2024: { [playerId]: makeSeasonEntry(120, 12) } }

    const result = computeDynastyScore(playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())

    expect(result.components).not.toBeNull()
    expect(result.signals.isDataGap).toBeUndefined()
    const a4Warns = warnSpy.mock.calls.filter(c => c[0].includes('years_exp=null'))
    expect(a4Warns).toHaveLength(0)
  })

  it('3: NaN fantasyPoints in only qualifying-GP season → season filtered → A2 Limited Data (isUnprovenVet), warns §2a', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_NANFP'
    const playersMap = { [playerId]: makePlayer('WR', 27, 5) }
    // GP=14 passes the ≥8 gate but NaN fp gets filtered by §2a — seasonHistory ends up empty
    const careerStats = { 2024: { [playerId]: makeSeasonEntry(NaN, 14) } }

    const result = computeDynastyScore(playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())

    expect(result.label).toBe('Limited Data')
    // A2 fires first (years_exp ≥ 2 + empty seasonHistory) — isUnprovenVet, NOT isDataGap
    expect(result.signals.isUnprovenVet).toBe(true)
    expect(result.signals.isDataGap).toBeUndefined()
    const nanWarn = warnSpy.mock.calls.find(c => c[0].includes('non-finite season totals'))
    expect(nanWarn).toBeDefined()
  })

  it('4: one poisoned season among many skipped; result deep-equals control without it', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const pidA = 'P_DG_SKIP_A'
    const pidB = 'P_DG_SKIP_B'
    const mapA = { [pidA]: makePlayer('RB', 26, 5) }
    const mapB = { [pidB]: makePlayer('RB', 26, 5) }
    const csA = { ...defaultVetCareerStats(pidA), 2019: { [pidA]: makeSeasonEntry(NaN, 14) } }
    const csB = defaultVetCareerStats(pidB)

    const rA = computeDynastyScore(pidA, mapA, csA, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())
    const rB = computeDynastyScore(pidB, mapB, csB, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring())

    expect(rA.score).toBe(rB.score)
    expect(rA.label).toBe(rB.label)
    expect(rA.confidence).toBe(rB.confidence)
    expect(rA.components).toEqual(rB.components)
    expect(rA.signals.seasonsOfData).toBe(rB.signals.seasonsOfData)
    const nanWarn = warnSpy.mock.calls.find(c => c[0].includes('non-finite season totals'))
    expect(nanWarn).toBeDefined()
  })

  it('5: NaN carryShare → non-finite finalScore → Limited Data with isNonFinite, warns §2d', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_NANSHARE'
    const playersMap = { [playerId]: makePlayer('RB', 26, 5) }
    const careerStats = defaultVetCareerStats(playerId)
    // carryShare: NaN → shareScore NaN → opportunityScore NaN → componentScore NaN → finalScore NaN
    const teamContext = { playerShares: { [playerId]: { carryShare: NaN } } }

    const result = computeDynastyScore(
      playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(), null, teamContext,
    )

    expect(result.label).toBe('Limited Data')
    expect(result.signals.isNonFinite).toBe(true)
    expect(result.confidence).toBe('none')
    expect(result.components).toBeNull()
    const nanWarn = warnSpy.mock.calls.find(c => c[0].includes('non-finite finalScore'))
    expect(nanWarn).toBeDefined()
  })

  it('6: NaN current-season fantasyPoints in prospect degrades to prior-only score, warns §2e', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pick = { round: 1, pick: 5 }  // hasPremiumPick=true → 35-cap disabled

    const pidNaN  = 'P_DG_PROSP_NAN'
    const pidCtrl = 'P_DG_PROSP_CTRL'

    const rNaN = computeDynastyScore(
      pidNaN,
      { [pidNaN]: makePlayer('WR', 22, 0) },
      { 2024: { [pidNaN]: makeSeasonEntry(NaN, 6) } },
      defaultCurves(), DEFAULT_PEAK_PPG, pick, defaultPPRScoring(),
    )
    const rCtrl = computeDynastyScore(
      pidCtrl,
      { [pidCtrl]: makePlayer('WR', 22, 0) },
      {},
      defaultCurves(), DEFAULT_PEAK_PPG, pick, defaultPPRScoring(),
    )

    expect(Number.isFinite(rNaN.score)).toBe(true)
    expect(rNaN.score).toBe(rCtrl.score)
    const blendWarn = warnSpy.mock.calls.find(c => c[0].includes('evidence blend skipped'))
    expect(blendWarn).toBeDefined()
  })

  it('7: finite inputs — isDataGap and isNonFinite absent, no console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const playerId = 'P_DG_FINITE_REG'
    const playersMap = { [playerId]: makePlayer('RB', 26, 5) }
    const careerStats = defaultVetCareerStats(playerId)

    const result = computeDynastyScore(
      playerId, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null, defaultPPRScoring(),
    )

    expect(result.signals.isDataGap).toBeUndefined()
    expect(result.signals.isNonFinite).toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Test 8: computeEmpiricalAgeCurves — non-finite bucket guard
// ---------------------------------------------------------------------------

describe('computeEmpiricalAgeCurves — non-finite bucket guard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('8: NaN PPG entry excluded from age bucket; curves identical to control without it', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // season = current year so ageAtSeason = player.age exactly (no subtraction offset)
    const season = new Date().getFullYear()
    const p1 = 'P_DG_CURVE1'
    const p2 = 'P_DG_CURVE2'
    const p3 = 'P_DG_CURVE3'  // poisoned

    const allPlayersMap = {
      [p1]: { position: 'RB', age: 26, years_exp: 5 },
      [p2]: { position: 'RB', age: 26, years_exp: 5 },
      [p3]: { position: 'RB', age: 26, years_exp: 5 },
    }
    const poisonedResult = computeEmpiricalAgeCurves(
      {
        [season]: {
          [p1]: makeSeasonEntry(170, 17),
          [p2]: makeSeasonEntry(150, 15),
          [p3]: makeSeasonEntry(NaN, 16),  // excluded by §2f guard
        },
      },
      { ...allPlayersMap },
    )
    const controlResult = computeEmpiricalAgeCurves(
      {
        [season]: {
          [p1]: makeSeasonEntry(170, 17),
          [p2]: makeSeasonEntry(150, 15),
        },
      },
      { [p1]: allPlayersMap[p1], [p2]: allPlayersMap[p2] },
    )

    expect(poisonedResult.curves).toEqual(controlResult.curves)
    expect(poisonedResult.positionPeakPPG).toEqual(controlResult.positionPeakPPG)
    expect(Number.isFinite(poisonedResult.positionPeakPPG.RB)).toBe(true)

    const bucketWarn = warnSpy.mock.calls.find(c => c[0].includes('non-finite PPG excluded'))
    expect(bucketWarn).toBeDefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// draftMultiplier — round-1 late-pick catch-all (>12-team leagues)
// ---------------------------------------------------------------------------

describe('draftMultiplier — round-1 late-pick catch-all', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('R1 pick 14 receives back-of-R1 multiplier (1.05), not R4+ (0.65); picks 3/8/12 unchanged', () => {
    const player = { position: 'WR', age: 22, years_exp: 0, player_id: 'P_DM_LATER1' }

    const score = (pick) =>
      computeProspectScore(player, pick, null, DEFAULT_PEAK_PPG).score

    // pick 14 must equal pick 12 — both get 1.05; before the fix pick 14 fell to 0.65
    expect(score({ round: 1, pick: 14 })).toBe(score({ round: 1, pick: 12 }))

    // regression: existing tier boundaries unchanged
    expect(score({ round: 1, pick:  3 })).toBe(72)
    expect(score({ round: 1, pick:  8 })).toBe(63)
    expect(score({ round: 1, pick: 12 })).toBe(58)
  })
})

// ---------------------------------------------------------------------------
// bounce-back label (D1-A / F2-C)
// ---------------------------------------------------------------------------

describe('bounce-back label (D1-A / F2-C)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('D1-A: 2-season bad-current WR loses the Bounce-back label', () => {
    // 2023: ppg=10, gp=9 (shortened prior). 2024: ppg=7, gp=14.
    // (a) fires but recovery 7 < priorMax 10 → isBounceBack false.
    // Old code: 2-season tautology fired → label was 'Bounce-back'.
    const playerId = 'P_DS_D1A'
    const playersMap = { [playerId]: makePlayer('WR', 24, 2) }
    const careerStats = {
      2023: { [playerId]: makeSeasonEntry(90,  9) },
      2024: { [playerId]: makeSeasonEntry(98, 14) },
    }

    const result = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    expect(result.signals.isBounceBack).toBe(false)
    expect(result.label).not.toBe('Bounce-back')
  })

  it('F2-C: injury-recovery WR gains the Bounce-back label', () => {
    // 2021/2022: 14 ppg/14 GP. 2023: gp=3, dnpWeeks=10, gs=3 (contributor evidence).
    // 2024: 16 ppg/14 GP ≥ priorMax 14 → isBounceBack true.
    // Age 27 → not breakout-eligible; not late-career (WR cap 28 + 5 = 33).
    // → label === 'Bounce-back'.
    const playerId = 'P_DS_F2C'
    const playersMap = { [playerId]: makePlayer('WR', 27, 6) }
    const careerStats = {
      2021: { [playerId]: makeSeasonEntry(196, 14) },
      2022: { [playerId]: makeSeasonEntry(196, 14) },
      2023: { [playerId]: { fantasyPoints: 24, gamesPlayed: 3, dnpWeeks: 10, gamesStarted: 3, stats: {} } },
      2024: { [playerId]: makeSeasonEntry(224, 14) },
    }

    const result = computeDynastyScore(
      playerId, playersMap, careerStats,
      defaultCurves(), DEFAULT_PEAK_PPG,
      null, defaultPPRScoring(),
    )

    expect(result.signals.isBounceBack).toBe(true)
    expect(result.label).toBe('Bounce-back')
  })
})

// ---------------------------------------------------------------------------
// T1–T4: peak-age dedup (D4-B)
// ---------------------------------------------------------------------------

describe('peak-age dedup (D4-B)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // T1 — Dedup lock: positionPeakAge from builder equals independent oracle re-derivation.
  it('T1: builder positionPeakAge matches independent oracle for all four positions', () => {
    // Use current year so ageAtSeason = player.age (no offset).
    const yr = new Date().getFullYear()

    // ~3 ages per position: 3 players with different ages, all gp ≥ 10.
    const positions = {
      QB: [{ pid: 'P_PA_QB1', age: 27 }, { pid: 'P_PA_QB2', age: 31 }, { pid: 'P_PA_QB3', age: 35 }],
      RB: [{ pid: 'P_PA_RB1', age: 23 }, { pid: 'P_PA_RB2', age: 26 }, { pid: 'P_PA_RB3', age: 30 }],
      WR: [{ pid: 'P_PA_WR1', age: 24 }, { pid: 'P_PA_WR2', age: 27 }, { pid: 'P_PA_WR3', age: 31 }],
      TE: [{ pid: 'P_PA_TE1', age: 25 }, { pid: 'P_PA_TE2', age: 28 }, { pid: 'P_PA_TE3', age: 33 }],
    }
    // PPGs per position/age (older → lower so caps engage for some positions).
    const ppgs = {
      QB: [20, 24, 14],
      RB: [14, 15, 7],
      WR: [10, 14, 8],
      TE: [8, 12, 6],
    }

    const playersMap = {}
    const seasonData = {}
    for (const [pos, players] of Object.entries(positions)) {
      players.forEach(({ pid, age }, i) => {
        playersMap[pid] = { position: pos, age, years_exp: 5 }
        seasonData[pid] = makeSeasonEntry(ppgs[pos][i] * 17, 17)
      })
    }
    const careerStats = { [yr]: seasonData }

    const { curves, positionPeakAge } = computeEmpiricalAgeCurves(careerStats, playersMap)

    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      // Independent oracle = the OLD inline logic, kept here to pin the value independently.
      const cap = { QB: 32, RB: 25, WR: 28, TE: 29 }[pos]
      const curve = curves[pos]
      const expected = curve.length === 0 ? null
        : Math.min(curve.reduce((b, p) => p.medianPPG > b.medianPPG ? p : b, curve[0]).age, cap)
      expect(positionPeakAge[pos]).toBe(expected)
    }
  })

  // T2 — Consumer equivalence: map-threaded vs fallback produce identical signals.
  it('T2: positionPeakAge map vs fallback path give identical computeDynastyScore results', () => {
    const yr = new Date().getFullYear()
    const pid = 'P_PA_T2'
    const playersMap = { [pid]: { position: 'RB', age: 26, years_exp: 5 } }
    const careerStats = { [yr]: { [pid]: makeSeasonEntry(180, 17) } }

    const { curves, positionPeakPPG, positionPeakAge } = computeEmpiricalAgeCurves(careerStats, playersMap)

    const withMap = computeDynastyScore(
      pid, playersMap, careerStats, curves, positionPeakPPG,
      null, defaultPPRScoring(), null, null, null, null, positionPeakAge,
    )
    const withoutMap = computeDynastyScore(
      pid, playersMap, careerStats, curves, positionPeakPPG,
      null, defaultPPRScoring(),
    )

    expect(withMap.signals.peakAge).toBe(withoutMap.signals.peakAge)
    expect(withMap.signals.yearsFromPeak).toBe(withoutMap.signals.yearsFromPeak)
    expect(withMap.signals.isLateCareer).toBe(withoutMap.signals.isLateCareer)
    expect(withMap).toEqual(withoutMap)
  })

  // T3 — Late-career gate fires through the map.
  it('T3: isLateCareer fires via map (RB age 30, capped peak 25 → yearsFromPeak 5)', () => {
    const yr = new Date().getFullYear()
    // One RB player in the curve at age 25 so the curve peak is 25 = the RB cap.
    const curvePid = 'P_PA_T3_CURVE'
    const playerPid = 'P_PA_T3_PLAYER'

    // Build a careerStats that populates the RB curve at age 25.
    const curvePlayers = { [curvePid]: { position: 'RB', age: 25, years_exp: 4 } }
    const { curves, positionPeakPPG, positionPeakAge } = computeEmpiricalAgeCurves(
      { [yr]: { [curvePid]: makeSeasonEntry(180, 17) } },
      curvePlayers,
    )

    // Late-career player: RB age 30 with a qualifying season history.
    const playersMap = { [playerPid]: { position: 'RB', age: 30, years_exp: 8 } }
    const careerStats = defaultVetCareerStats(playerPid)

    const result = computeDynastyScore(
      playerPid, playersMap, careerStats, curves, positionPeakPPG,
      null, defaultPPRScoring(), null, null, null, null, positionPeakAge,
    )

    expect(result.signals.peakAge).toBe(25)
    expect(result.signals.yearsFromPeak).toBe(5)
    expect(result.signals.isLateCareer).toBe(true)
    // Late-career labels
    const lateLabels = new Set(['Veteran Producer', 'Managed Decline', 'Sell Now', 'Fading'])
    expect(lateLabels.has(result.label)).toBe(true)
  })

  // T4 — Empty-curve position: positionPeakAge[pos] === null and consumer fallback agrees.
  it('T4: empty-curve position yields positionPeakAge null; consumer signals.peakAge null both ways', () => {
    const yr = new Date().getFullYear()
    // careerStats with only RB entries (no QB, WR, TE gp ≥ 10 seasons).
    const rbPid = 'P_PA_T4_RB'
    const playersMap = { [rbPid]: { position: 'RB', age: 25, years_exp: 4 } }
    const { curves, positionPeakPPG, positionPeakAge } = computeEmpiricalAgeCurves(
      { [yr]: { [rbPid]: makeSeasonEntry(180, 17) } },
      playersMap,
    )

    // QB has an empty curve in this careerStats.
    expect(curves.QB).toEqual([])
    expect(positionPeakAge.QB).toBeNull()

    // A QB player calling computeDynastyScore should get peakAge null, isLateCareer false.
    const qbPid = 'P_PA_T4_QB'
    const qbMap = { [qbPid]: { position: 'QB', age: 35, years_exp: 10 } }
    const qbCareerStats = {
      2020: { [qbPid]: makeSeasonEntry(300, 17, { pass_att: 400, pass_yd: 4200, pass_td: 35, pass_int: 8 }) },
      2021: { [qbPid]: makeSeasonEntry(280, 17, { pass_att: 380, pass_yd: 3900, pass_td: 32, pass_int: 7 }) },
      2022: { [qbPid]: makeSeasonEntry(270, 17, { pass_att: 360, pass_yd: 3700, pass_td: 28, pass_int: 9 }) },
    }

    const withMap = computeDynastyScore(
      qbPid, qbMap, qbCareerStats, curves, positionPeakPPG,
      null, defaultPPRScoring(), null, null, null, null, positionPeakAge,
    )
    const withoutMap = computeDynastyScore(
      qbPid, qbMap, qbCareerStats, curves, positionPeakPPG,
      null, defaultPPRScoring(),
    )

    expect(withMap.signals.peakAge).toBeNull()
    expect(withMap.signals.isLateCareer).toBe(false)
    expect(withoutMap.signals.peakAge).toBeNull()
    expect(withoutMap.signals.isLateCareer).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computePositionalRanks — recentRankSeason provenance
// ---------------------------------------------------------------------------

describe('computePositionalRanks — recentRankSeason provenance', () => {
  const currentSeason = 2025

  // Four WRs with varying qualification scenarios
  const playerRows = [
    { player_id: 'a', position: 'WR', currentSeasonPPG: 15, dynastyScore: { score: 80 } },
    { player_id: 'b', position: 'WR', currentSeasonPPG: 10, dynastyScore: { score: 70 } },
    { player_id: 'c', position: 'WR', currentSeasonPPG: 9,  dynastyScore: { score: 60 } },
    { player_id: 'd', position: 'WR', currentSeasonPPG: 5,  dynastyScore: { score: 50 } },
  ]

  const careerStats = {
    2021: { d: { gamesPlayed: 16, fantasyPoints: 200 } },
    2022: {},
    2023: { c: { gamesPlayed: 16, fantasyPoints: 144 } },
    2024: {
      b: { gamesPlayed: 12, fantasyPoints: 120 },
      c: { gamesPlayed: 4,  fantasyPoints: 40  },
    },
    2025: {
      a: { gamesPlayed: 10, fantasyPoints: 150 },
      b: { gamesPlayed: 3,  fantasyPoints: 30  },
      c: { gamesPlayed: 2,  fantasyPoints: 18  },
      d: { gamesPlayed: 2,  fantasyPoints: 10  },
    },
  }

  it('ranks are unchanged (additive field does not perturb recentRank values)', () => {
    const result = computePositionalRanks(playerRows, careerStats, currentSeason)
    expect(result.get('a').recentRank).toBe(1)
    expect(result.get('b').recentRank).toBe(2)
    expect(result.get('c').recentRank).toBe(3)
    expect(result.get('d').recentRank).toBe(4)
  })

  it('recentRankSeason provenance: current / fallback / null', () => {
    const result = computePositionalRanks(playerRows, careerStats, currentSeason)
    expect(result.get('a').recentRankSeason).toBe(2025)   // current season ≥6 GP
    expect(result.get('b').recentRankSeason).toBe(2024)   // fallback: 2024 ≥8 GP
    expect(result.get('c').recentRankSeason).toBe(2023)   // fallback: skip 2024 (<8 GP), use 2023
    expect(result.get('d').recentRankSeason).toBe(null)   // 2021 beyond 3-season cap → null
  })

  it('lookback boundary: exactly currentSeason−3 is in-window', () => {
    const boundary = currentSeason - 3  // 2022
    const rowsE = [...playerRows, { player_id: 'e', position: 'WR', currentSeasonPPG: 8, dynastyScore: { score: 40 } }]
    const statsE = {
      ...careerStats,
      [boundary]: { ...careerStats[boundary], e: { gamesPlayed: 12, fantasyPoints: 96 } },
      2025: { ...careerStats[2025], e: { gamesPlayed: 1, fantasyPoints: 5 } },
    }
    const result = computePositionalRanks(rowsE, statsE, currentSeason)
    expect(result.get('e').recentRankSeason).toBe(boundary)  // 2022 is in-window (break is s < currentSeason - 3)
  })

  it('empty rows → empty Map', () => {
    expect(computePositionalRanks([], careerStats, currentSeason).size).toBe(0)
  })

  it('null currentSeason → empty Map', () => {
    expect(computePositionalRanks(playerRows, careerStats, null).size).toBe(0)
  })
})
