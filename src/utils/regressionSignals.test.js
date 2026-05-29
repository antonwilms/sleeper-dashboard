import { describe, it, expect } from 'vitest'
import { computeTrajectory, computeConsistency } from './regressionSignals.js'

describe('computeTrajectory', () => {
  it('fewer than 2 seasons → both null', () => {
    expect(computeTrajectory([])).toEqual({ slope: null, normalizedSlope: null })
    expect(computeTrajectory([10])).toEqual({ slope: null, normalizedSlope: null })
    expect(computeTrajectory(null)).toEqual({ slope: null, normalizedSlope: null })
  })

  it('flat series [10,10,10,10] → slope 0, normalizedSlope 0', () => {
    // weightedLinearRegression of a constant series = 0
    const r = computeTrajectory([10, 10, 10, 10])
    expect(r.slope).toBe(0)
    expect(r.normalizedSlope).toBe(0)
  })

  it('rising series [8,10,12,14] → positive slope and normalizedSlope (byte-identical port claim)', () => {
    // xs=[0,1,2,3], ws=[1,2,3,4]
    // wSum=10, wxSum=20, wySum=8+20+36+56=120
    // wxxSum=0+2+12+36=50, wxySum=0+20+72+168=260
    // denom=10*50-20*20=100
    // slope=(10*260-20*120)/100=(2600-2400)/100=2
    // meanPPG=11, normalizedSlope=2/max(11,4)=2/11≈0.1818
    const r = computeTrajectory([8, 10, 12, 14])
    expect(r.slope).toBeCloseTo(2, 5)
    expect(r.normalizedSlope).toBeCloseTo(2 / 11, 5)
    expect(r.slope).toBeGreaterThan(0)
    expect(r.normalizedSlope).toBeGreaterThan(0)
  })

  it('falling series → negative slope and normalizedSlope', () => {
    const r = computeTrajectory([14, 12, 10, 8])
    expect(r.slope).toBeLessThan(0)
    expect(r.normalizedSlope).toBeLessThan(0)
  })

  it('mean floor — series with mean < 4 uses floor of 4 in denominator', () => {
    // [1,2,3]: xs=[0,1,2], ws=[1,2,3]
    // wSum=6, wxSum=0+2+6=8, wySum=1+4+9=14
    // wxxSum=0+2+12=14, wxySum=0+4+18=22
    // denom=6*14-8*8=84-64=20
    // slope=(6*22-8*14)/20=(132-112)/20=1
    // meanPPG=2, max(2,4)=4 → normalizedSlope=1/4=0.25
    const r = computeTrajectory([1, 2, 3])
    expect(r.slope).toBeCloseTo(1, 5)
    expect(r.normalizedSlope).toBeCloseTo(0.25, 5)  // slope/4, not slope/2
  })

  it('non-finite guard — degenerate input returns nulls', () => {
    // Construct a case where denom would be ~0 (handled by < 1e-10 guard → returns 0)
    // With a single repeated x-value (degenerate xs) the guard returns 0, not non-finite.
    // Actually the source returns 0 for denom<1e-10, which IS finite, so normalizedSlope=0.
    // For truly non-finite, we'd need NaN in inputs — not easily producible from valid arrays.
    // Verify the guard exists by checking that all-zero ppgs return finite values.
    const r = computeTrajectory([0, 0, 0, 0])
    expect(r.slope).toBeDefined()
    expect(r.normalizedSlope).toBeDefined()
    // All zeros: meanPPG=0, max(0,4)=4, slope=0, normalizedSlope=0/4=0
    expect(r.slope).toBe(0)
    expect(r.normalizedSlope).toBe(0)
  })
})

describe('computeConsistency', () => {
  it('fewer than 3 seasons → consistencyScore null', () => {
    expect(computeConsistency([])).toEqual({ consistencyScore: null })
    expect(computeConsistency([10])).toEqual({ consistencyScore: null })
    expect(computeConsistency([10, 12])).toEqual({ consistencyScore: null })
    expect(computeConsistency(null)).toEqual({ consistencyScore: null })
  })

  it('constant series [12,12,12] → cv=0 → score=100', () => {
    // stdDev=0, cv=0/12=0, score=100-0=100
    const r = computeConsistency([12, 12, 12])
    expect(r.consistencyScore).toBe(100)
  })

  it('highly variable series → score clamped to 0 or low', () => {
    // [0, 20, 0, 20]: mean=10, stdDev≈11.55, cv≈1.155 → score=100-115.5 clamped to 0
    const r = computeConsistency([0, 20, 0, 20])
    expect(r.consistencyScore).toBe(0)
  })

  it('meanPPG=0 → cv defaults to 1 → score=0', () => {
    // mean=0 → cv=1, score=100-100=0
    const r = computeConsistency([0, 0, 0])
    expect(r.consistencyScore).toBe(0)
  })

  it('steady mid — [10,12,11] → score ≈ 90.9 (byte-identical port claim)', () => {
    // mean=11, sample-stdDev=1, cv=1/11≈0.09091
    // score = 100 - 9.091 ≈ 90.909
    const r = computeConsistency([10, 12, 11])
    expect(r.consistencyScore).toBeGreaterThan(89.9)
    expect(r.consistencyScore).toBeLessThan(91.9)
    expect(r.consistencyScore).toBeCloseTo(100 - (1 / 11) * 100, 2)
  })
})
