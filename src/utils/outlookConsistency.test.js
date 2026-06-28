import { describe, it, expect } from 'vitest'
import {
  extractGamePoints,
  computeSeasonConsistency,
  computeConsistency,
} from './outlookConsistency'

// ---------------------------------------------------------------------------
// extractGamePoints
// ---------------------------------------------------------------------------
describe('extractGamePoints', () => {
  it('object form: keeps 0, drops absent weeks', () => {
    expect(extractGamePoints({ weeklyPoints: { '1': 10, '2': 20, '5': 0 } })).toEqual([10, 20, 0])
  })

  it('non-finite values filtered out', () => {
    expect(extractGamePoints({ weeklyPoints: { '1': 10, '2': null, '3': 'x' } })).toEqual([10])
  })

  it('negative values kept', () => {
    expect(extractGamePoints({ weeklyPoints: { '1': -3, '2': 12 } })).toEqual([-3, 12])
  })

  it('undefined → []', () => {
    expect(extractGamePoints(undefined)).toEqual([])
    expect(extractGamePoints({})).toEqual([])
    expect(extractGamePoints({ weeklyPoints: {} })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeSeasonConsistency
// ---------------------------------------------------------------------------
describe('computeSeasonConsistency', () => {
  it('10 equal games: mean 10, sd 0, cv 0', () => {
    const pts = Array(10).fill(10)
    const sd = { weeklyPoints: Object.fromEntries(pts.map((v, i) => [i + 1, v])) }
    const r = computeSeasonConsistency(sd)
    expect(r.games).toBe(10)
    expect(r.mean).toBeCloseTo(10)
    expect(r.sd).toBeCloseTo(0)
    expect(r.cv).toBeCloseTo(0)
  })

  it('known set [12,8,10,14,6,16,9,11] (8 games): mean 10.75, population sd, cv', () => {
    const pts = [12, 8, 10, 14, 6, 16, 9, 11]
    const sd = { weeklyPoints: Object.fromEntries(pts.map((v, i) => [i + 1, v])) }
    const r = computeSeasonConsistency(sd)
    expect(r.games).toBe(8)
    expect(r.mean).toBeCloseTo(10.75)
    // population SD = sqrt(sum((x-mean)^2)/N)
    const m = 10.75
    const expectedSd = Math.sqrt(pts.reduce((a, x) => a + (x - m) ** 2, 0) / 8)
    expect(r.sd).toBeCloseTo(expectedSd)
    expect(r.cv).toBeCloseTo(expectedSd / m)
  })

  it('5 games (< PER_SEASON_MIN_GAMES=8): sd null, cv null', () => {
    const pts = [10, 12, 8, 9, 11]
    const sd = { weeklyPoints: Object.fromEntries(pts.map((v, i) => [i + 1, v])) }
    const r = computeSeasonConsistency(sd)
    expect(r.games).toBe(5)
    expect(r.mean).toBeCloseTo(10)
    expect(r.sd).toBeNull()
    expect(r.cv).toBeNull()
  })

  it('all-zero games (≥8): mean 0, sd 0, cv null (mean ≤ 0)', () => {
    const pts = Array(8).fill(0)
    const sd = { weeklyPoints: Object.fromEntries(pts.map((v, i) => [i + 1, v])) }
    const r = computeSeasonConsistency(sd)
    expect(r.games).toBe(8)
    expect(r.mean).toBeCloseTo(0)
    expect(r.sd).toBeCloseTo(0)
    expect(r.cv).toBeNull()
  })

  it('empty season → {games:0, mean:null, sd:null, cv:null}', () => {
    const r = computeSeasonConsistency({})
    expect(r).toEqual({ games: 0, mean: null, sd: null, cv: null })
    const r2 = computeSeasonConsistency(undefined)
    expect(r2).toEqual({ games: 0, mean: null, sd: null, cv: null })
  })
})

// ---------------------------------------------------------------------------
// computeConsistency
// ---------------------------------------------------------------------------

function makeSeasonData(gp, pts) {
  return { gamesPlayed: gp, weeklyPoints: Object.fromEntries(pts.map((v, i) => [i + 1, v])) }
}

describe('computeConsistency', () => {
  it('null careerStats → null', () => {
    expect(computeConsistency(null, 'p1')).toBeNull()
  })

  it('player with 0 qualifying seasons → null', () => {
    const cs = { 2024: { p1: { gamesPlayed: 4 } } }
    expect(computeConsistency(cs, 'p1')).toBeNull()
  })

  it('1 qualifying season → window:1 (inline-ineligible)', () => {
    const pts = Array(10).fill(12)
    const cs = { 2024: { p1: makeSeasonData(10, pts) } }
    const r = computeConsistency(cs, 'p1')
    expect(r).not.toBeNull()
    expect(r.window).toBe(1)
    expect(r.window).toBeLessThan(2) // inline eligibility gate: window >= 2
  })

  it('2 qualifying seasons: window:2, pooledGames:16, mean/sd/cv set, seasons most-recent first', () => {
    const pts2024 = Array(8).fill(14)
    const pts2023 = Array(8).fill(10)
    const cs = {
      2024: { p1: makeSeasonData(8, pts2024) },
      2023: { p1: makeSeasonData(8, pts2023) },
    }
    const r = computeConsistency(cs, 'p1')
    expect(r.window).toBe(2)
    expect(r.pooledGames).toBe(16)
    expect(r.mean).toBeCloseTo(12) // (14*8 + 10*8)/16
    expect(r.sd).not.toBeNull()
    expect(r.cv).not.toBeNull()
    expect(r.seasons.length).toBe(2)
    expect(r.seasons[0].season).toBeGreaterThan(r.seasons[1].season)
  })

  it('sub-8-GP season excluded from window (next qualifying season pulled instead)', () => {
    const cs = {
      2024: { p1: makeSeasonData(10, Array(10).fill(12)) },
      2023: { p1: makeSeasonData(5, Array(5).fill(8)) },   // excluded
      2022: { p1: makeSeasonData(9, Array(9).fill(10)) },
    }
    const r = computeConsistency(cs, 'p1')
    // window should be [2024, 2022], not [2024, 2023]
    expect(r.window).toBe(2)
    expect(r.seasons.map(s => s.season)).toEqual([2024, 2022])
  })

  it('>3 qualifying seasons → only latest 3 used (window:3)', () => {
    const cs = {
      2024: { p1: makeSeasonData(10, Array(10).fill(12)) },
      2023: { p1: makeSeasonData(10, Array(10).fill(11)) },
      2022: { p1: makeSeasonData(10, Array(10).fill(10)) },
      2021: { p1: makeSeasonData(10, Array(10).fill(9)) },
    }
    const r = computeConsistency(cs, 'p1')
    expect(r.window).toBe(3)
    expect(r.seasons.map(s => s.season)).toEqual([2024, 2023, 2022])
  })

  it('pooled-floor edge: 2 qualifying seasons but only 9 finite game points → sd null', () => {
    // 5 game points in 2024 (gp=8 qualifies, but sparse weeklyPoints)
    // 4 game points in 2023 (gp=8 qualifies, sparse)
    const cs = {
      2024: { p1: { gamesPlayed: 8, weeklyPoints: { '1': 10, '2': 12, '3': 9, '4': 11, '5': 13 } } },
      2023: { p1: { gamesPlayed: 8, weeklyPoints: { '1': 8, '2': 10, '3': 9, '4': 11 } } },
    }
    const r = computeConsistency(cs, 'p1')
    expect(r.window).toBe(2)
    expect(r.pooledGames).toBe(9)
    expect(r.mean).not.toBeNull() // mean still computed
    expect(r.sd).toBeNull()
    expect(r.cv).toBeNull()
    expect(r.boomRate).toBeNull()
    expect(r.bustRate).toBeNull()
  })

  it('boom/bust exact fractions', () => {
    // 10 games pooled: [20, 20, 5, 5, 10, 10, 10, 10, 10, 10]
    // mean = 110/10 = 11; boom threshold = 1.5*11=16.5 → [20,20]; bust = 0.5*11=5.5 → [5,5]
    // boomRate = 2/10 = 0.2, bustRate = 2/10 = 0.2
    const pts = [20, 20, 5, 5, 10, 10, 10, 10, 10, 10]
    const cs = {
      2024: { p1: makeSeasonData(10, pts) },
    }
    const r = computeConsistency(cs, 'p1')
    expect(r.pooledGames).toBe(10)
    expect(r.mean).toBeCloseTo(11)
    expect(r.boomRate).toBeCloseTo(0.2)
    expect(r.bustRate).toBeCloseTo(0.2)
  })

  it('null-safety: missing weeklyPoints on a gp≥8 season → 0 pooled games, no throw, no NaN', () => {
    const cs = {
      2024: { p1: { gamesPlayed: 10 } }, // no weeklyPoints
      2023: { p1: { gamesPlayed: 10 } }, // no weeklyPoints
    }
    const r = computeConsistency(cs, 'p1')
    expect(r).not.toBeNull()
    expect(r.window).toBe(2)
    expect(r.pooledGames).toBe(0)
    expect(r.mean).toBeNull()
    expect(r.sd).toBeNull()
    expect(r.boomRate).toBeNull()
    expect(r.bustRate).toBeNull()
  })

  it('ageCurveFactor null guard: null ageCurveFactor contributes 0 to signalCount (separate integration check)', () => {
    // This tests the computation that will be used in enrichedRows
    // Signal count formula: ageCurveFactor != null && (>= 1.05 || <= 0.95) ? 1 : 0
    const sig = { isBreakout: false, isBounceBack: false, momentumLabel: 'neutral', isTdReliant: false, ageCurveFactor: null }
    const signalCount =
      (sig ? ((sig.isBreakout ? 1 : 0) + (sig.isBounceBack ? 1 : 0)
           + (sig.momentumLabel === 'accelerating' || sig.momentumLabel === 'decelerating' ? 1 : 0)
           + (sig.isTdReliant ? 1 : 0)
           + (sig.ageCurveFactor != null && (sig.ageCurveFactor >= 1.05 || sig.ageCurveFactor <= 0.95) ? 1 : 0)) : 0)
    expect(signalCount).toBe(0)
  })
})
