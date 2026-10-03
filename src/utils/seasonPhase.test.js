import { describe, it, expect } from 'vitest'
import { seasonPhase, regularSeasonWeeks } from './seasonPhase'
import { defenceLoadPlan } from './opponentStrength'

const IN_2026 = {
  phase: 'in-season', lead: 'current-plus-ros', liveSeason: 2026, liveSeasonComplete: false,
  lastCompleteSeason: 2025, completedWeeks: 0, regularWeeks: 18, currentWeek: null,
}
const OFF_2026 = {
  phase: 'offseason', lead: 'last-vs-next', liveSeason: 2026, liveSeasonComplete: false,
  lastCompleteSeason: 2025, completedWeeks: 0, regularWeeks: 18, currentWeek: null,
}
const reg = (week, extra = {}) => ({ season: '2026', season_type: 'regular', week, ...extra })

// Live /state/nfl payload captured 2026-10-03, verbatim.
const LIVE = { week: 4, leg: 4, season: '2026', season_type: 'regular', league_season: '2026', previous_season: '2025', season_start_date: '2026-09-09', display_week: 4, league_create_season: '2026', season_has_scores: true }
const PRE_FLIP = { season: '2025', season_type: 'off', season_start_date: '2025-09-04' }

describe('seasonPhase', () => {
  it('live payload -> in-season, 3 completed weeks, current-plus-ros', () => {
    expect(seasonPhase(LIVE, { now: Date.parse('2026-10-03T12:00:00Z') })).toEqual({ ...IN_2026, completedWeeks: 3, currentWeek: 4 })
  })
  it('week 1 -> in-season but nothing completed, last-vs-next (D2)', () => {
    expect(seasonPhase(reg(1))).toEqual({ ...IN_2026, lead: 'last-vs-next', completedWeeks: 0, currentWeek: 1 })
  })
  it('week 2 -> first completed week flips lead to current-plus-ros', () => {
    expect(seasonPhase(reg(2))).toEqual({ ...IN_2026, completedWeeks: 1, currentWeek: 2 })
  })
  it('week 18 -> 17 completed, still in-season', () => {
    expect(seasonPhase(reg(18))).toEqual({ ...IN_2026, completedWeeks: 17, currentWeek: 18 })
  })
  it('week 19 under regular -> completedWeeks clamped to 18, still in-season', () => {
    expect(seasonPhase(reg(19))).toEqual({ ...IN_2026, completedWeeks: 18, currentWeek: 19 })
  })
  it('2020 season has a 17-week regular season', () => {
    expect(seasonPhase({ season: '2020', season_type: 'regular', week: 17 })).toEqual({
      ...IN_2026, liveSeason: 2020, lastCompleteSeason: 2019, completedWeeks: 16, regularWeeks: 17, currentWeek: 17,
    })
  })
  it('post -> late-season, live season is "last", all weeks complete (D3)', () => {
    expect(seasonPhase({ season: '2026', season_type: 'post', week: 2 })).toEqual({
      ...OFF_2026, phase: 'late-season', liveSeasonComplete: true, lastCompleteSeason: 2026, completedWeeks: 18,
    })
  })
  it('off, post-flip (future start date) -> upcoming season', () => {
    expect(seasonPhase({ season: '2026', season_type: 'off', season_start_date: '2026-09-09' }, { now: Date.parse('2026-05-01') })).toEqual(OFF_2026)
  })
  it('off, pre-flip (start date past, same year) -> live season is complete (D4)', () => {
    expect(seasonPhase(PRE_FLIP, { now: Date.parse('2026-02-20') })).toEqual({
      ...OFF_2026, liveSeason: 2025, liveSeasonComplete: true, lastCompleteSeason: 2025, completedWeeks: 18,
    })
  })
  it('off without now -> no date branch, upcoming season', () => {
    expect(seasonPhase(PRE_FLIP)).toEqual({ ...OFF_2026, liveSeason: 2025, lastCompleteSeason: 2024 })
  })
  it('off with now as a Date -> treated as absent (epoch ms only)', () => {
    expect(seasonPhase(PRE_FLIP, { now: new Date('2026-02-20') })).toEqual({ ...OFF_2026, liveSeason: 2025, lastCompleteSeason: 2024 })
  })
  it('off, season rolled but start date is last year\'s -> year guard keeps it upcoming', () => {
    expect(seasonPhase({ season: '2027', season_type: 'off', season_start_date: '2026-09-09' }, { now: Date.parse('2027-03-15') })).toEqual({
      ...OFF_2026, liveSeason: 2027, lastCompleteSeason: 2026,
    })
  })
  it.each([
    ['missing', undefined],
    ['null', null],
    ['unparsable', 'TBD'],
  ])('off with %s season_start_date -> upcoming', (_label, date) => {
    const state = { season: '2026', season_type: 'off' }
    if (date !== undefined) state.season_start_date = date
    expect(seasonPhase(state, { now: Date.parse('2027-01-01') })).toEqual(OFF_2026)
  })
  it('pre never takes the date branch', () => {
    expect(seasonPhase({ season: '2026', season_type: 'pre', season_start_date: '2026-01-01' }, { now: Date.parse('2026-06-01') })).toEqual(OFF_2026)
  })
  it('numeric season behaves like the string form', () => {
    expect(seasonPhase({ season: 2026, season_type: 'regular', week: 4 })).toEqual(seasonPhase(reg(4)))
  })
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['unparsable season', { season: 'abc', season_type: 'regular', week: 3 }],
    ['unknown season_type', { season: '2026', season_type: 'playoffs', week: 1 }],
    ['no season_type', { season: '2026' }],
  ])('unknown input (%s) -> null', (_label, state) => {
    expect(seasonPhase(state)).toBeNull()
  })
})

describe('regularSeasonWeeks', () => {
  it('17 through 2020, 18 from 2021', () => {
    expect(regularSeasonWeeks(2020)).toBe(17)
    expect(regularSeasonWeeks(2021)).toBe(18)
    expect(regularSeasonWeeks(2026)).toBe(18)
  })
})

describe('agreement with defenceLoadPlan', () => {
  const matrix = [
    reg(1), reg(2), reg(4), reg(18), reg(19),
    { season: '2026', season_type: 'post', week: 1 },
    { season: '2026', season_type: 'pre', week: 1 },
    { season: '2026', season_type: 'off' },
  ]
  it.each(matrix.map(s => [`${s.season_type}${s.week != null && s.season_type === 'regular' ? ` week ${s.week}` : ''}`, s]))(
    'live-season plan entry exists iff completedWeeks >= 1, and throughWeek matches (%s)',
    (_label, nflState) => {
      const phase = seasonPhase(nflState)
      const live = defenceLoadPlan({ dataSeason: 2025, nflState }).find(p => p.season === 2026)
      expect(live !== undefined).toBe(phase.completedWeeks >= 1)
      if (live) expect(live.throughWeek).toBe(phase.completedWeeks)
    },
  )
})
