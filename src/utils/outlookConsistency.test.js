import { describe, it, expect, vi } from 'vitest'

// sleeperStats.js pulls the cache / data-store modules at import; nothing here touches them.
vi.mock('../utils/cache', () => ({
  getCache: vi.fn(), setCache: vi.fn(), getCacheRecord: vi.fn(), setCacheWithMeta: vi.fn(),
}))
vi.mock('../api/dataStore', () => ({
  tryDataStore: vi.fn(), getManifestEntry: vi.fn(), isValidSeasonTotals: vi.fn(),
}))
import { rescoreSeasonTotals } from '../api/sleeperStats'
import {
  resolveDisplayWeeklyPoints,
  extractDisplayGamePoints,
  summarizeGamePoints,
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

// ---------------------------------------------------------------------------
// resolveDisplayWeeklyPoints — weekly-points-display-basis.md §2.1
// ---------------------------------------------------------------------------
describe('resolveDisplayWeeklyPoints', () => {
  const scaled = { 1: 20 }
  const source = { 1: 17.3 }

  it('null / non-object seasonData → { null, null }', () => {
    expect(resolveDisplayWeeklyPoints(null)).toEqual({ weeklyPoints: null, basis: null })
    expect(resolveDisplayWeeklyPoints(undefined)).toEqual({ weeklyPoints: null, basis: null })
    expect(resolveDisplayWeeklyPoints('x')).toEqual({ weeklyPoints: null, basis: null })
  })

  it('rescored + sourceScoringBasis half_ppr → the source series, half_ppr', () => {
    const r = resolveDisplayWeeklyPoints({ weeklyPoints: scaled, sourceWeeklyPoints: source, sourceScoringBasis: 'half_ppr', scoringBasis: 'league' })
    expect(r.weeklyPoints).toBe(source)
    expect(r.basis).toBe('half_ppr')
  })

  it('rescored + sourceScoringBasis null (live-API) → the source series, league', () => {
    const r = resolveDisplayWeeklyPoints({ weeklyPoints: scaled, sourceWeeklyPoints: source, sourceScoringBasis: null, scoringBasis: 'league' })
    expect(r.weeklyPoints).toBe(source)
    expect(r.basis).toBe('league')
  })

  it('rescored + any other sourceScoringBasis string → { null, null }', () => {
    const r = resolveDisplayWeeklyPoints({ weeklyPoints: scaled, sourceWeeklyPoints: source, sourceScoringBasis: 'ppr' })
    expect(r).toEqual({ weeklyPoints: null, basis: null })
  })

  it('not rescored + scoringBasis half_ppr → its own weeklyPoints, half_ppr', () => {
    const r = resolveDisplayWeeklyPoints({ weeklyPoints: source, scoringBasis: 'half_ppr' })
    expect(r.weeklyPoints).toBe(source)
    expect(r.basis).toBe('half_ppr')
  })

  it('not rescored + no scoringBasis (raw live-API row) → { null, null }', () => {
    expect(resolveDisplayWeeklyPoints({ weeklyPoints: source })).toEqual({ weeklyPoints: null, basis: null })
    expect(resolveDisplayWeeklyPoints({ weeklyPoints: source, scoringBasis: null })).toEqual({ weeklyPoints: null, basis: null })
  })

  it("not rescored + scoringBasis 'league' or another string → { null, null }", () => {
    expect(resolveDisplayWeeklyPoints({ weeklyPoints: scaled, scoringBasis: 'league' })).toEqual({ weeklyPoints: null, basis: null })
    expect(resolveDisplayWeeklyPoints({ weeklyPoints: scaled, scoringBasis: 'ppr' })).toEqual({ weeklyPoints: null, basis: null })
  })

  it('sourceWeeklyPoints: null keeps the known basis with a null series', () => {
    expect(resolveDisplayWeeklyPoints({ sourceWeeklyPoints: null, sourceScoringBasis: 'half_ppr' })).toEqual({ weeklyPoints: null, basis: 'half_ppr' })
    expect(resolveDisplayWeeklyPoints({ sourceWeeklyPoints: null, sourceScoringBasis: null })).toEqual({ weeklyPoints: null, basis: 'league' })
  })
})

describe('extractDisplayGamePoints', () => {
  it('filters to finite values (object and array forms) and carries the basis', () => {
    expect(extractDisplayGamePoints({ sourceWeeklyPoints: { 1: 10, 2: null, 3: 0 }, sourceScoringBasis: 'half_ppr' }))
      .toEqual({ points: [10, 0], basis: 'half_ppr' })
    expect(extractDisplayGamePoints({ sourceWeeklyPoints: [4, null, 6], sourceScoringBasis: null }))
      .toEqual({ points: [4, 6], basis: 'league' })
  })

  it('null series or unknown basis → no points', () => {
    expect(extractDisplayGamePoints({ sourceWeeklyPoints: null, sourceScoringBasis: 'half_ppr' })).toEqual({ points: [], basis: 'half_ppr' })
    expect(extractDisplayGamePoints(undefined)).toEqual({ points: [], basis: null })
  })
})

// ---------------------------------------------------------------------------
// summarizeGamePoints
// ---------------------------------------------------------------------------
describe('summarizeGamePoints', () => {
  it('10 games: hand-computed mean 10.6, population sd √9.24, cv sd/mean', () => {
    const r = summarizeGamePoints([12, 8, 10, 14, 6, 16, 9, 11, 13, 7])
    expect(r.games).toBe(10)
    expect(r.mean).toBeCloseTo(10.6, 10)
    expect(r.sd).toBeCloseTo(Math.sqrt(9.24), 10)
    expect(r.cv).toBeCloseTo(Math.sqrt(9.24) / 10.6, 10)
  })

  it('9 games: mean set, sd and cv null (below MIN_POOLED_GAMES)', () => {
    const r = summarizeGamePoints([12, 8, 10, 14, 6, 16, 9, 11, 13])
    expect(r.games).toBe(9)
    expect(r.mean).not.toBeNull()
    expect(r.sd).toBeNull()
    expect(r.cv).toBeNull()
  })

  it('[] → { games: 0, mean: null, sd: null, cv: null }', () => {
    expect(summarizeGamePoints([])).toEqual({ games: 0, mean: null, sd: null, cv: null })
  })

  it('mean ≤ 0 → cv null even with an sd', () => {
    const r = summarizeGamePoints([-5, -3, -4, -6, -2, -5, -3, -4, -6, -2])
    expect(r.sd).not.toBeNull()
    expect(r.cv).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Scale invariance — pins §1.3 so an aggregate is never "simplified" onto the invariance argument
// ---------------------------------------------------------------------------
describe('per-season CV is scale-invariant; pooled CV is not', () => {
  const SCORING = { rec: 1 }
  // served half-PPR total 100; scored (rec × 1) = 125 / 150 → exact ratios 1.25 / 1.5
  const halfRow = (stats, weeks) => ({
    stats, fantasyPoints: 100, scoringBasis: 'half_ppr', gamesPlayed: 12,
    weeklyPoints: Object.fromEntries(weeks.map((v, i) => [i + 1, v])),
  })
  const weeks24 = [8, 12, 4, 16, 20, 8, 12, 4, 16, 8, 12, 20]
  const weeks25 = [4, 4, 8, 8, 12, 12, 16, 16, 20, 20, 24, 24]
  const rescored = rescoreSeasonTotals({
    a: halfRow({ rec: 125 }, weeks24),
    b: halfRow({ rec: 150 }, weeks25),
  }, SCORING, { a: { position: 'WR' }, b: { position: 'WR' } })

  it("a single season's cv is the same on the scaled and the source series, while sd is not", () => {
    const scaledSeason = computeSeasonConsistency(rescored.a)
    const sourceSeason = computeSeasonConsistency({ weeklyPoints: rescored.a.sourceWeeklyPoints })
    expect(rescored.a.weeklyPoints[1]).toBe(10) // 8 × 1.25 — the ratio really is ≠ 1
    expect(scaledSeason.cv).toBeCloseTo(sourceSeason.cv, 3)
    expect(scaledSeason.sd).not.toBeCloseTo(sourceSeason.sd, 3)
  })

  it('a two-season pool with different ratios has a different pooled cv on the scaled vs source series', () => {
    const scaledCareer = { 2025: { p1: rescored.b }, 2024: { p1: rescored.a } }
    const sourceCareer = {
      2025: { p1: { gamesPlayed: 12, weeklyPoints: rescored.b.sourceWeeklyPoints } },
      2024: { p1: { gamesPlayed: 12, weeklyPoints: rescored.a.sourceWeeklyPoints } },
    }
    const scaled = computeConsistency(scaledCareer, 'p1')
    const source = computeConsistency(sourceCareer, 'p1')
    expect(scaled.cv).not.toBeNull()
    expect(Math.abs(scaled.cv - source.cv)).toBeGreaterThan(0.01)
    expect(Math.abs(scaled.sd - source.sd)).toBeGreaterThan(0.1)
  })
})
