import { describe, it, expect } from 'vitest'
import { computeBreakoutFlag, computeBounceBackFlag, computeTdReliance } from './projectionSignals.js'

// Minimal age curve: single point so interpolateAgeCurve clamps to it.
function makeCurve(age, medianPPG) {
  return [{ age, medianPPG }]
}

describe('computeBreakoutFlag', () => {
  it('null age → false (age != null guard)', () => {
    const curve = makeCurve(22, 10)
    expect(computeBreakoutFlag(null, 18, curve, 20)).toBe(false)
  })

  it('old player (age > 24) → false even with high rawRatio', () => {
    // interpolateAgeCurve clamps to the single-point curve → medianPPG = 5
    // ageFactor = 5/20 = 0.25, rawRatio = (18/20)/0.25 = 3.6 > 1.3 — but age=25 > 24
    const curve = makeCurve(25, 5)
    expect(computeBreakoutFlag(25, 18, curve, 20)).toBe(false)
  })

  it('young + above-curve → true (byte-identical port claim)', () => {
    // age=22, currentPPG=18, curve gives medianPPG=10, peakPPG=20
    // expectedMedian = 10, ageFactor = 10/20 = 0.5
    // rawRatio = (18/20) / 0.5 = 0.9 / 0.5 = 1.8 > 1.3 → true
    const curve = makeCurve(22, 10)
    expect(computeBreakoutFlag(22, 18, curve, 20)).toBe(true)
  })

  it('young + at-curve → false (rawRatio ≈ 1.0)', () => {
    // age=22, currentPPG=10, ageFactor=0.5, rawRatio=(10/20)/0.5=1.0 — not > 1.3
    const curve = makeCurve(22, 10)
    expect(computeBreakoutFlag(22, 10, curve, 20)).toBe(false)
  })

  it('zero ageFactor → false (guard: ageFactor > 0 ? ... : 0)', () => {
    // curve with medianPPG=0 → ageFactor=0 → rawRatio set to 0 → not > 1.3
    const curve = makeCurve(22, 0)
    expect(computeBreakoutFlag(22, 18, curve, 20)).toBe(false)
  })

  it('age exactly 24 → eligible (≤ 24 boundary)', () => {
    // age=24 is still eligible; rawRatio must be > 1.3 to fire
    const curve = makeCurve(24, 10)
    // ageFactor=0.5, rawRatio=(18/20)/0.5=1.8 > 1.3 → true
    expect(computeBreakoutFlag(24, 18, curve, 20)).toBe(true)
  })
})

describe('computeBounceBackFlag', () => {
  // careerStats builder: entries keyed by season for player 'P1'
  function cs(entries) {
    const out = {}
    for (const [season, e] of Object.entries(entries)) out[season] = { P1: e }
    return out
  }

  it('fewer than 2 qualifying seasons → false', () => {
    expect(computeBounceBackFlag([], {}, 'P1', 'WR')).toBe(false)
    expect(computeBounceBackFlag([{ season: 2024, ppg: 12, gamesPlayed: 14 }], {}, 'P1', 'WR')).toBe(false)
    expect(computeBounceBackFlag(null, {}, 'P1', 'WR')).toBe(false)
  })

  it('prior season GP >= 10 → false (not shortened)', () => {
    // prevQ 2023 has gp=10: path (a) fails (not < 10); no sub-8-GP entry → path (b) fails
    const qualifying = [
      { season: 2022, ppg: 12, gamesPlayed: 14 },
      { season: 2023, ppg: 9,  gamesPlayed: 10 },  // prior — not shortened (>=10)
      { season: 2024, ppg: 15, gamesPlayed: 16 },  // current
    ]
    const careerStats = cs({ 2022: { gamesPlayed: 14 }, 2023: { gamesPlayed: 10 }, 2024: { gamesPlayed: 16 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(false)
  })

  it('prior shortened + current beats prior max → true', () => {
    // [12@14GP(2022), 9@8GP(2023), 15@16GP(2024)]. (a): prevQ 2023 === downSeason, gp=8 < 10.
    // priorMax = max(12, 9) = 12. current 15 >= 12 → true
    const qualifying = [
      { season: 2022, ppg: 12, gamesPlayed: 14 },
      { season: 2023, ppg: 9,  gamesPlayed: 8  },  // shortened
      { season: 2024, ppg: 15, gamesPlayed: 16 },  // beats priorMax
    ]
    const careerStats = cs({ 2022: { gamesPlayed: 14 }, 2023: { gamesPlayed: 8 }, 2024: { gamesPlayed: 16 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(true)
  })

  it('recovers only to second-best prior → false (D1-A: must match/beat prior career best)', () => {
    // D1-A pin. [14@14GP(2021), 12@14GP(2022), 9@8GP(2023), 13@16GP(2024)].
    // (a) fires: prevQ 2023 === downSeason, gp=8 < 10.
    // priorMax = max(14, 12, 9) = 14. current 13 < 14 → false.
    // Old code fired via secondHighest computed over all ppgs including current (tautology).
    const qualifying = [
      { season: 2021, ppg: 14, gamesPlayed: 14 },
      { season: 2022, ppg: 12, gamesPlayed: 14 },
      { season: 2023, ppg: 9,  gamesPlayed: 8  },  // shortened (prev)
      { season: 2024, ppg: 13, gamesPlayed: 16 },  // current: < priorMax(14)
    ]
    const careerStats = cs({
      2021: { gamesPlayed: 14 }, 2022: { gamesPlayed: 14 },
      2023: { gamesPlayed: 8  }, 2024: { gamesPlayed: 16 },
    })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(false)
  })

  it('mutation guard — input array unchanged after call', () => {
    const qualifying = [
      { season: 2022, ppg: 12, gamesPlayed: 14 },
      { season: 2023, ppg: 9,  gamesPlayed: 8  },
      { season: 2024, ppg: 15, gamesPlayed: 16 },
    ]
    const careerStats = cs({ 2022: { gamesPlayed: 14 }, 2023: { gamesPlayed: 8 }, 2024: { gamesPlayed: 16 } })
    const copy = qualifying.map(s => ({ ...s }))
    computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')
    expect(qualifying).toEqual(copy)
  })

  it('D1-A headline: 2-season tautology no longer fires', () => {
    // Old code: 2-season qualifying → secondHighest === current → always true when (a) fires.
    // New code: recovery 7 < priorMax 10 → false.
    const qualifying = [
      { season: 2023, ppg: 10, gamesPlayed: 9  },
      { season: 2024, ppg: 7,  gamesPlayed: 14 },
    ]
    const careerStats = cs({ 2023: { gamesPlayed: 9 }, 2024: { gamesPlayed: 14 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(false)
  })

  it('2-season genuine recovery still fires', () => {
    // current ppg 12 >= priorMax 10 → true
    const qualifying = [
      { season: 2023, ppg: 10, gamesPlayed: 9  },
      { season: 2024, ppg: 12, gamesPlayed: 14 },
    ]
    const careerStats = cs({ 2023: { gamesPlayed: 9 }, 2024: { gamesPlayed: 14 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(true)
  })

  it('equality boundary — current ppg === priorMax → true (>= pins equality)', () => {
    const qualifying = [
      { season: 2023, ppg: 10, gamesPlayed: 9  },
      { season: 2024, ppg: 10, gamesPlayed: 14 },
    ]
    const careerStats = cs({ 2023: { gamesPlayed: 9 }, 2024: { gamesPlayed: 14 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(true)
  })

  it('F2-C: sub-8-GP injury season recovery fires', () => {
    // qualifying skips 2023 (4 GP). careerStats 2023: gp=4, dnp=8, gs=4 → contributor
    // evidence (gs/gp=1.0 ≥ START_RATE_FLOOR) → classifyInjurySeason true.
    // current 15.5 >= priorMax 15 → true. Old code: false (2023 invisible to qualifying).
    const qualifying = [
      { season: 2022, ppg: 15,  gamesPlayed: 16 },
      { season: 2024, ppg: 15.5, gamesPlayed: 16 },
    ]
    const careerStats = cs({
      2022: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 14, stats: {} },
      2023: { gamesPlayed: 4,  dnpWeeks: 8, gamesStarted: 4,  stats: {} },
      2024: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 14, stats: {} },
    })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'RB')).toBe(true)
  })

  it('F2-C: 0-GP full-IR year fires via adjacent rescue', () => {
    // 2023: gp=0, dnp=14, gs=0 — no self-evidence. 2022 has gs=14 → adjacent rescue.
    const qualifying = [
      { season: 2022, ppg: 15,  gamesPlayed: 16 },
      { season: 2024, ppg: 15.5, gamesPlayed: 16 },
    ]
    const careerStats = cs({
      2022: { gamesPlayed: 16, dnpWeeks: 0,  gamesStarted: 14, stats: {} },
      2023: { gamesPlayed: 0,  dnpWeeks: 14, gamesStarted: 0,  stats: {} },
      2024: { gamesPlayed: 16, dnpWeeks: 0,  gamesStarted: 14, stats: {} },
    })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'RB')).toBe(true)
  })

  it('F2-C: backup noise excluded', () => {
    // 2023: gp=3, dnp=5, gs=0, thin rec_tgt — no contributor evidence in 2022/2023/2024
    // → classifyInjurySeason false → false even though current ppg > priorMax
    const qualifying = [
      { season: 2022, ppg: 15, gamesPlayed: 16 },
      { season: 2024, ppg: 16, gamesPlayed: 16 },
    ]
    const careerStats = cs({
      2022: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 0, stats: { rec_tgt: 1 } },
      2023: { gamesPlayed: 3,  dnpWeeks: 5, gamesStarted: 0, stats: { rec_tgt: 2 } },
      2024: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 0, stats: { rec_tgt: 1 } },
    })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(false)
  })

  it('F2-C: injury year + insufficient recovery → false', () => {
    // Same shape as F2-C headline but current ppg 14 < priorMax 15
    const qualifying = [
      { season: 2022, ppg: 15, gamesPlayed: 16 },
      { season: 2024, ppg: 14, gamesPlayed: 16 },
    ]
    const careerStats = cs({
      2022: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 14, stats: {} },
      2023: { gamesPlayed: 4,  dnpWeeks: 8, gamesStarted: 4,  stats: {} },
      2024: { gamesPlayed: 16, dnpWeeks: 0, gamesStarted: 14, stats: {} },
    })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'RB')).toBe(false)
  })

  it('adjacency tightening — non-adjacent shortened prior no longer fires', () => {
    // Old code: qualifying[n-2] gp=9 at any calendar distance → fired.
    // New rule: downSeason = 2024-1 = 2023; prevQ.season = 2021 ≠ 2023 → path (a) fails.
    // No careerStats entry at 2023 → path (b) fails. → false.
    const qualifying = [
      { season: 2021, ppg: 9,  gamesPlayed: 9  },
      { season: 2024, ppg: 10, gamesPlayed: 16 },
    ]
    const careerStats = cs({ 2021: { gamesPlayed: 9 }, 2024: { gamesPlayed: 16 } })
    expect(computeBounceBackFlag(qualifying, careerStats, 'P1', 'WR')).toBe(false)
  })
})

describe('computeTdReliance', () => {
  it('no scoring settings → null sentinel, isTdReliant false', () => {
    expect(computeTdReliance({ rush_td: 5 }, 100, null)).toEqual({ tdDependency: null, isTdReliant: false })
    expect(computeTdReliance({ rush_td: 5 }, 100, undefined)).toEqual({ tdDependency: null, isTdReliant: false })
  })

  it('no stats → null sentinel, isTdReliant false', () => {
    const scoring = { rush_td: 6 }
    expect(computeTdReliance(null, 100, scoring)).toEqual({ tdDependency: null, isTdReliant: false })
    expect(computeTdReliance(undefined, 100, scoring)).toEqual({ tdDependency: null, isTdReliant: false })
  })

  it('stats present but totalFP 0 — division-by-zero guard via Math.max(totalFP, 1)', () => {
    // 0 TDs + totalFP 0 → tdDependency = 0/max(0,1) = 0/1 = 0
    const r = computeTdReliance({}, 0, { rush_td: 6 })
    expect(r.tdDependency).toBe(0)
    expect(isFinite(r.tdDependency)).toBe(true)
  })

  it('high TD share (byte-identical port claim) → isTdReliant true', () => {
    // { rush_td: 10 }, scoring { rush_td: 6 }, totalFP 100
    // tdPoints = 10*6 = 60; tdDependency = 60/100 = 0.60 > 0.40 → true
    const r = computeTdReliance({ rush_td: 10 }, 100, { rush_td: 6 })
    expect(r.tdDependency).toBeCloseTo(0.60, 5)
    expect(r.isTdReliant).toBe(true)
  })

  it('mixed stats with low overall TD share → isTdReliant false', () => {
    // pass_td:1 (×4=4) + rec_td:1 (×6=6) + rush_2pt:1 (×2=2) = 12pts TDs, totalFP=100
    // tdDependency = 12/100 = 0.12 < 0.40 → false
    const stats   = { pass_td: 1, rec_td: 1, rush_2pt: 1 }
    const scoring = { pass_td: 4, rec_td: 6, rush_2pt: 2, pass_yd: 0.04 }
    const r = computeTdReliance(stats, 100, scoring)
    expect(r.tdDependency).toBeCloseTo(0.12, 5)
    expect(r.isTdReliant).toBe(false)
  })

  it('TD_STAT_KEY absent from scoring — skipped, no NaN', () => {
    // stats has rush_td but scoringSettings does not → multiplier=undefined → skipped
    const r = computeTdReliance({ rush_td: 10 }, 100, { pass_td: 4 })
    expect(isNaN(r.tdDependency)).toBe(false)
    expect(r.tdDependency).toBe(0)  // no TD stats fired
    expect(r.isTdReliant).toBe(false)
  })
})
