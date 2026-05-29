import { describe, it, expect } from 'vitest'
import { computeMomentum } from './momentum.js'

describe('computeMomentum', () => {
  it('returns null sentinels for fewer than 4 seasons — 3-season input', () => {
    const r = computeMomentum([10, 10, 10], 10)
    expect(r).toEqual({ momentum: null, momentumLabel: null })
  })

  it('returns null sentinels for empty array', () => {
    expect(computeMomentum([], 10)).toEqual({ momentum: null, momentumLabel: null })
  })

  it('returns null sentinels for null input', () => {
    expect(computeMomentum(null, 10)).toEqual({ momentum: null, momentumLabel: null })
  })

  it('stable — [10, 10, 10, 10], mean 10 → momentum 0, label stable', () => {
    // recentAvg = (10+10)/2 = 10, priorAvg = (10+10)/2 = 10, momentum = 0/10 = 0
    const r = computeMomentum([10, 10, 10, 10], 10)
    expect(r.momentum).toBe(0)
    expect(r.momentumLabel).toBe('stable')
  })

  it('accelerating — [10, 10, 14, 14], mean 12 → momentum ≈ 0.333', () => {
    // recentAvg = 14, priorAvg = 10, momentum = 4/12 ≈ 0.333 > 0.20 → accelerating
    const r = computeMomentum([10, 10, 14, 14], 12)
    expect(r.momentum).toBeCloseTo(0.333, 2)
    expect(r.momentumLabel).toBe('accelerating')
  })

  it('improving — [10, 10, 11, 12], mean 10.75 → momentum ≈ 0.1395 in (0.05, 0.20]', () => {
    // recentAvg = (11+12)/2 = 11.5, priorAvg = (10+10)/2 = 10
    // momentum = 1.5 / 10.75 ≈ 0.1395
    const r = computeMomentum([10, 10, 11, 12], 10.75)
    expect(r.momentum).toBeGreaterThan(0.05)
    expect(r.momentum).toBeLessThanOrEqual(0.20)
    expect(r.momentumLabel).toBe('improving')
  })

  it('slowing — [12, 12, 11, 10], mean 11.25 → momentum in [-0.20, -0.05)', () => {
    // recentAvg = (11+10)/2 = 10.5, priorAvg = (12+12)/2 = 12
    // momentum = -1.5/11.25 ≈ -0.1333
    const r = computeMomentum([12, 12, 11, 10], 11.25)
    expect(r.momentum).toBeGreaterThanOrEqual(-0.20)
    expect(r.momentum).toBeLessThan(-0.05)
    expect(r.momentumLabel).toBe('slowing')
  })

  it('decelerating — [14, 14, 10, 10], mean 12 → momentum ≈ -0.333 < -0.20', () => {
    // recentAvg = 10, priorAvg = 14, momentum = -4/12 ≈ -0.333
    const r = computeMomentum([14, 14, 10, 10], 12)
    expect(r.momentum).toBeCloseTo(-0.333, 2)
    expect(r.momentumLabel).toBe('decelerating')
  })

  it('boundary 0.05 is stable (> not >=)', () => {
    // With meanPPG=20 and inputs producing momentum exactly 0.05:
    // recentAvg - priorAvg = 0.05 * 20 = 1
    // [10, 10, 11, 11] → recentAvg=11, priorAvg=10, momentum=1/20=0.05
    // rule: momentum > 0.05 → improving; momentum >= -0.05 → stable
    // exactly 0.05 is NOT > 0.05 → falls through to stable
    const r = computeMomentum([10, 10, 11, 11], 20)
    expect(r.momentum).toBe(0.05)
    expect(r.momentumLabel).toBe('stable')
  })

  it('boundary 0.20 is improving (> not >=)', () => {
    // [10, 10, 14, 14] with meanPPG=20 → recentAvg=14, priorAvg=10, momentum=4/20=0.20
    // rule: momentum > 0.20 → accelerating; momentum > 0.05 → improving
    // exactly 0.20 is NOT > 0.20 → falls through to improving
    const r = computeMomentum([10, 10, 14, 14], 20)
    expect(r.momentum).toBe(0.20)
    expect(r.momentumLabel).toBe('improving')
  })

  it('meanPPG=0 uses floor of 1 (no division by zero)', () => {
    // Math.max(0, 1) = 1; momentum = (recentAvg - priorAvg) / 1
    const r = computeMomentum([10, 10, 14, 14], 0)
    expect(r.momentum).toBe(4)  // (14-10)/max(0,1) = 4/1 = 4
    expect(r.momentumLabel).toBe('accelerating')
  })
})
