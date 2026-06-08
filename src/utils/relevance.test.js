/**
 * src/utils/relevance.test.js
 *
 * Unit tests for playedRecently, rosterStatusOf, and isRelevantPlayer.
 * Uses minimal fixtures — no network or IndexedDB.
 */

import { describe, it, expect } from 'vitest'
import { playedRecently, rosterStatusOf, isRelevantPlayer } from './relevance'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makePlayerMap(overrides = {}) {
  return {
    'p1': {
      age: 28,
      team: 'PIT',
      years_exp: 10,
      full_name: 'Ben R',
      ...overrides,
    },
  }
}

function makeRow(overrides = {}) {
  return {
    player_id: 'p1',
    age: 28,
    years_exp: 10,
    nfl_team: 'PIT',
    full_name: 'Ben R',
    ...overrides,
  }
}

function makeCareerStats(gamesPlayedByYear = {}) {
  const stats = {}
  for (const [season, gp] of Object.entries(gamesPlayedByYear)) {
    stats[Number(season)] = { p1: { gamesPlayed: gp } }
  }
  return stats
}

function makeArgs(overrides = {}) {
  return {
    row: makeRow(),
    playerMap: makePlayerMap(),
    rosteredIds: new Set(),
    ktcMap: null,
    careerStats: makeCareerStats({ 2024: 0, 2025: 0 }),
    mostRecentSeason: 2025,
    rosterIds: null,
    rosterComplete: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// rosterStatusOf — test 16
// ---------------------------------------------------------------------------

describe('rosterStatusOf', () => {
  it('returns present when rosterComplete and player in rosterIds', () => {
    expect(rosterStatusOf('p1', new Set(['p1']), true)).toBe('present')
  })

  it('returns absent when rosterComplete and player NOT in rosterIds', () => {
    expect(rosterStatusOf('p1', new Set(['other']), true)).toBe('absent')
  })

  it('returns unknown when rosterComplete is false', () => {
    expect(rosterStatusOf('p1', new Set(['p1']), false)).toBe('unknown')
  })

  it('returns unknown when rosterIds is null', () => {
    expect(rosterStatusOf('p1', null, true)).toBe('unknown')
  })

  it('returns unknown when both rosterComplete is false and rosterIds is null', () => {
    expect(rosterStatusOf('p1', null, false)).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// playedRecently — test 17
// ---------------------------------------------------------------------------

describe('playedRecently', () => {
  it('returns true when gamesPlayed > 0 in mostRecentSeason - 1', () => {
    const cs = { 2024: { p1: { gamesPlayed: 12 } }, 2025: { p1: { gamesPlayed: 0 } } }
    expect(playedRecently(cs, 'p1', 2025, 2)).toBe(true)
  })

  it('returns false when gamesPlayed > 0 only in mostRecentSeason - 2 (outside lookback 2)', () => {
    const cs = { 2023: { p1: { gamesPlayed: 16 } }, 2024: { p1: { gamesPlayed: 0 } }, 2025: { p1: { gamesPlayed: 0 } } }
    expect(playedRecently(cs, 'p1', 2025, 2)).toBe(false)
  })

  it('returns true when gamesPlayed > 0 in mostRecentSeason itself', () => {
    const cs = { 2025: { p1: { gamesPlayed: 14 } } }
    expect(playedRecently(cs, 'p1', 2025, 2)).toBe(true)
  })

  it('returns false for a player with no career stats at all', () => {
    expect(playedRecently({}, 'p1', 2025, 2)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isRelevantPlayer — tests 9–15
// ---------------------------------------------------------------------------

describe('isRelevantPlayer', () => {
  // Test 9: Guarantee — rostered always kept even when absent from roster
  it('rostered player is kept even when definitively absent from roster', () => {
    const args = makeArgs({
      rosteredIds: new Set(['p1']),
      rosterIds: new Set(['other_player']),
      rosterComplete: true,
    })
    expect(isRelevantPlayer(args)).toBe(true)
  })

  // Test 10: Guarantee — current rookie always kept even when absent from roster
  it('current rookie (years_exp 0, age 21) is kept even when absent from roster', () => {
    const args = makeArgs({
      row: makeRow({ years_exp: 0, age: 21, nfl_team: 'FA' }),
      playerMap: { p1: { age: 21, team: null, years_exp: 0, full_name: 'Rookie R' } },
      rosterIds: new Set(['other_player']),
      rosterComplete: true,
    })
    expect(isRelevantPlayer(args)).toBe(true)
  })

  // Test 11: Primary fix — stale-team + KTC retiree is excluded when roster-absent
  it('stale-team + KTC retiree is excluded when definitively absent from complete roster', () => {
    const ktcMap = new Map([['p1', { value: 100 }]])
    const args = makeArgs({
      // not rostered, not rookie, no recent play, has stale PIT team, in KTC
      ktcMap,
      rosterIds: new Set(['other_player']),  // p1 absent
      rosterComplete: true,
    })
    // careerStats has 0 gamesPlayed in 2024 and 2025 → playedRecently = false
    expect(isRelevantPlayer(args)).toBe(false)
  })

  // Test 12: Fallback — roster unknown → Rule 6 (stale team + KTC) still fires
  it('when rosterComplete is false (unknown), stale-team + KTC still keeps the player', () => {
    const ktcMap = new Map([['p1', { value: 100 }]])
    const args = makeArgs({
      ktcMap,
      rosterIds: null,
      rosterComplete: false,  // roster unavailable → rs = 'unknown'
    })
    expect(isRelevantPlayer(args)).toBe(true)
  })

  // Test 13: Roster presence keep (new additive signal)
  it('player with no team and not in KTC is kept when present in roster', () => {
    const args = makeArgs({
      row: makeRow({ nfl_team: 'FA' }),
      playerMap: { p1: { age: 28, team: null, years_exp: 5, full_name: 'FA Player' } },
      ktcMap: null,       // not in KTC
      rosterIds: new Set(['p1']),  // but present in roster
      rosterComplete: true,
    })
    expect(isRelevantPlayer(args)).toBe(true)
  })

  // Test 14: Played-recently still keeps even when absent from roster
  it('player absent from complete roster is kept when they played last season', () => {
    const args = makeArgs({
      careerStats: makeCareerStats({ 2024: 14, 2025: 0 }),  // played in 2024
      rosterIds: new Set(['other_player']),  // p1 absent
      rosterComplete: true,
    })
    expect(isRelevantPlayer(args)).toBe(true)
  })

  // Test 15: Ghost entry excluded regardless
  it('ghost entry (no age/team/years_exp/full_name) is excluded unconditionally', () => {
    const args = makeArgs({
      row: makeRow({ age: null, nfl_team: 'FA', years_exp: null, full_name: 'p1' }),
      playerMap: { p1: { age: 0, team: null, years_exp: null, full_name: null } },
      rosteredIds: new Set(),
      rosterIds: new Set(['p1']),
      rosterComplete: true,
      ktcMap: new Map([['p1', { value: 500 }]]),
    })
    expect(isRelevantPlayer(args)).toBe(false)
  })
})
