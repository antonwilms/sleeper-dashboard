// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { Portfolio } from './Portfolio'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// myteam-m2b-defences-ahead.md §5 — Fixture F's schedules/defenceAllowed through the real Portfolio.
const baseRow = overrides => ({
  player_id: 'x', position: 'WR', full_name: 'X Player', age: null, years_exp: null, nfl_team: null,
  ownerTeamName: null, ktcValue: null, projectedPPG: null, ...overrides,
})
const g = (week, home, away, homeScore = null, awayScore = null) => ({
  gameType: 'REG', week, homeTeam: home, awayTeam: away, homeScore, awayScore,
})
const nflScheduleByYear = {
  2026: {
    complete: true,
    games: [
      g(1, 'GB', 'MIN', 20, 17), g(1, 'DET', 'CHI', 24, 20), g(1, 'LA', 'SEA', 21, 14),
      g(2, 'DET', 'GB', 24, 10), g(2, 'CHI', 'LA', 13, 10),
      g(3, 'GB', 'CHI', 21, 14), g(3, 'DET', 'LA', 27, 20),
      g(4, 'DET', 'GB'), g(4, 'LA', 'CHI'),
      g(5, 'CHI', 'DET'), g(5, 'LA', 'GB'),
      g(6, 'LA', 'CHI'), g(6, 'GB', 'MIN'),
    ],
  },
  2025: { complete: true, games: [g(4, 'DET', 'MIN', 20, 17), g(1, 'GB', 'MIN', 30, 10)] },
}
const defenceAllowed = {
  prior: {
    season: 2025, failedWeeks: [],
    teams: {
      GB: { gp: 17, pts: { qb: 0, rb: 340, wr: 306, te: 0 }, passYd: 4080, rushYd: 1700 },
      CHI: { gp: 17, pts: { qb: 0, rb: 170, wr: 272, te: 0 }, passYd: 3400, rushYd: 1360 },
    },
  },
  current: {
    season: 2026, failedWeeks: [2],
    teams: { GB: { gp: 3, pts: { qb: 0, rb: 90, wr: 72, te: 0 }, passYd: 600, rushYd: 270 } },
  },
}

const spec = {
  rb1: { position: 'RB', team: 'DET', proj: 14, name: 'Rex Back' },
  wl1: { position: 'WR', team: 'LAR', proj: 15, name: 'Wes Rams' },
  wb1: { position: 'WR', team: 'DET', proj: 5, name: 'Ben Bench' },
}
const ids = Object.keys(spec)
const entry = id => ({ id, slot: 'Bench', full_name: spec[id].name, position: spec[id].position, team: spec[id].team, age: 25 })
const playerRows = ids.map(id => baseRow({
  player_id: id, position: spec[id].position, full_name: spec[id].name, nfl_team: spec[id].team,
  ownerTeamName: 'My Team', projectedPPG: spec[id].proj,
}))
// Sleeper's SET lineup is [wb1]; the best-by-projection Starting ten is rb1 + wl1.
const rosterTeams = [{
  rosterId: 1, teamName: 'My Team', reserve: [],
  starters: [{ ...entry('wb1'), slot: 'WR' }],
  bench: [entry('rb1'), entry('wl1')],
}]
const seasonProjections = Object.fromEntries(ids.map(id => [id, { projectedPPG: spec[id].proj }]))
const playerMap = Object.fromEntries(ids.map(id => [id, { position: spec[id].position, full_name: spec[id].name }]))
const REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }

// Slice D's team-context shape: a two-game 2026 file for DET / LA / CHI.
const tcGame = (scored, allowed, passPlays) => ({
  week: 1, seasonType: 'REG', opponent: 'X',
  off: { plays: 60, passPlays, proePlays: 60, proeXpassSum: 30, pointsScored: scored, rzTrips: 3, epaSum: 6, epaPlays: 60, neutralSeconds: 700, neutralGaps: 20 },
  def: { epaSum: -3, epaPlays: 60, pointsAllowed: allowed },
})
const tc2026 = {
  complete: true,
  teams: {
    DET: { games: [tcGame(30, 20, 20), tcGame(30, 20, 20)] },
    LA: { games: [tcGame(14, 24, 40), tcGame(14, 24, 40)] },
    CHI: { games: [tcGame(20, 20, 30), tcGame(20, 20, 30)] },
  },
}

const base = {
  playerRows, rosterTeams, seasonProjections, myTeamName: 'My Team', careerStats: { 2025: {} }, playerMap,
  rosterPositions: ['RB', 'WR', 'BN'], nflScheduleByYear, defenceAllowed,
}
const inSeason = { ...base, nflState: REG_WK4 }
const TOP = ['starting-ten', 'league-ladders', 'weakest-slots', 'team-offences', 'defences-ahead', 'bench', 'bench-picks']
const topLevel = () => [...document.querySelectorAll('[data-testid]')]
  .map(e => e.dataset.testid).filter(t => TOP.includes(t))

describe('Portfolio — Defences ahead (M2b)', () => {
  it('P1 rows are the Starting ten in slot order, not Sleeper\'s set lineup', () => {
    render(<Portfolio {...inSeason} />)
    const rows = [...screen.getByTestId('defences-ahead').querySelectorAll('[data-testid^="ahead-row-"]')].map(r => r.dataset.testid)
    expect(rows).toEqual(['ahead-row-rb1', 'ahead-row-wl1'])
    expect(screen.queryByTestId('ahead-row-wb1')).not.toBeInTheDocument()
  })

  it('P2 this week reads the live season, not last season\'s week-4 opponent', () => {
    render(<Portfolio {...inSeason} />)
    expect(screen.getByTestId('ahead-row-rb1').querySelector('[data-testid="ahead-vs"]').textContent).toBe('GB')
  })

  it('P3 remaining weeks: live season, played weeks excluded, bye shown', () => {
    render(<Portfolio {...inSeason} />)
    for (let w = 5; w <= 18; w++) expect(screen.getByTestId(`ahead-wk-head-${w}`)).toBeInTheDocument()
    for (let w = 1; w <= 4; w++) expect(screen.queryByTestId(`ahead-wk-head-${w}`)).not.toBeInTheDocument()
    const sched = screen.getByTestId('ahead-sched-rb1')
    expect(sched.querySelector('[data-testid="ahead-wk-5"]').textContent).toContain('CHI')
    expect(sched.querySelector('[data-testid="ahead-wk-6"]').textContent).toBe('BYE')
  })

  it('P4 sits directly after the offences table, before Bench; renders without the offences table', () => {
    render(<Portfolio {...inSeason} teamContextByYear={{ 2026: tc2026 }} />)
    const order = topLevel()
    expect(order.indexOf('team-offences')).toBeGreaterThan(-1)
    expect(order[order.indexOf('team-offences') + 1]).toBe('defences-ahead')
    expect(order[order.indexOf('defences-ahead') + 1]).toBe('bench')
    cleanup()
    render(<Portfolio {...inSeason} />)
    expect(screen.queryByTestId('team-offences')).not.toBeInTheDocument()
    expect(screen.getByTestId('defences-ahead')).toBeInTheDocument()
  })

  it('P5 every old Defences-you-face metric renders on My Team', () => {
    render(<Portfolio {...inSeason} />)
    const row = screen.getByTestId('ahead-row-rb1')
    const q = id => row.querySelector(`[data-testid="${id}"]`)
    expect(q('ahead-prior').textContent).toBe('20.0')
    expect(q('ahead-current').textContent).toBe('30.0')
    expect(q('ahead-blended').textContent).toContain('25.0')
    expect(q('ahead-blended').textContent).toContain('50%')
    expect(q('ahead-rank').textContent).toBe('2 of 32')
    expect([...q('ahead-pass').children].map(c => c.textContent)).toEqual(['200', '2025 · 240'])
    expect([...q('ahead-rush').children].map(c => c.textContent)).toEqual(['90', '2025 · 100'])
    expect([...q('ahead-record').children].map(c => c.textContent)).toEqual(['2-1', '2025 · 1-0'])
    const lines = screen.getAllByTestId('ahead-failed-weeks').map(n => n.textContent)
    expect(lines).toEqual(['Week 2 of 2026 failed to load from Sleeper and is left out of these figures.'])
  })

  it('P6 out of season: no card, and the surrounding sections are exactly as before', () => {
    // Recorded from this same render BEFORE any M2b edit (no defences-ahead existed then).
    const BEFORE = ['starting-ten', 'league-ladders', 'weakest-slots', 'team-offences', 'bench']
    for (const nflState of [{ season: '2026', season_type: 'pre' }, { season: '2026', season_type: 'post', week: 1 }]) {
      render(<Portfolio {...base} teamContextByYear={{ 2025: tc2026, 2026: tc2026 }} nflState={nflState} />)
      expect(screen.queryByTestId('defences-ahead')).not.toBeInTheDocument()
      expect(topLevel()).toEqual(BEFORE)
      cleanup()
    }
  })

  it('P7 week 1 still shows it (gated on phase and week, not the week-2 layout switch)', () => {
    render(<Portfolio {...base} nflState={{ ...REG_WK4, week: 1 }} />)
    expect(screen.getByTestId('defences-ahead')).toBeInTheDocument()
    expect(screen.getByTestId('ahead-row-rb1').querySelector('[data-testid="ahead-vs"]').textContent).toBe('CHI')
  })
})
