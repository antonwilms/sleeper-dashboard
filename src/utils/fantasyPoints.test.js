import { describe, it, expect } from 'vitest'
import { calculateFantasyPoints, getCategoryPoints } from './fantasyPoints.js'

describe('calculateFantasyPoints', () => {
  it('empty scoring → 0', () => {
    expect(calculateFantasyPoints({ pass_yd: 300 }, {})).toBe(0)
  })

  it('empty stats → 0', () => {
    expect(calculateFantasyPoints({}, { pass_yd: 0.04 })).toBe(0)
  })

  it('standard PPR sample — exact dot-product (byte-identical port claim)', () => {
    // 300 pass_yd × 0.04 = 12.00 + 3 pass_td × 4 = 12.00 → total 24.00
    const stats   = { pass_yd: 300, pass_td: 3 }
    const scoring = { pass_yd: 0.04, pass_td: 4 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(24.00)
  })

  it('null multipliers in scoring are ignored — no throw', () => {
    const stats   = { pass_yd: 100, pass_td: 1 }
    const scoring = { pass_yd: null, pass_td: 4 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(4)
  })

  it('key in stats absent from scoring — silently skipped', () => {
    const stats   = { rush_yd: 100, pass_td: 1 }
    const scoring = { pass_td: 4 }
    // rush_yd not in scoring → skipped; total = 1×4 = 4
    expect(calculateFantasyPoints(stats, scoring)).toBe(4)
  })

  it('2-decimal rounding — Math.round half-up', () => {
    // 1 rec × 0.345 = 0.345 → should round to 0.35 (but multiplied by 100 = 34.5 → round = 35)
    // Actually Math.round(0.345 * 100) / 100 = Math.round(34.5) / 100 = 35/100 = 0.35
    const stats   = { rec: 1 }
    const scoring = { rec: 0.345 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(0.35)
  })
})

describe('getCategoryPoints', () => {
  it('null stats → all-zero buckets', () => {
    expect(getCategoryPoints(null, { pass_td: 4 })).toEqual({ pass: 0, rush: 0, rec: 0, other: 0 })
  })

  it('null scoring → all-zero buckets', () => {
    expect(getCategoryPoints({ pass_td: 1 }, null)).toEqual({ pass: 0, rush: 0, rec: 0, other: 0 })
  })

  it('categorisation correctness — prefix logic', () => {
    const stats = {
      pass_yd:   300,   // pass_
      rush_yd:   50,    // rush_
      rec_yd:    80,    // rec_
      rec:       5,     // bare 'rec'
      bonus_rec_te: 0.5, // bonus_ → other
      pass_int:  1,     // pass_ → pass
      fum_lost:  1,     // none of the above → other
    }
    const scoring = {
      pass_yd:   0.04,
      rush_yd:   0.1,
      rec_yd:    0.1,
      rec:       1,
      bonus_rec_te: 1,
      pass_int:  -2,
      fum_lost:  -2,
    }
    const r = getCategoryPoints(stats, scoring)
    // pass_yd: 300×0.04=12, pass_int: 1×-2=-2 → pass = 10
    expect(r.pass).toBeCloseTo(10, 5)
    // rush_yd: 50×0.1=5 → rush = 5
    expect(r.rush).toBeCloseTo(5, 5)
    // rec_yd: 80×0.1=8, rec: 5×1=5 → rec = 13
    expect(r.rec).toBeCloseTo(13, 5)
    // bonus_rec_te: 0.5×1=0.5, fum_lost: 1×-2=-2 → other = -1.5
    expect(r.other).toBeCloseTo(-1.5, 5)
  })

  it('exact arithmetic — known stat+scoring combo, per-bucket totals', () => {
    const stats   = { pass_td: 2, rush_td: 1, rec: 4 }
    const scoring = { pass_td: 4, rush_td: 6, rec: 1 }
    const r = getCategoryPoints(stats, scoring)
    expect(r.pass).toBe(8)
    expect(r.rush).toBe(6)
    expect(r.rec).toBe(4)
    expect(r.other).toBe(0)
  })

  it('output shape — always exactly 4 keys', () => {
    const r = getCategoryPoints({}, {})
    expect(Object.keys(r).sort()).toEqual(['other', 'pass', 'rec', 'rush'])
  })
})
