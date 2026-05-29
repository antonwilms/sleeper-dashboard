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
  it('fewer than 2 qualifying seasons → false', () => {
    expect(computeBounceBackFlag([])).toBe(false)
    expect(computeBounceBackFlag([{ ppg: 12, gamesPlayed: 14 }])).toBe(false)
    expect(computeBounceBackFlag(null)).toBe(false)
  })

  it('prior season GP >= 10 → false (not shortened)', () => {
    // prevSeason (second-to-last) has gp=10 — not shortened
    const qualifying = [
      { ppg: 12, gamesPlayed: 14 },
      { ppg: 9,  gamesPlayed: 10 },  // prior — not shortened (>=10)
      { ppg: 15, gamesPlayed: 16 },  // current
    ]
    expect(computeBounceBackFlag(qualifying)).toBe(false)
  })

  it('prior shortened + current beats prior max → true', () => {
    // ppgs: [12, 9, 15]. prevSeason gp=8 (<10). priorMax=max(12,9)=12. current=15>=12 → true
    const qualifying = [
      { ppg: 12, gamesPlayed: 14 },
      { ppg: 9,  gamesPlayed: 8  },  // shortened
      { ppg: 15, gamesPlayed: 16 },  // beats priorMax
    ]
    expect(computeBounceBackFlag(qualifying)).toBe(true)
  })

  it('prior shortened + current beats second-highest → true', () => {
    // ppgs: [14, 12, 9, 13]. prevSeason (9) gp=8 (<10).
    // priorMax = max(14,12,9) = 14. current=13 < 14.
    // sorted desc: [14,12,9,13] → [14,13,12,9]. secondHighest = 13.
    // Wait, secondHighest = [...ppgs].sort(desc)[1] on all ppgs including current.
    // ppgs = [14, 12, 9, 13]. sorted desc = [14, 13, 12, 9]. secondHighest = 13.
    // current (13) >= secondHighest (13) → true
    const qualifying = [
      { ppg: 14, gamesPlayed: 14 },
      { ppg: 12, gamesPlayed: 14 },
      { ppg: 9,  gamesPlayed: 8  },  // shortened (prev)
      { ppg: 13, gamesPlayed: 16 },  // current: < priorMax(14) but >= secondHighest(13)
    ]
    expect(computeBounceBackFlag(qualifying)).toBe(true)
  })

  it('mutation guard — input array unchanged after call', () => {
    const qualifying = [
      { ppg: 12, gamesPlayed: 14 },
      { ppg: 9,  gamesPlayed: 8  },
      { ppg: 15, gamesPlayed: 16 },
    ]
    const copy = qualifying.map(s => ({ ...s }))
    computeBounceBackFlag(qualifying)
    expect(qualifying).toEqual(copy)
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
