import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MARKET_FILTERS, DYNASTY_GROUP_MAP, NFL_TEAMS,
  applyMarketFilters, activeFilterCount, normalizeFilters,
} from './marketFilters'

function filters(overrides = {}) {
  return { ...DEFAULT_MARKET_FILTERS, ...overrides }
}

// a — full data: on my roster, starter, undervalued, Established dynasty label.
// b — sparse: null age, null years_exp, null ktcValue, un-owned, on an NFL team, Rising label,
//     overvalued, no seasonProjections entry at all.
// c — rookie, un-owned, on no NFL team (FA), Prospects label, no divergence signal, low KTC,
//     no seasonProjections entry.
// d — owned by another team, bench (depth_chart_order 2), Declining label, no divergence signal,
//     has a seasonProjections entry with a low projectedGames.
const rows = [
  { player_id: 'a', age: 25, years_exp: 3, nfl_team: 'DAL', ownerTeamName: 'My Team', dynastyScore: { label: 'Elite' }, divergenceSignal: 'undervalued', ktcValue: 8000 },
  { player_id: 'b', age: null, years_exp: null, nfl_team: 'SF', ownerTeamName: null, dynastyScore: { label: 'Breakout' }, divergenceSignal: 'overvalued', ktcValue: null },
  { player_id: 'c', age: 22, years_exp: 0, nfl_team: 'FA', ownerTeamName: null, dynastyScore: { label: 'Elite Prospect' }, divergenceSignal: null, ktcValue: 500 },
  { player_id: 'd', age: 30, years_exp: 8, nfl_team: 'KC', ownerTeamName: 'Other Team', dynastyScore: { label: 'Sell Now' }, divergenceSignal: null, ktcValue: 3000 },
]

const playerMap = {
  a: { depth_chart_order: 1 },
  b: { depth_chart_order: 2 },
  c: {},
  d: { depth_chart_order: 2 },
}

const seasonProjections = {
  a: { projectedGames: 17 },
  d: { projectedGames: 5 },
  // b, c intentionally absent — no projection at all.
}

const ctx = { playerMap, myTeamName: 'My Team', seasonProjections }

function ids(out) { return out.map(r => r.player_id) }

describe('marketFilters', () => {
  it('DEFAULT_MARKET_FILTERS has all eleven keys at their off/at-rest values', () => {
    expect(DEFAULT_MARKET_FILTERS).toEqual({
      startersOnly: false,
      rookiesOnly: false,
      ageRange: [18, 45],
      expRange: [0, 20],
      availability: 'all',
      nflTeams: [],
      fantasyTeams: [],
      dynastyGroups: [],
      marketSignal: 'all',
      ktcRange: [0, 10000],
      minProjectedGames: 0,
    })
  })

  it('re-exports DYNASTY_GROUP_MAP and NFL_TEAMS imported from PlayersTab, not forked', () => {
    expect(DYNASTY_GROUP_MAP.Prospects).toContain('Elite Prospect')
    expect(NFL_TEAMS).toContain('DAL')
    expect(NFL_TEAMS).not.toContain('FA')
  })

  describe('applyMarketFilters — at rest', () => {
    it('returns every row unfiltered when all filters are default', () => {
      expect(ids(applyMarketFilters(rows, filters(), ctx))).toEqual(['a', 'b', 'c', 'd'])
    })
  })

  describe('applyMarketFilters — Player group', () => {
    it('startersOnly keeps only depth_chart_order === 1 rows', () => {
      expect(ids(applyMarketFilters(rows, filters({ startersOnly: true }), ctx))).toEqual(['a'])
    })

    it('rookiesOnly keeps only years_exp === 0 (strict — null does not qualify)', () => {
      expect(ids(applyMarketFilters(rows, filters({ rookiesOnly: true }), ctx))).toEqual(['c'])
    })

    it('ageRange sentinel: a null-age row survives an untouched slider', () => {
      const out = applyMarketFilters(rows, filters(), ctx)
      expect(ids(out)).toContain('b')
    })

    it('ageRange sentinel: the same null-age row is dropped once the range moves', () => {
      const out = applyMarketFilters(rows, filters({ ageRange: [20, 35] }), ctx)
      expect(ids(out)).not.toContain('b')
      expect(ids(out)).toEqual(['a', 'c', 'd'])
    })

    it('expRange sentinel: a null-years_exp row survives an untouched slider', () => {
      const out = applyMarketFilters(rows, filters(), ctx)
      expect(ids(out)).toContain('b')
    })

    it('expRange sentinel: the same null-years_exp row is dropped once the range moves', () => {
      const out = applyMarketFilters(rows, filters({ expRange: [0, 5] }), ctx)
      expect(ids(out)).not.toContain('b')
      // d has years_exp 8, above the narrowed [0,5] ceiling.
      expect(ids(out)).toEqual(['a', 'c'])
    })
  })

  describe('applyMarketFilters — Availability', () => {
    it('myRoster keeps only rows owned by myTeamName', () => {
      expect(ids(applyMarketFilters(rows, filters({ availability: 'myRoster' }), ctx))).toEqual(['a'])
    })

    it('available = un-owned AND on an NFL team (excludes FA)', () => {
      expect(ids(applyMarketFilters(rows, filters({ availability: 'available' }), ctx))).toEqual(['b'])
    })

    it('nflFreeAgent = un-owned FA/no-team rows, distinct from available', () => {
      expect(ids(applyMarketFilters(rows, filters({ availability: 'nflFreeAgent' }), ctx))).toEqual(['c'])
    })
  })

  describe('applyMarketFilters — Team', () => {
    it('nflTeams keeps rows whose nfl_team is in the selection', () => {
      expect(ids(applyMarketFilters(rows, filters({ nflTeams: ['DAL', 'KC'] }), ctx))).toEqual(['a', 'd'])
    })

    it('fantasyTeams keeps rows whose ownerTeamName is in the selection (null never matches)', () => {
      expect(ids(applyMarketFilters(rows, filters({ fantasyTeams: ['My Team'] }), ctx))).toEqual(['a'])
    })
  })

  describe('applyMarketFilters — Dynasty', () => {
    it('dynastyGroups keeps rows whose label falls in any selected group', () => {
      expect(ids(applyMarketFilters(rows, filters({ dynastyGroups: ['Rising'] }), ctx))).toEqual(['b'])
      expect(ids(applyMarketFilters(rows, filters({ dynastyGroups: ['Established', 'Prospects'] }), ctx))).toEqual(['a', 'c'])
    })

    it('marketSignal keeps undervalued or overvalued rows only', () => {
      expect(ids(applyMarketFilters(rows, filters({ marketSignal: 'undervalued' }), ctx))).toEqual(['a'])
      expect(ids(applyMarketFilters(rows, filters({ marketSignal: 'overvalued' }), ctx))).toEqual(['b'])
    })

    it('ktcRange sentinel: a null-ktcValue row survives an untouched slider', () => {
      const out = applyMarketFilters(rows, filters(), ctx)
      expect(ids(out)).toContain('b')
    })

    it('ktcRange sentinel: the same null-ktcValue row is dropped once the range moves', () => {
      const out = applyMarketFilters(rows, filters({ ktcRange: [1000, 10000] }), ctx)
      expect(ids(out)).not.toContain('b')
      // c (500) also falls below the narrowed floor.
      expect(ids(out)).toEqual(['a', 'd'])
    })
  })

  describe('applyMarketFilters — Projection', () => {
    it('minProjectedGames = 0 filters nothing, including rows with no projection entry at all', () => {
      const out = applyMarketFilters(rows, filters({ minProjectedGames: 0 }), ctx)
      expect(ids(out)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('minProjectedGames > 0 excludes rows below the threshold AND rows with no projection', () => {
      const out = applyMarketFilters(rows, filters({ minProjectedGames: 10 }), ctx)
      // a=17 qualifies; d=5 does not; b/c have no projection entry at all and do not qualify.
      expect(ids(out)).toEqual(['a'])
    })
  })

  describe('applyMarketFilters — composition', () => {
    it('multiple active dimensions AND together, narrowing further than either alone', () => {
      const single = applyMarketFilters(rows, filters({ availability: 'available' }), ctx)
      expect(ids(single)).toEqual(['b'])

      // Adding a second, non-overlapping dimension must narrow further (a reducer that
      // replaced rather than composed would just return nflTeams' own result, ['a','d']).
      const composed = applyMarketFilters(rows, filters({ availability: 'available', nflTeams: ['KC'] }), ctx)
      expect(ids(composed)).toEqual([])

      const composedMatching = applyMarketFilters(rows, filters({ availability: 'available', nflTeams: ['SF'] }), ctx)
      expect(ids(composedMatching)).toEqual(['b'])
    })
  })

  describe('activeFilterCount', () => {
    it('counts zero for all-default filters', () => {
      expect(activeFilterCount(filters())).toBe(0)
    })

    it('counts exactly the non-default dimensions', () => {
      const f = filters({
        startersOnly: true,
        ageRange: [20, 30],
        availability: 'myRoster',
        nflTeams: ['DAL'],
        minProjectedGames: 5,
      })
      expect(activeFilterCount(f)).toBe(5)
    })

    it('a range filter counts once even when both ends move', () => {
      expect(activeFilterCount(filters({ ktcRange: [100, 9000] }))).toBe(1)
    })
  })

  describe('normalizeFilters', () => {
    it('passes through a fully valid payload unchanged', () => {
      const valid = filters({ ageRange: [22, 28], availability: 'available', nflTeams: ['DAL'] })
      expect(normalizeFilters(valid)).toEqual(valid)
    })

    it('rejects a stale ageRange of strings, falling back to the default range', () => {
      const out = normalizeFilters({ ageRange: ['18', '45'] })
      expect(out.ageRange).toEqual(DEFAULT_MARKET_FILTERS.ageRange)
    })

    it('rejects a 1-element range array, falling back to the default range', () => {
      const out = normalizeFilters({ ktcRange: [500] })
      expect(out.ktcRange).toEqual(DEFAULT_MARKET_FILTERS.ktcRange)
    })

    it('rejects an unknown availability enum, falling back to "all"', () => {
      const out = normalizeFilters({ availability: 'bogus' })
      expect(out.availability).toBe('all')
    })

    it('falls back to the default for a missing key', () => {
      const out = normalizeFilters({ startersOnly: true })
      expect(out.ktcRange).toEqual(DEFAULT_MARKET_FILTERS.ktcRange)
      expect(out.startersOnly).toBe(true)
    })

    it('handles a null/undefined payload by returning all defaults', () => {
      expect(normalizeFilters(null)).toEqual(DEFAULT_MARKET_FILTERS)
      expect(normalizeFilters(undefined)).toEqual(DEFAULT_MARKET_FILTERS)
    })

    it('drops unknown NFL team codes and unknown dynasty group names', () => {
      const out = normalizeFilters({ nflTeams: ['DAL', 'XXX'], dynastyGroups: ['Rising', 'NotAGroup'] })
      expect(out.nflTeams).toEqual(['DAL'])
      expect(out.dynastyGroups).toEqual(['Rising'])
    })

    it('rejects an out-of-range minProjectedGames, falling back to 0', () => {
      expect(normalizeFilters({ minProjectedGames: 99 }).minProjectedGames).toBe(0)
      expect(normalizeFilters({ minProjectedGames: '5' }).minProjectedGames).toBe(0)
    })
  })
})
