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

import { computeDynastyScore, computeEmpiricalAgeCurves } from './dynastyScore.js'
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
