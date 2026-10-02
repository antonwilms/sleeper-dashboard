// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  deriveGamesPlayed, buildLast3Form, renderedPlayers, buildPriorSnapByPlayer,
  useWeeklyDecision,
} from './useWeeklyDecision'

// Fix pass 1, item 1.3 — the live-season teamcontext effect (useWeeklyDecision.js:237-256) had no
// hook-level test pinning that it keys `loadTeamContext` on the LIVE season (`season`), not
// `dataSeason`. Mock the two weekly-stats getters to resolve `{}` so the other effect's fetches
// don't interfere with this one.
const { loadTeamContext } = vi.hoisted(() => ({ loadTeamContext: vi.fn() }))
vi.mock('../api/teamContext', () => ({ loadTeamContext }))
const { getWeeklyStatRows, getWeeklyProjectionRows } = vi.hoisted(() => ({
  getWeeklyStatRows: vi.fn(() => Promise.resolve({})),
  getWeeklyProjectionRows: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../api/sleeperStats', () => ({ getWeeklyStatRows, getWeeklyProjectionRows }))

afterEach(() => {
  vi.clearAllMocks()
})

// weekly-decision-1-lineup.md fix pass 1, item 1.8 — these two derivations were unguarded despite
// §5.4 making `n`'s provenance load-bearing for the weight panel's honesty. Extracted as pure
// functions (the useTeamHistoryLoader precedent §5 cites) so they're testable without mounting the
// hook.

describe('deriveGamesPlayed', () => {
  it('returns the max gp across the defences of `current`', () => {
    const current = { teams: { DEN: { gp: 2 }, BUF: { gp: 3 }, KC: { gp: 1 } } }
    expect(deriveGamesPlayed({ current, currentWeek: 4 })).toBe(3)
  })

  it('falls back to currentWeek - 1 when `current` has no team', () => {
    expect(deriveGamesPlayed({ current: { teams: {} }, currentWeek: 4 })).toBe(3)
  })

  it('falls back to currentWeek - 1 when `current` is null', () => {
    expect(deriveGamesPlayed({ current: null, currentWeek: 4 })).toBe(3)
  })

  it('clamps the fallback at 0 for week 1 (artboard 9c, zero played weeks)', () => {
    expect(deriveGamesPlayed({ current: null, currentWeek: 1 })).toBe(0)
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

// Fix pass 1, item 1.5 — the usage/form map must cover a surplus starter (§3: starterSlots longer
// than startingSlots(rosterPositions)) routed to the bench, exactly the set buildWeeklyLineup
// renders (weeklyLineup.js's surplusIds). splitRosterIds (rosterSlots.js) already excludes a surplus starter
// from myTeam.bench, so it is only reachable via starterSlots itself.
describe('renderedPlayers', () => {
  it('includes a surplus starterSlots id even though it is absent from myTeam.bench', () => {
    const myTeam = {
      starterSlots: ['qb1', 'qb2'], // 'qb2' has no slot in a one-QB league — the surplus id
      starters: [{ id: 'qb1' }, { id: 'qb2' }],
      bench: [{ id: 'wr1' }],
      taxi: [],
    }
    const ids = renderedPlayers(myTeam).map(p => p.id)
    expect(ids).toEqual(['qb1', 'qb2', 'wr1'])
  })
})

describe('buildPriorSnapByPlayer (weekly-decision-2-panels.md §1a)', () => {
  it('keys the prior-season snap share off deriveDataSeason(careerStats), NOT season - 1', () => {
    const rendered = [{ id: 'p1' }]
    // careerStats holds a single season, 2024 — deriveDataSeason(careerStats) resolves to 2024,
    // but a naive `season - 1` computed from a live `season` of 2026 would look at 2025, which is
    // absent here.
    const careerStats = { 2024: { p1: { gamesPlayed: 10, stats: { off_snp: 400, tm_off_snp: 800 } } } }
    const out = buildPriorSnapByPlayer({ rendered, careerStats })
    expect(out.p1).toBeCloseTo(0.5)
  })

  // Fix pass 1, item 1.1 — the year is now derived INSIDE the helper via
  // `deriveDataSeason(careerStats)`, so no caller can supply the wrong one. Two seasons on file —
  // 2023 (no p1 row) and 2024 (has p1). deriveDataSeason picks the max key, 2024.
  // (mutation: deriving `Math.max(...keys) - 1` inside the helper instead of the max key itself
  // would pick 2023, where p1 is absent, and this assertion goes red — see hand-back.)
  it('picks the max careerStats key (2024), not max - 1, when two seasons are on file', () => {
    const rendered = [{ id: 'p1' }]
    const careerStats = {
      2023: {},
      2024: { p1: { gamesPlayed: 10, stats: { off_snp: 400, tm_off_snp: 800 } } },
    }
    const out = buildPriorSnapByPlayer({ rendered, careerStats })
    expect(out.p1).toBeCloseTo(0.5)
  })

  it('null for a player with no id, and for an unresolved careerStats row', () => {
    const out = buildPriorSnapByPlayer({ rendered: [{ id: null }, { id: 'missing' }], careerStats: { 2024: {} } })
    expect(out.missing).toBeNull()
    expect(Object.keys(out)).toEqual(['missing'])
  })
})

// Fix pass 1, item 1.3 — the live-season teamcontext effect (§4). `season` (the live NFL season,
// nflState.season) and `dataSeason` (the most-recent season WITH data, deriveDataSeason(careerStats))
// deliberately differ here: careerStats' max key is 2025, but the live season is 2026.
describe('useWeeklyDecision — the live-season teamcontext effect', () => {
  it('calls loadTeamContext with the live season (season), not dataSeason', async () => {
    loadTeamContext.mockResolvedValue({ teams: { KC: { games: [] } }, year: 2026, complete: true, rowCount: 100 })
    const { result } = renderHook(() => useWeeklyDecision({
      season: 2026,
      currentWeek: 2,
      myTeam: null,
      rosterPositions: [],
      scoringSettings: {},
      careerStats: { 2025: {} }, // dataSeason would resolve to 2025 — must NOT be what's requested
      defenceAllowed: null,
      playerMap: null,
      schedule: null,
    }))

    await waitFor(() => expect(loadTeamContext).toHaveBeenCalled())
    expect(loadTeamContext).toHaveBeenCalledWith(2026)
    expect(loadTeamContext).not.toHaveBeenCalledWith(2025)
    await waitFor(() => expect(result.current.liveTeamContext.complete).toBe(true))
    expect(result.current.liveTeamContext).toEqual({ teams: { KC: { games: [] } }, year: 2026, complete: true, rowCount: 100 })
  })
})
