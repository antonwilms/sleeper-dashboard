/**
 * src/utils/ageCurve.test.js
 *
 * Direct unit tests for the interpolateAgeCurve leaf.
 * Documents the contract independently of transitive callers
 * (dynastyScore.js, projectionSignals.js, seasonProjection.js).
 */

import { describe, it, expect } from 'vitest'
import { interpolateAgeCurve } from './ageCurve.js'

const CURVE = [
  { age: 22, medianPPG: 10 },
  { age: 26, medianPPG: 12 },
  { age: 30, medianPPG:  7 },
]

describe('interpolateAgeCurve', () => {
  it('empty curve returns 0', () => {
    expect(interpolateAgeCurve([], 25)).toBe(0)
  })

  it('age below range clamps to first point medianPPG', () => {
    expect(interpolateAgeCurve(CURVE, 18)).toBe(10)
  })

  it('age above range clamps to last point medianPPG', () => {
    expect(interpolateAgeCurve(CURVE, 35)).toBe(7)
  })

  it('age at midpoint interpolates linearly', () => {
    // age=24 is halfway between 22 and 26: 10 + (2/4)*(12-10) = 11
    expect(interpolateAgeCurve(CURVE, 24)).toBe(11)
  })
})
