import { describe, it, expect } from 'vitest'
import {
  startersFromMatchups, buildStarterPool, resolvePercentileBasis, isLivePoolResolved, isPriorRowsPending,
  percentileOf, quantile, percentileCutoffs, MIN_POOL_SAMPLES,
} from './starterPercentiles'

const SCORING = { pass_yd: 0.1 }
const row = (yd, gp = 1) => ({ stats: { gp, pass_yd: yd } })
const result = (weeks, extra = {}) => ({ year: 2026, weeks, failedWeeks: [], complete: true, ...extra })
const base = { scoringSettings: SCORING, throughWeek: 10 }

describe('buildStarterPool', () => {
  it('T1 bench excluded: only starters feed the pool', () => {
    const starters = startersFromMatchups([{ starters: ['p1', '0'], players: ['p1', 'p2'] }])
    const pool = buildStarterPool({
      ...base, starterWeeks: [{ week: 1, ids: starters }],
      weeklyResult: result([{ week: 1, rows: { p1: row(100), p2: row(200) } }]),
      playerMap: { p1: { position: 'QB' }, p2: { position: 'QB' } },
    })
    expect(pool.QB).toEqual([10])
  })

  it('T2 "0" / null / empty slots are dropped', () => {
    expect(startersFromMatchups([{ starters: ['0', 'p1', null, ''] }])).toEqual(['p1'])
  })

  it('T3 a DNP starter (gp 0 / absent row) is not pooled as a 0', () => {
    const pool = buildStarterPool({
      ...base, starterWeeks: [{ week: 1, ids: ['p1', 'p3'] }, { week: 2, ids: ['p1', 'p3'] }],
      weeklyResult: result([
        { week: 1, rows: { p1: row(100) } },
        { week: 2, rows: { p1: row(0, 0) } },
      ]),
      playerMap: { p1: { position: 'QB' }, p3: { position: 'QB' } },
    })
    expect(pool.QB).toHaveLength(1)
  })

  it('T4 a week past throughWeek is excluded', () => {
    const pool = buildStarterPool({
      ...base, starterWeeks: [{ week: 10, ids: ['p1'] }, { week: 11, ids: ['p1'] }],
      weeklyResult: result([{ week: 10, rows: { p1: row(100) } }, { week: 11, rows: { p1: row(500) } }]),
      playerMap: { p1: { position: 'QB' } },
    })
    expect(pool.QB).toEqual([10])
  })

  it('T5 position comes from playerMap; a player absent from it is dropped', () => {
    const pool = buildStarterPool({
      ...base, starterWeeks: [{ week: 1, ids: ['p1', 'p9'] }],
      weeklyResult: result([{ week: 1, rows: { p1: row(100), p9: row(100) } }]),
      playerMap: { p1: { position: 'TE' } },
    })
    expect(Object.keys(pool)).toEqual(['TE'])
    expect(pool.TE).toEqual([10])
  })

  it('T6 a failed/absent week contributes nothing', () => {
    const pool = buildStarterPool({
      ...base, starterWeeks: [{ week: 1, ids: ['p1'] }, { week: 3, ids: ['p1'] }],
      weeklyResult: result([{ week: 1, rows: { p1: row(100) } }], { failedWeeks: [3] }),
      playerMap: { p1: { position: 'QB' } },
    })
    expect(pool.QB).toEqual([10])
  })

  it('an incomplete weekly result yields an empty pool', () => {
    expect(buildStarterPool({
      ...base, starterWeeks: [{ week: 1, ids: ['p1'] }],
      weeklyResult: result([{ week: 1, rows: { p1: row(100) } }], { complete: false }),
      playerMap: { p1: { position: 'QB' } },
    })).toEqual({})
  })
})

const fill = (n, v = 10) => Array.from({ length: n }, () => v)
const full = { QB: fill(60), RB: fill(60), WR: fill(60), TE: fill(60) }
const resolveArgs = { liveSeason: 2026, priorSeason: 2025, liveResolved: true, priorStatus: 'loaded' }

describe('resolvePercentileBasis', () => {
  it('T7 a thin-but-non-empty live pool falls back to the prior pool', () => {
    const r = resolvePercentileBasis({ ...resolveArgs, live: { ...full, TE: fill(59) }, prior: { TE: fill(60) } })
    expect(r.basis.TE.source).toBe('prior')
    expect(r.basis.TE.season).toBe(2025)
    expect(r.needsPrior).toBe(true)
  })

  it('T8 exactly MIN_POOL_SAMPLES stays live; all four >= 60 -> needsPrior false', () => {
    const r = resolvePercentileBasis({ ...resolveArgs, live: full, prior: null })
    expect(MIN_POOL_SAMPLES).toBe(60)
    expect(r.basis.TE.source).toBe('live')
    expect(r.needsPrior).toBe(false)
  })

  it('T9 a thin live pool with no prior pool has no basis (never the thin pool)', () => {
    const r = resolvePercentileBasis({ ...resolveArgs, live: { ...full, TE: fill(10) }, prior: null })
    expect(r.basis.TE).toBeNull()
  })

  it('T10 a prior pool below the threshold is not used', () => {
    const r = resolvePercentileBasis({ ...resolveArgs, live: { ...full, TE: fill(10) }, prior: { TE: fill(30) } })
    expect(r.basis.TE).toBeNull()
  })

  it('T10b pending vs ready', () => {
    const thin = { ...full, TE: fill(10) }
    const i = resolvePercentileBasis({ ...resolveArgs, liveResolved: false, live: {}, prior: null, priorStatus: 'idle' })
    expect(i.status).toBe('pending')
    expect(i.needsPrior).toBe(false)
    expect(resolvePercentileBasis({ ...resolveArgs, live: thin, prior: null, priorStatus: 'loading' }).status).toBe('pending')
    for (const s of ['failed', 'unavailable']) {
      const r = resolvePercentileBasis({ ...resolveArgs, live: thin, prior: null, priorStatus: s })
      expect(r.status).toBe('ready')
      expect(r.basis.TE).toBeNull()
    }
    expect(resolvePercentileBasis({ ...resolveArgs, live: full, prior: null, priorStatus: 'idle' }).status).toBe('ready')
    expect(resolvePercentileBasis({ ...resolveArgs, live: thin, prior: null, priorStatus: 'loaded', priorRowsPending: true }).status).toBe('pending')
  })
})

describe('isPriorRowsPending', () => {
  const nflState = { season: '2026', season_type: 'regular', week: 11 }
  const careerStats = { 2025: {} }
  const loaded = season => ({ status: 'loaded', season })
  it('T10d true only while a planned season has not arrived', () => {
    expect(isPriorRowsPending({ priorStarterWeeks: loaded(2025), careerStats, nflState, defenceWeeklyByYear: {} })).toBe(true)
    expect(isPriorRowsPending({ priorStarterWeeks: loaded(2025), careerStats, nflState, defenceWeeklyByYear: { 2025: {} } })).toBe(false)
    expect(isPriorRowsPending({ priorStarterWeeks: loaded(2023), careerStats, nflState, defenceWeeklyByYear: {} })).toBe(false)
    expect(isPriorRowsPending({ priorStarterWeeks: { status: 'loading', season: 2025 }, careerStats, nflState, defenceWeeklyByYear: {} })).toBe(false)
  })
})

describe('isLivePoolResolved', () => {
  const careerStats = { 2025: {} }
  it('T10c resolves on arrival (complete or not), at week 1, never without leagueData', () => {
    const nflState = { season: '2026', season_type: 'regular', week: 11 }
    expect(isLivePoolResolved({ leagueData: {}, careerStats, nflState, defenceWeeklyByYear: {} })).toBe(false)
    expect(isLivePoolResolved({ leagueData: {}, careerStats, nflState, defenceWeeklyByYear: { 2026: { complete: false } } })).toBe(true)
    expect(isLivePoolResolved({ leagueData: {}, careerStats, nflState: { ...nflState, week: 1 }, defenceWeeklyByYear: {} })).toBe(true)
    expect(isLivePoolResolved({ leagueData: null, careerStats, nflState, defenceWeeklyByYear: {} })).toBe(false)
  })
})

describe('percentileOf / quantile', () => {
  it('T11 mid-rank percentile, type-7 quantile, cut-offs', () => {
    const v = [10, 20, 30, 40]
    expect(percentileOf(v, 30)).toBe(0.625)
    expect(percentileOf(v, 5)).toBe(0)
    expect(percentileOf(v, 99)).toBe(1)
    expect(quantile(v, 0.2)).toBeCloseTo(16)
    expect(percentileCutoffs(Array.from({ length: 11 }, (_, i) => i + 1))).toEqual([3, 5, 7, 9])
    expect(percentileOf([], 3)).toBeNull()
    expect(quantile([], 0.5)).toBeNull()
  })
})
