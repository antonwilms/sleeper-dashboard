import { describe, it, expect } from 'vitest'
import { deriveGamesPlayed, buildLast3Form } from './useWeeklyDecision'

// weekly-decision-1-lineup.md fix pass 1, item 1.8 — these two derivations were unguarded despite
// §5.4 making `n`'s provenance load-bearing for the weight panel's honesty. Extracted as pure
// functions (the useTeamHistoryLoader precedent §5 cites) so they're testable without mounting the
// hook.

describe('deriveGamesPlayed', () => {
  it('returns the max gamesPlayed across DEF rows when currentSeason is resolved', () => {
    const currentSeasonTotals = {
      players: {
        DEN: { gamesPlayed: 2 },
        BUF: { gamesPlayed: 3 },
        qb123: { gamesPlayed: 99 }, // not a DEF row (isDefenseRowId is /^[A-Z]{2,3}$/) — ignored
      },
    }
    const n = deriveGamesPlayed({ currentSeason: 2026, currentSeasonTotals, currentWeek: 4 })
    expect(n).toBe(3)
  })

  it('falls back to currentWeek - 1 when currentSeasonTotals.players has no DEF rows', () => {
    const currentSeasonTotals = { players: { qb123: { gamesPlayed: 99 } } }
    const n = deriveGamesPlayed({ currentSeason: 2026, currentSeasonTotals, currentWeek: 4 })
    expect(n).toBe(3)
  })

  it('falls back to currentWeek - 1 when currentSeason is not resolved (currentSeasonTotals not complete)', () => {
    const currentSeasonTotals = { players: { DEN: { gamesPlayed: 2 } } }
    const n = deriveGamesPlayed({ currentSeason: null, currentSeasonTotals, currentWeek: 4 })
    expect(n).toBe(3)
  })

  it('falls back to currentWeek - 1 when currentSeasonTotals.players is absent', () => {
    const n = deriveGamesPlayed({ currentSeason: 2026, currentSeasonTotals: null, currentWeek: 4 })
    expect(n).toBe(3)
  })

  it('clamps the fallback at 0 for week 1 (artboard 9c, zero played weeks)', () => {
    const n = deriveGamesPlayed({ currentSeason: null, currentSeasonTotals: null, currentWeek: 1 })
    expect(n).toBe(0)
  })

  it('a DEF row with gamesPlayed 0 still counts as "saw a DEF row" — n is 0, not the week fallback', () => {
    const currentSeasonTotals = { players: { DEN: { gamesPlayed: 0 } } }
    const n = deriveGamesPlayed({ currentSeason: 2026, currentSeasonTotals, currentWeek: 4 })
    expect(n).toBe(0)
  })
})

describe('buildLast3Form', () => {
  const SCORING = { pass_yd: 0.04, rush_yd: 0.1, rec: 0.5, rec_yd: 0.1 }

  it('fewer than three played weeks yields leading nulls, oldest-first, never padded with 0', () => {
    const playedWeeklyMaps = [
      { week: 1, rows: { p1: { stats: { gp: 1, rush_yd: 24 } } } },
    ]
    const form = buildLast3Form(playedWeeklyMaps, 'p1', SCORING)
    expect(form).toEqual([null, null, 2.4])
  })

  it('filters out weeks where gp !== 1 — inactive weeks are not "played"', () => {
    const playedWeeklyMaps = [
      { week: 1, rows: { p1: { stats: { gp: 0, rush_yd: 100 } } } }, // inactive — excluded
      { week: 2, rows: { p1: { stats: { gp: 1, rush_yd: 10 } } } },
    ]
    const form = buildLast3Form(playedWeeklyMaps, 'p1', SCORING)
    expect(form).toEqual([null, null, 1])
  })

  it('three or more played weeks keeps only the last three, oldest first', () => {
    const playedWeeklyMaps = [
      { week: 1, rows: { p1: { stats: { gp: 1, rush_yd: 10 } } } },
      { week: 2, rows: { p1: { stats: { gp: 1, rush_yd: 20 } } } },
      { week: 3, rows: { p1: { stats: { gp: 1, rush_yd: 30 } } } },
      { week: 4, rows: { p1: { stats: { gp: 1, rush_yd: 40 } } } },
    ]
    const form = buildLast3Form(playedWeeklyMaps, 'p1', SCORING)
    expect(form).toEqual([2, 3, 4])
  })

  it('no played weeks at all yields three leading nulls', () => {
    const form = buildLast3Form([], 'p1', SCORING)
    expect(form).toEqual([null, null, null])
  })

  it('a week with no row for this player is treated the same as not played', () => {
    const playedWeeklyMaps = [
      { week: 1, rows: {} },
      { week: 2, rows: { p1: { stats: { gp: 1, rush_yd: 10 } } } },
    ]
    const form = buildLast3Form(playedWeeklyMaps, 'p1', SCORING)
    expect(form).toEqual([null, null, 1])
  })
})
