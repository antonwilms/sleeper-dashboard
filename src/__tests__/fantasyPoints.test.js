import { describe, it, expect } from 'vitest'
import { calculateFantasyPoints } from '../utils/fantasyPoints.js'

describe('calculateFantasyPoints', () => {
  it('computes dot-product correctly for known inputs', () => {
    const stats   = { pass_yd: 300, pass_td: 3 }
    const scoring = { pass_yd: 0.04, pass_td: 4 }
    // 300 * 0.04 = 12.00  +  3 * 4 = 12.00  →  24.00
    expect(calculateFantasyPoints(stats, scoring)).toBe(24.00)
  })
})
