import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MARKET_FILTERS, DYNASTY_GROUP_MAP, NFL_TEAMS,
  applyMarketFilters, activeFilterCount, normalizeFilters, isRestorableFilters,
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
  it('DEFAULT_MARKET_FILTERS has all twelve keys at their off/at-rest values', () => {
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
      search: '',
    })
  })

  it('exports DYNASTY_GROUP_MAP and NFL_TEAMS natively (moved in from PlayersTab.jsx, 1b Slice viii)', () => {
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

  describe('applyMarketFilters — Search (1b Slice vii)', () => {
    // Dedicated fixture (the shared `rows` above carry no full_name at all) — x has a name, y has
    // none (player_id/name pairs deliberately unrelated to the shared 'a'-'d' fixture).
    const searchRows = [
      { player_id: 'x', full_name: 'Justin Jefferson' },
      { player_id: 'y', full_name: 'Ja\'Marr Chase' },
      { player_id: 'z' }, // no full_name at all — the null-guard case
    ]

    it('matches a case-insensitive substring of full_name', () => {
      expect(ids(applyMarketFilters(searchRows, filters({ search: 'jefferson' }), {}))).toEqual(['x'])
      expect(ids(applyMarketFilters(searchRows, filters({ search: 'JA\'MARR' }), {}))).toEqual(['y'])
    })

    it('no match returns an empty array', () => {
      expect(ids(applyMarketFilters(searchRows, filters({ search: 'no such player' }), {}))).toEqual([])
    })

    it('whitespace-only query filters nothing — same as an untouched (default) search', () => {
      expect(ids(applyMarketFilters(searchRows, filters({ search: '   ' }), {}))).toEqual(['x', 'y', 'z'])
    })

    it('a row with no full_name is excluded by a non-empty query, not thrown on', () => {
      expect(() => applyMarketFilters(searchRows, filters({ search: 'anything' }), {})).not.toThrow()
      expect(ids(applyMarketFilters(searchRows, filters({ search: 'anything' }), {}))).not.toContain('z')
    })

    it('a row with no full_name survives an empty/default query — the guard does not drop it at rest', () => {
      expect(ids(applyMarketFilters(searchRows, filters(), {}))).toContain('z')
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

    it('a non-empty search counts as active; whitespace-only does not', () => {
      expect(activeFilterCount(filters({ search: 'jefferson' }))).toBe(1)
      expect(activeFilterCount(filters({ search: '   ' }))).toBe(0)
      expect(activeFilterCount(filters({ search: '' }))).toBe(0)
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

    it('forces search to "" even when the payload holds a non-empty value (1b Slice vii) — the one key intentionally never restored', () => {
      expect(normalizeFilters({ search: 'jefferson' }).search).toBe('')
      // Simulates a stale localStorage['market-filters'] value written before setFilters blanked
      // it on write — this is the read-side half of the two-ends guarantee (§2).
      expect(normalizeFilters(JSON.parse(JSON.stringify({ ...DEFAULT_MARKET_FILTERS, search: 'old query' }))).search).toBe('')
    })
  })

  describe('isRestorableFilters (1b Slice vii, §3.1)', () => {
    it('true for a clean, fully-valid payload', () => {
      expect(isRestorableFilters(filters())).toBe(true)
      expect(isRestorableFilters(filters({ ageRange: [22, 28], nflTeams: ['DAL'], dynastyGroups: ['Rising'] }))).toBe(true)
    })

    it('false for a null/undefined/non-object payload', () => {
      expect(isRestorableFilters(null)).toBe(false)
      expect(isRestorableFilters(undefined)).toBe(false)
      expect(isRestorableFilters('nope')).toBe(false)
    })

    // Each case below is a per-key corruption normalizeFilters would silently SALVAGE (falling
    // back to that key's default) rather than reject — isRestorableFilters must reject the WHOLE
    // payload instead, since normalizeFilters salvaging it would mean the preset silently applies
    // as "no filter on that dimension" under the name the user saved.
    it('false for a stale ageRange of strings (normalizeFilters would salvage this)', () => {
      expect(isRestorableFilters(filters({ ageRange: ['18', '45'] }))).toBe(false)
    })

    it('false for a 1-element range array', () => {
      expect(isRestorableFilters(filters({ ktcRange: [500] }))).toBe(false)
    })

    it('false for an unknown availability enum value', () => {
      expect(isRestorableFilters(filters({ availability: 'bogus' }))).toBe(false)
    })

    it('false for an unknown NFL team code inside nflTeams', () => {
      expect(isRestorableFilters(filters({ nflTeams: ['DAL', 'XXX'] }))).toBe(false)
    })

    it('false for an unknown dynasty group name inside dynastyGroups', () => {
      expect(isRestorableFilters(filters({ dynastyGroups: ['Rising', 'NotAGroup'] }))).toBe(false)
    })

    it('false for an out-of-range minProjectedGames', () => {
      expect(isRestorableFilters(filters({ minProjectedGames: 99 }))).toBe(false)
      expect(isRestorableFilters(filters({ minProjectedGames: '5' }))).toBe(false)
    })

    it('false for a missing key entirely', () => {
      const rest = filters()
      delete rest.startersOnly
      expect(isRestorableFilters(rest)).toBe(false)
    })

    it('is unaffected by the value of search — restorability does not depend on it', () => {
      expect(isRestorableFilters(filters({ search: 'anything at all' }))).toBe(true)
    })
  })
})
