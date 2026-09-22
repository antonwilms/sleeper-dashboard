import { describe, it, expect } from 'vitest'
import { buildSeasonGrid } from './weeklySeasonGrid'
import { buildRegWeekIndex } from './weeklySchedule'

function game(week, homeTeam, awayTeam, { gameType = 'REG', homeScore = null, awayScore = null } = {}) {
  return { week, gameType, homeTeam, awayTeam, homeScore, awayScore }
}

function statsRow({ team, gp = 1, pass_yd = 0 } = {}) {
  return { stats: { gp, pass_yd }, team }
}

const SCORING = { pass_yd: 0.04 }

function weekMap(week, rows) {
  return { week, rows }
}

function cellFor(grid, groupKey, playerId, week) {
  const group = grid.find(g => g.key === groupKey)
  const row = group.rows.find(r => r.id === playerId)
  return row.cells.find(c => c.week === week)
}

describe('buildSeasonGrid — kinds', () => {
  const currentWeek = 3
  const schedule = buildRegWeekIndex({
    games: [
      game(1, 'KC', 'DEN'),
      game(2, 'KC', 'DEN'),
      game(3, 'KC', 'DEN'),
      game(4, 'KC', 'DEN'),
      // BUF is on a bye in week 4 (no game listed for BUF in week 4)
      game(4, 'MIA', 'NYJ'),
    ],
  })

  it('played: week < currentWeek, gp === 1 -> filled cell with scored points', () => {
    const weeklyMaps = [weekMap(1, { p1: statsRow({ team: 'KC', pass_yd: 250 }) })]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 1)
    expect(cell.kind).toBe('played')
    expect(cell.points).toBeCloseTo(10)
  })

  it('bye: resolveTeamWeek -> bye, dashed, no number', () => {
    const weeklyMaps = []
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'BUF' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek: 5 })
    const cell = cellFor(grid, 'starters', 'p1', 4)
    expect(cell.kind).toBe('bye')
    expect(cell.points).toBeNull()
  })

  it('projected: week === currentWeek, not a bye -> the W1 projection', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const projections = { p1: { stats: { pass_yd: 300 }, opponent: 'DEN' } }
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 3)
    expect(cell.kind).toBe('projected')
    expect(cell.points).toBeCloseTo(12)
  })

  it('projected with no scoreable projection renders an empty outlined cell, not 0', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const projections = { p1: { stats: { adp_dd_ppr: 12 }, opponent: 'DEN' } }
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 3)
    expect(cell.kind).toBe('projected')
    expect(cell.points).toBeNull()
  })

  it('dnp: week < currentWeek, resolveTeamWeek -> game, no gp===1 row', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 1)
    expect(cell.kind).toBe('dnp')
  })

  it('future: week > currentWeek, not a bye -> empty outlined cell', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 4)
    expect(cell.kind).toBe('future')
    expect(cell.points).toBeNull()
  })

  it('unknown: past week, no row, schedule null. Neither bye nor dnp', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: null, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 1)
    expect(cell.kind).toBe('unknown')
    expect(cell.kind).not.toBe('bye')
    expect(cell.kind).not.toBe('dnp')
  })

  it('a scored 0 is played with points: 0, not bye and not dnp', () => {
    const weeklyMaps = [weekMap(1, { p1: statsRow({ team: 'KC', pass_yd: 0 }) })]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 1)
    expect(cell.kind).toBe('played')
    expect(cell.points).toBe(0)
  })

  it('a future bye week renders bye (schedule-derived)', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'BUF' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 4)
    expect(cell.kind).toBe('bye')
  })

  it('a team with a schedule game but no player row in a past week -> dnp', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const weeklyMaps = [weekMap(1, {})]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    const cell = cellFor(grid, 'starters', 'p1', 1)
    expect(cell.kind).toBe('dnp')
  })
})

describe('buildSeasonGrid — carry-forward team resolution', () => {
  const currentWeek = 4
  // KC is on a bye in week 3; DEN plays every week — two DIFFERENT bye weeks so a wrong team
  // resolution is visible in the cell kind, not just in an unused intermediate value.
  const schedule = buildRegWeekIndex({
    games: [
      game(1, 'KC', 'MIA'),
      game(2, 'KC', 'MIA'),
      // week 3: KC has no game (bye); DEN plays
      game(3, 'DEN', 'NYJ'),
      game(4, 'KC', 'DEN'),
    ],
  })

  it('preceding week is preferred over following when both carry a resolvable team', () => {
    // Week 2 (own row missing team) should carry forward from week 1 (KC), not from week 3 (DEN).
    const weeklyMaps = [
      weekMap(1, { p1: statsRow({ team: 'KC', gp: 1 }) }),
      weekMap(2, { p1: { stats: { gp: 0 }, team: null } }),
      weekMap(3, { p1: statsRow({ team: 'DEN', gp: 1 }) }),
    ]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'DEN' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    // Week 2: KC has a game (vs MIA) — if resolution used week 1 (KC) correctly, this is 'dnp'
    // (no gp===1 row that week). If it wrongly carried forward from week 3 (DEN, which has no
    // game in week 2) it would misread as neither KC's nor DEN's true week-2 status by accident of
    // this fixture, so we assert dnp directly against KC's real week-2 schedule (a game).
    expect(cellFor(grid, 'starters', 'p1', 2).kind).toBe('dnp')
  })

  it('roster team is the last resort when no fetched week resolves a team at all', () => {
    const weeklyMaps = [weekMap(1, {})]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    // Week 1: KC plays MIA -> dnp (proves the roster-team fallback resolved KC, not an unresolved team)
    expect(cellFor(grid, 'starters', 'p1', 1).kind).toBe('dnp')
  })

  it('a player who changed teams mid-window resolves per week from rows[playerId].team, with different byes', () => {
    // p1 played for KC in week 1 (KC has a game) then traded to DEN, playing for DEN in week 3.
    // DEN has a game in week 3; KC has a BYE in week 3. A player.team-only implementation (always
    // DEN, his CURRENT team) would read week 1 as DEN's status instead of KC's true game.
    const weeklyMaps = [
      weekMap(1, { p1: statsRow({ team: 'KC', gp: 0 }) }),
      weekMap(3, { p1: statsRow({ team: 'DEN', gp: 0 }) }),
    ]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'DEN' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    // Week 1: correctly resolves KC (own row) -> KC plays MIA that week -> dnp.
    expect(cellFor(grid, 'starters', 'p1', 1).kind).toBe('dnp')
    // Week 3: resolves DEN (own row) -> DEN plays NYJ that week -> dnp, not bye (KC's week-3 bye
    // would wrongly apply under a player.team-only / single-team-across-the-window resolution).
    expect(cellFor(grid, 'starters', 'p1', 3).kind).toBe('dnp')
  })
})

describe('buildSeasonGrid — failedWeeks', () => {
  const currentWeek = 3
  const schedule = buildRegWeekIndex({ games: [game(1, 'KC', 'DEN'), game(2, 'KC', 'DEN'), game(3, 'KC', 'DEN')] })

  it('a failed week (in failedWeeks, absent from weeklyMaps) -> unknown, not dnp', () => {
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [1], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    expect(cellFor(grid, 'starters', 'p1', 1).kind).toBe('unknown')
  })

  it('a gap in weeklyMaps (week 2 failed): week 3\'s team is still read from week 3\'s own entry', () => {
    // If week 2 were skipped (failed) and the implementation indexed weeklyMaps[w] instead of
    // looking week numbers up by key, week-3's entry (array index 1, since week 2 is absent) would
    // be misread as week 2's. Assert week 3 resolves its OWN row's team (BUF), not week 1's (KC).
    const weeklyMaps = [
      weekMap(1, { p1: statsRow({ team: 'KC', gp: 1 }) }),
      weekMap(3, { p1: statsRow({ team: 'BUF', gp: 1, pass_yd: 111 }) }),
    ]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'BUF' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [2], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek: 4 })
    const week2 = cellFor(grid, 'starters', 'p1', 2)
    const week3 = cellFor(grid, 'starters', 'p1', 3)
    expect(week2.kind).toBe('unknown')
    expect(week3.kind).toBe('played')
    expect(week3.points).toBeCloseTo(111 * 0.04)
  })
})

describe('buildSeasonGrid — agreement with W2a\'s lineup for the current week', () => {
  it('a player whose current-week team is on a bye reads bye — the same resolveTeamWeek call W2a\'s row uses', () => {
    const currentWeek = 2
    const schedule = buildRegWeekIndex({ games: [game(1, 'KC', 'DEN'), game(2, 'MIA', 'NYJ')] })
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    expect(cellFor(grid, 'starters', 'p1', 2).kind).toBe('bye')
  })
})

// Fix pass 1, item 1.3 — §3's current-week rule had no test pinning the `week >= currentWeek`
// short-circuit to the ROSTER team over the week's own row team.
describe('buildSeasonGrid — current-week team resolution uses the roster team', () => {
  it('a current-week row whose own team differs from the roster team still follows the roster team', () => {
    const currentWeek = 2
    // KC plays DEN in week 2 (a game); BUF has no game in week 2 (a bye) — different statuses so
    // a wrong resolution is visible in the cell kind.
    const schedule = buildRegWeekIndex({ games: [game(1, 'KC', 'DEN'), game(2, 'KC', 'DEN')] })
    // The player's current-week row (e.g. a stale/mid-trade fetch) carries team BUF, but his
    // roster team (W2a's own current-week source) is KC.
    const weeklyMaps = [weekMap(2, { p1: { stats: { gp: 0 }, team: 'BUF' } })]
    const groups = [{ key: 'starters', players: [{ id: 'p1', name: 'P1', team: 'KC' }] }]
    const grid = buildSeasonGrid({ groups, weeklyMaps, failedWeeks: [], scheduleIndex: schedule, projections: {}, scoringSettings: SCORING, currentWeek })
    // KC plays week 2 -> not a bye -> 'projected'. Only a BUF (bye-week) resolution would read 'bye'.
    expect(cellFor(grid, 'starters', 'p1', 2).kind).toBe('projected')
  })
})

describe('buildSeasonGrid — group assembly is the caller\'s job', () => {
  it('passes rows through untouched per group, in the order given', () => {
    const groups = [
      { key: 'starters', players: [{ id: 'a', name: 'A', team: 'KC' }] },
      { key: 'bench', players: [{ id: 'b', name: 'B', team: 'DEN' }] },
      { key: 'ir', players: [{ id: 'c', name: 'C', team: 'MIA' }] },
    ]
    const grid = buildSeasonGrid({ groups, weeklyMaps: [], failedWeeks: [], scheduleIndex: null, projections: {}, scoringSettings: SCORING, currentWeek: 1 })
    expect(grid.map(g => g.key)).toEqual(['starters', 'bench', 'ir'])
    expect(grid[0].rows[0].id).toBe('a')
    expect(grid[1].rows[0].id).toBe('b')
    expect(grid[2].rows[0].id).toBe('c')
    expect(grid[0].rows[0].cells).toHaveLength(18)
  })
})
