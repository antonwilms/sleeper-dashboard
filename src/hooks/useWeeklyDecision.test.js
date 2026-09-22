// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  deriveGamesPlayed, buildLast3Form, deriveStoreLag, renderedPlayers, buildPriorSnapByPlayer,
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

// Builds a schedule index directly (Map<week, Map<eraTeam, {opponentEra, scored}>>), bypassing
// buildRegWeekIndex — deriveStoreLag only cares about presence/scored per (team, week), not real
// reciprocal matchups. `byeWeekForTeam[team]` is the one week that team has no entry.
function makeScheduleIndex(teams, totalWeeks, byeWeekForTeam = {}, unscoredWeeksForTeam = {}) {
  const index = new Map()
  for (let w = 1; w <= totalWeeks; w++) {
    const wk = new Map()
    for (const team of teams) {
      if (byeWeekForTeam[team] === w) continue
      const unscored = (unscoredWeeksForTeam[team] ?? []).includes(w)
      wk.set(team, { opponentEra: 'OPP', scored: !unscored })
    }
    index.set(w, wk)
  }
  return index
}

// 2-letter uppercase codes AA, AB, AC, … — isDefenseRowId is /^[A-Z]{2,3}$/.
function teamCodes(n) {
  const codes = []
  for (let i = 0; i < n; i++) {
    const a = String.fromCharCode(65 + Math.floor(i / 26))
    const b = String.fromCharCode(65 + (i % 26))
    codes.push(`${a}${b}`)
  }
  return codes
}

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

// weekly-decision-2a-lineup-truth.md §5 — per-team store-lag notice, replacing the brief's
// max-vs-completed comparison (which fires falsely once every team has had its bye, and plateaus
// across a bye so it can hide a real one-week lag).
describe('deriveStoreLag', () => {
  it('store equal to the schedule through completedWeeks -> behind: false', () => {
    const teams = ['KC', 'DE']
    const scheduleIndex = makeScheduleIndex(teams, 3)
    const currentSeasonTotals = { players: { KC: { gamesPlayed: 2 }, DE: { gamesPlayed: 2 } } }
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals, currentWeek: 3, scheduleIndex })
    expect(result).toEqual({ storeThroughWeek: 2, completedWeeks: 2, behind: false })
  })

  it('the plan-gate case: 32 teams, completedWeeks 14, every team already had its one bye -> behind: false (not the brief\'s false-positive)', () => {
    const teams = teamCodes(32)
    const byeWeekForTeam = Object.fromEntries(teams.map(t => [t, 14])) // every team's bye lands at week 14
    const scheduleIndex = makeScheduleIndex(teams, 14, byeWeekForTeam)
    // Every team has played 13 games through week 14 (13 weeks of games, one bye at week 14).
    const players = Object.fromEntries(teams.map(t => [t, { gamesPlayed: 13 }]))
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players }, currentWeek: 15, scheduleIndex })
    expect(result.behind).toBe(false)
    expect(result.storeThroughWeek).toBe(14)
  })

  it('the plateau-lag case: the store only runs through week 13, and week-14 bye teams\' counts equal their week-13 counts -> behind: true, storeThroughWeek: 13', () => {
    const teams = teamCodes(32)
    // T[0] byes at week 14 (unaffected by the lag — its week-13 and week-14 counts are identical);
    // every other team byes at week 1, so they have a real week-14 game the store hasn't recorded.
    const byeWeekForTeam = { [teams[0]]: 14 }
    for (let i = 1; i < teams.length; i++) byeWeekForTeam[teams[i]] = 1
    const scheduleIndex = makeScheduleIndex(teams, 14, byeWeekForTeam)
    const players = {}
    players[teams[0]] = { gamesPlayed: 13 } // played all of weeks 1-13, byes week 14 — plateaus
    for (let i = 1; i < teams.length; i++) players[teams[i]] = { gamesPlayed: 12 } // store lags one game
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players }, currentWeek: 15, scheduleIndex })
    expect(result).toEqual({ storeThroughWeek: 13, completedWeeks: 14, behind: true })
  })

  it('a cancelled week-3 game does not hold the notice up once the store reflects the real (lower) count, and a missing DEF row does not zero storeThroughWeek', () => {
    // 'CC' plays every week in the schedule but has no DEF row in the store at all — it must be
    // skipped, not treated as having played 0 games (which would otherwise cap storeThroughWeek).
    const teams = ['AA', 'BB', 'CC']
    const scheduleIndex = makeScheduleIndex(teams, 6, {}, { AA: [3] }) // AA's week-3 game never scores
    const players = { AA: { gamesPlayed: 5 }, BB: { gamesPlayed: 6 } } // no 'CC' row
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players }, currentWeek: 7, scheduleIndex })
    expect(result).toEqual({ storeThroughWeek: 6, completedWeeks: 6, behind: false })
  })

  it('the complete file has no DEF row -> null', () => {
    const scheduleIndex = makeScheduleIndex(['KC'], 2)
    const currentSeasonTotals = { players: { qb123: { gamesPlayed: 2 } } } // no DEF-shaped key
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals, currentWeek: 3, scheduleIndex })
    expect(result).toBeNull()
  })

  it('currentSeason unresolved -> null; scheduleIndex null -> null', () => {
    const scheduleIndex = makeScheduleIndex(['KC'], 2)
    expect(deriveStoreLag({ currentSeason: null, currentSeasonTotals: { players: { KC: { gamesPlayed: 1 } } }, currentWeek: 2, scheduleIndex })).toBeNull()
    expect(deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players: { KC: { gamesPlayed: 1 } } }, currentWeek: 2, scheduleIndex: null })).toBeNull()
  })

  // Fix pass 1, item 1.2 — scheduledGamesThrough must count an unscored game only in the actual
  // latest completed week, not in whatever week a caller is currently probing. A cancelled game at
  // a week below completedWeeks must not require the store to have data for it before later weeks
  // can be credited. NOTE: the task file's prose names the cancelled week as "week 3"; only a
  // cancelled week 4 (with this completedWeeks/gamesPlayed pairing) reproduces the section's
  // asserted numbers (storeThroughWeek: 4, mutation reads 3) — see hand-back.
  it('a cancelled game below completedWeeks does not hold storeThroughWeek at the cancelled week', () => {
    const teams = ['AA']
    const scheduleIndex = makeScheduleIndex(teams, 6, {}, { AA: [4] }) // AA's week-4 game never scores
    const players = { AA: { gamesPlayed: 3 } } // weeks 1-3 recorded; week 4 is cancelled, needs no data
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players }, currentWeek: 7, scheduleIndex })
    expect(result).toEqual({ storeThroughWeek: 4, completedWeeks: 6, behind: true })
  })

  it('a DEF row keyed LAR against a schedule keyed LA counts toward LA (CR-16 hop)', () => {
    const scheduleIndex = makeScheduleIndex(['LA'], 2)
    const players = { LAR: { gamesPlayed: 1 } } // store lags one game behind LA's 2 scheduled
    const result = deriveStoreLag({ currentSeason: 2026, currentSeasonTotals: { players }, currentWeek: 3, scheduleIndex })
    expect(result).toEqual({ storeThroughWeek: 1, completedWeeks: 2, behind: true })
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
      currentSeasonTotals: null,
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
