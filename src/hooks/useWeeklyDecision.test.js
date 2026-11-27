// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  deriveGamesPlayed, renderedPlayers, buildPriorSnapByPlayer,
  useWeeklyDecision,
} from './useWeeklyDecision'
import { buildTeamMetricsTable } from '../utils/environment'

// Mock the two weekly-stats getters to resolve `{}` so the effect's fetches don't interfere. The live
// team context is a hook PARAM now (myteam-m2a-offences.md D7), not loaded here.
const { getWeeklyStatRows, getWeeklyProjectionRows } = vi.hoisted(() => ({
  getWeeklyStatRows: vi.fn(() => Promise.resolve({})),
  getWeeklyProjectionRows: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../api/sleeperStats', () => ({ getWeeklyStatRows, getWeeklyProjectionRows }))

const { getMatchups } = vi.hoisted(() => ({ getMatchups: vi.fn(() => Promise.resolve([])) }))
vi.mock('../api/sleeper', () => ({ getMatchups }))

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

// Fix pass 1, item 1.5 — the usage/trend maps must cover a surplus starter (§3: starterSlots longer
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

// week-own-projection.md §7.4 — the wiring: schedule -> impliedIndex -> ownByPlayer, with the
// scored seasonProjections map as the base. The schedule is `{ games: [...] }`, never a bare array.
describe('useWeeklyDecision — OURS wiring (week-own-projection.md)', () => {
  const reg = (week, home, away, spreadLine, totalLine) => ({
    week, gameType: 'REG', homeTeam: home, awayTeam: away, spreadLine, totalLine, homeScore: null,
  })
  // DAL: week 1 implied 24, week 2 24, week 3 24, week 4 27 (home, spread 6, total 48).
  const schedule = {
    complete: true,
    games: [
      reg(1, 'DAL', 'NYG', 0, 48), reg(2, 'PHI', 'DAL', 0, 48), reg(3, 'DAL', 'WAS', 0, 48),
      reg(4, 'DAL', 'TB', 6, 48),
    ],
  }
  const myTeam = {
    starterSlots: ['w1'],
    starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }],
    bench: [], taxi: [],
  }
  const args = {
    season: 2026, currentWeek: 4, myTeam, rosterPositions: ['WR'], scoringSettings: {},
    careerStats: { 2025: {} }, defenceAllowed: null, playerMap: {}, schedule,
  }

  it('ownByPlayer.w1 is the projectedPPG times the Vegas factor, flagged ros when inSeason is present', async () => {
    const { result } = renderHook(() => useWeeklyDecision({
      ...args, seasonProjections: { w1: { projectedPPG: 14.2, inSeason: {} } },
    }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const own = result.current.ownByPlayer.w1
    // implied 27 vs earlier mean 24 -> 1 + 0.5 * (27/24 - 1) = 1.0625
    expect(own.reason).toBeNull()
    expect(own.baseKind).toBe('ros')
    expect(own.vegas.baselineWeeks).toBe(3)
    expect(own.value).toBeCloseTo(14.2 * 1.0625, 6)
  })

  it('seasonProjections null gives reason no-base', async () => {
    const { result } = renderHook(() => useWeeklyDecision({ ...args, seasonProjections: null }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ownByPlayer.w1.reason).toBe('no-base')
    expect(result.current.ownByPlayer.w1.value).toBeNull()
  })

  // M2b T12 — the panel left /week, but the lineup's ALLOWED / G and YDS ALLOWED must not move.
  it('M2b T12 lineup ALLOWED / G and YDS ALLOWED are unchanged and the removed keys are gone', async () => {
    const defenceAllowed = {
      prior: { season: 2025, failedWeeks: [], teams: { TB: { gp: 17, pts: { qb: 0, rb: 0, wr: 340, te: 0 }, passYd: 4080, rushYd: 1700 } } },
      current: { season: 2026, failedWeeks: [], teams: { TB: { gp: 3, pts: { qb: 0, rb: 0, wr: 90, te: 0 }, passYd: 693, rushYd: 270 } } },
    }
    const { result } = renderHook(() => useWeeklyDecision({
      ...args, defenceAllowed, seasonProjections: { w1: { projectedPPG: 14.2 } },
    }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const s0 = result.current.lineup.starters[0]
    expect(s0.allows).toBe(25)
    expect(s0.allowsRank).toBe(1)
    expect(s0.weight).toBe(0.5)
    expect(result.current.matchupCols.w1.yards).toEqual({ kind: 'pass', current: 231, prior: 240, priorSeason: 2025 })
    for (const k of ['priorRecords', 'currentRecords', 'defenceFailedWeeks']) expect(result.current).not.toHaveProperty(k)
  })

  it('the fixture is a game, not a bye, for DAL in week 4 (so the row is not blanked as bye)', async () => {
    const { result } = renderHook(() => useWeeklyDecision({
      ...args, seasonProjections: { w1: { projectedPPG: 14.2 } },
    }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scheduleIndex.get(4).get('DAL')).toMatchObject({ opponentEra: 'TB' })
    expect(result.current.lineup.starters[0].bye).toBe(false)
    expect(result.current.ownByPlayer.w1.baseKind).toBe('season')
  })
})

// W2b-3 — the hook builds the season grid once and the strip is a filter of that same grid.
describe('useWeeklyDecision — season grid and strip wiring (W2b-3)', () => {
  const reg = (week, home, away) => ({ week, gameType: 'REG', homeTeam: home, awayTeam: away, spreadLine: 0, totalLine: 48, homeScore: null })
  const schedule = {
    complete: true,
    games: [reg(1, 'DAL', 'NYG'), reg(2, 'PHI', 'DAL'), reg(3, 'DAL', 'WAS'), reg(4, 'DAL', 'TB')],
  }
  const myTeam = {
    starterSlots: ['w1'],
    starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }],
    bench: [], taxi: [],
  }
  const args = {
    season: 2026, currentWeek: 4, myTeam, rosterPositions: ['WR'], scoringSettings: {},
    careerStats: { 2025: {} }, defenceAllowed: null, playerMap: {}, schedule, seasonProjections: null,
  }

  it('S13 stripByPlayer cells are the seasonGrid\'s own cell objects (weeks before currentWeek) and the trend covers the same rendered set', async () => {
    getWeeklyStatRows.mockImplementation((s, w) => Promise.resolve(w === 1 ? { w1: { team: 'DAL', stats: { gp: 1, rec: 3 } } } : {}))
    try {
      const { result } = renderHook(() => useWeeklyDecision(args))
      await waitFor(() => expect(result.current.loading).toBe(false))
      const strip = result.current.stripByPlayer.w1
      expect(strip.cells).toHaveLength(3)
      const gridRow = result.current.seasonGrid.find(g => g.key === 'starters').rows.find(r => r.id === 'w1')
      strip.cells.forEach((c, i) => expect(c).toBe(gridRow.cells[i]))
      expect(strip.cells.map(c => c.kind)).toEqual(['played', 'dnp', 'dnp'])
      expect(result.current.usageTrendByPlayer.w1.snap).toHaveLength(3)
    } finally {
      getWeeklyStatRows.mockImplementation(() => Promise.resolve({}))
    }
  })
})

// week-w-matchup-flags-visuals.md §1c — the live-week matchups read and its degradation.
describe('useWeeklyDecision — the live-week matchups effect', () => {
  const myTeam = {
    rosterId: 3, starterSlots: ['w1'],
    starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }], bench: [], taxi: [],
  }
  const args = {
    season: 2026, currentWeek: 9, myTeam, rosterPositions: ['WR'], scoringSettings: {},
    careerStats: { 2025: {} }, defenceAllowed: null, playerMap: {}, schedule: null,
    rosterTeams: [{ rosterId: 3, teamName: 'Me' }, { rosterId: 4, teamName: 'Them' }], standings: [],
  }

  it('T16 reads the live week, pairs the opponent, and a rejection degrades without touching error', async () => {
    getMatchups.mockResolvedValueOnce([
      { roster_id: 3, matchup_id: 1, points: 0, starters: [] }, { roster_id: 4, matchup_id: 1, points: 0, starters: [] },
    ])
    const { result } = renderHook(() => useWeeklyDecision({ ...args, leagueId: 'L1' }))
    await waitFor(() => expect(result.current.matchup.opponent?.rosterId).toBe(4))
    expect(getMatchups).toHaveBeenCalledTimes(1)
    expect(getMatchups).toHaveBeenCalledWith('L1', 9, 9)

    getMatchups.mockRejectedValueOnce(new Error('boom'))
    const failed = renderHook(() => useWeeklyDecision({ ...args, leagueId: 'L2' }))
    await waitFor(() => expect(failed.result.current.matchup.reason).toBe('fetch-failed'))
    await waitFor(() => expect(failed.result.current.loading).toBe(false))
    expect(failed.result.current.error).toBeNull()
    expect(failed.result.current.lineup.starters).toHaveLength(1)
  })

  it('without a leagueId getMatchups is not called and the reason is no-league', async () => {
    const { result } = renderHook(() => useWeeklyDecision({ ...args }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(getMatchups).not.toHaveBeenCalled()
    expect(result.current.matchup.reason).toBe('no-league')
  })
})

// week-w2a-lineup-matchup-layout.md H1 — the matchupCols wiring: the right week for the schedule
// line, and team metrics only from a complete team-context load.
describe('useWeeklyDecision — matchupCols wiring (W2a)', () => {
  const reg = (week, home, away, spreadLine, totalLine) => ({
    week, gameType: 'REG', homeTeam: home, awayTeam: away, spreadLine, totalLine, homeScore: null,
  })
  // Week 3 DAL is the underdog (spread -9, so implied 18); week 4 DAL home, spread 3, total 45.
  const schedule = { complete: true, games: [reg(3, 'DAL', 'WAS', -9, 45), reg(4, 'DAL', 'TB', 3, 45)] }
  const myTeam = {
    starterSlots: ['w1'], starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }], bench: [], taxi: [],
  }
  const args = {
    season: 2026, currentWeek: 4, myTeam, rosterPositions: ['WR'], scoringSettings: {},
    careerStats: { 2025: {} }, defenceAllowed: null, playerMap: {}, schedule, seasonProjections: null,
  }
  const OFF = {
    plays: 60, passPlays: 35, proeXpassSum: 30, proePlays: 60, neutralSeconds: 1800, neutralGaps: 60,
    successes: 25, successPlays: 60, rzTdTrips: 2, rzTrips: 3, epaSum: 6, epaPlays: 60,
    passEpaSum: 4, passEpaPlays: 35, rushEpaSum: 2, rushEpaPlays: 25, pointsScored: 24,
  }
  const teams = { DAL: { games: [{ week: 1, seasonType: 'REG', off: OFF, def: { epaSum: -3, epaPlays: 60, pointsAllowed: 17 } }] } }

  it('spread is read from the current week (home favoured by 3 -> -3); team metrics need a complete load', async () => {
    expect(schedule.games[1].homeTeam).toBe('DAL')
    expect(schedule.games[1].spreadLine).toBe(3)
    const mock = { teams, year: 2026, complete: false, rowCount: 5 }
    expect(buildTeamMetricsTable(mock).DAL.pace).not.toBeNull()
    const { result } = renderHook(() => useWeeklyDecision({ ...args, liveTeamContext: mock }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.matchupCols.w1.spread).toBe(-3)
    expect(result.current.matchupCols.w1.implied).toBe(24)
    expect(result.current.matchupCols.w1.pace).toBeNull() // incomplete load is ignored
  })

  it('a complete team-context load fills PACE', async () => {
    const { result } = renderHook(() => useWeeklyDecision({ ...args, liveTeamContext: { teams, year: 2026, complete: true, rowCount: 100 } }))
    await waitFor(() => expect(result.current.matchupCols.w1.pace).not.toBeNull())
    expect(result.current.matchupCols.w1.pace.of).toBe(1)
    expect(result.current.matchupCols.w1.pace.value).toBe(30)
    expect(result.current.matchupCols.w1.proe.value).toBeCloseTo(35 / 60 - 30 / 60, 9)
  })

  it('M2a T11 the hook no longer returns or loads team context', async () => {
    const { result } = renderHook(() => useWeeklyDecision(args))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect('liveTeamContext' in result.current).toBe(false)
  })
})

// week-lineup-readability-c.md §3 — the usage colour pool is fed by league starters.
describe('usage colour pool', () => {
  const ids = ['w1', ...Array.from({ length: 15 }, (_, i) => `x${i + 1}`)]
  const rowsFor = () => ({
    TEAM_DAL: { stats: { pass_att: 30, rush_att: 20 } },
    ...Object.fromEntries(ids.map((id, i) => [id, {
      team: 'DAL', stats: { gp: 1, rec_tgt: i + 1, rec: 1, tm_off_snp: 60, off_snp: 40 },
    }])),
  })
  const args = {
    season: 2026, currentWeek: 4,
    myTeam: {
      starterSlots: ['w1'], starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }],
      bench: [], taxi: [],
    },
    rosterPositions: ['WR'], scoringSettings: {}, careerStats: { 2025: {} }, defenceAllowed: null,
    playerMap: Object.fromEntries(ids.map(id => [id, { position: 'WR' }])),
  }
  const render = async extra => {
    getWeeklyStatRows.mockImplementation((s, w) => Promise.resolve(w <= 3 ? rowsFor() : {}))
    // Stable identities across renders, as App.jsx passes them.
    const props = { ...args, ...extra }
    const hook = renderHook(() => useWeeklyDecision(props))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    return hook.result
  }
  afterEach(() => getWeeklyStatRows.mockImplementation(() => Promise.resolve({})))

  it('H1 with no starter weeks nothing is coloured', async () => {
    const result = await render({})
    const pct = result.current.usagePctByPlayer.w1
    expect(Object.keys(pct).length).toBeGreaterThan(0)
    expect(Object.values(pct).every(v => v === null)).toBe(true)
  })

  it('H2 starter weeks feed the pool', async () => {
    const result = await render({ starterWeeks: [{ week: 1, ids }] })
    const { target, rush } = result.current.usagePctByPlayer.w1
    expect(typeof target).toBe('number')
    expect(target).toBeGreaterThanOrEqual(0)
    expect(target).toBeLessThanOrEqual(1)
    expect(rush).toBeNull()
  })

  it('H3 the current week is excluded from pool and row', async () => {
    getWeeklyStatRows.mockImplementation((s, w) => {
      if (w === 4) {
        return Promise.resolve({
          TEAM_DAL: { stats: { pass_att: 300 } },
          ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`x${i + 1}`, {
            team: 'DAL', stats: { gp: 1, rec_tgt: 0, rec: 0 },
          }])),
        })
      }
      return Promise.resolve(w <= 3 ? rowsFor() : {})
    })
    const props = { ...args, starterWeeks: [{ week: 1, ids }] }
    const hook = renderHook(() => useWeeklyDecision(props))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.usagePctByPlayer.w1.target).toBeCloseTo(0.5 / 16, 6)
  })
})
