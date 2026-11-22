// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import { parseKtcPickRows } from '../../utils/ktcPicks'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// myteam-m3-visuals.md §5 — Fixture W through the real Portfolio.
const baseRow = overrides => ({
  player_id: 'x', position: 'WR', full_name: 'X Player', age: null, years_exp: null, nfl_team: null,
  ownerTeamName: null, ktcValue: null, projectedPPG: null, ...overrides,
})
const g = (week, home, away, homeScore = null, awayScore = null) => ({
  gameType: 'REG', week, homeTeam: home, awayTeam: away, homeScore, awayScore,
})
const NFL_WK4 = { season: '2026', season_type: 'regular', week: 4, season_start_date: '2026-09-09' }
const NFL_PRE = { season: '2026', season_type: 'pre', week: 4 }
const NFL_WK1 = { season: '2026', season_type: 'regular', week: 1, season_start_date: '2026-09-09' }

// w1 starts the one WR slot (18 > 8); b1 benches; Other Team's WR (25) beats w1 so a WR weak row renders.
const spec = {
  w1: { position: 'WR', team: 'DAL', proj: 18, name: 'Wes Wideout', owner: 'My Team' },
  r1: { position: 'RB', team: 'PHI', proj: 14, name: 'Rex Runner', owner: 'My Team' },
  b1: { position: 'WR', team: 'NYG', proj: 8, name: 'Ben Bench', owner: 'My Team' },
  o1: { position: 'WR', team: 'KC', proj: 25, name: 'Ollie One', owner: 'Other Team' },
  o2: { position: 'RB', team: 'KC', proj: 6, name: 'Ozzy Two', owner: 'Other Team' },
}
const ids = Object.keys(spec)
const entry = id => ({ id, slot: 'Bench', full_name: spec[id].name, position: spec[id].position, team: spec[id].team, age: 25 })
const playerRows = ids.map(id => baseRow({
  player_id: id, position: spec[id].position, full_name: spec[id].name, nfl_team: spec[id].team,
  ownerTeamName: spec[id].owner, projectedPPG: spec[id].proj,
}))
const rosterTeams = [
  { rosterId: 1, teamName: 'My Team', reserve: [], starters: [], bench: ['w1', 'r1', 'b1'].map(entry) },
  { rosterId: 2, teamName: 'Other Team', reserve: [], starters: [], bench: ['o1', 'o2'].map(entry) },
]
const seasonProjections = Object.fromEntries(ids.map(id => [id, { projectedPPG: spec[id].proj }]))
const playerMap = Object.fromEntries(ids.map(id => [id, { position: spec[id].position, full_name: spec[id].name }]))
const scoringSettings = { rec: 1, rec_yd: 0.1, rush_yd: 0.1 }

const W = {
  year: 2026, complete: true, failedWeeks: [3],
  weeks: [
    { week: 1, rows: {
      w1: { team: 'DAL', stats: { gp: 1, rec: 5, rec_yd: 50 } },
      r1: { team: 'PHI', stats: { gp: 1, rush_yd: 120 } },
      b1: { team: 'NYG', stats: { gp: 1, rec: 2, rec_yd: 20 } },
    } },
    { week: 2, rows: { r1: { team: 'PHI', stats: { gp: 1, rush_yd: 40 } } } },
  ],
}
const nflScheduleByYear = {
  2026: { complete: true, games: [g(1, 'DAL', 'NYG'), g(1, 'PHI', 'WAS'), g(2, 'NYG', 'PHI'), g(3, 'DAL', 'PHI'), g(3, 'NYG', 'WAS')] },
}
const B = {
  status: 'ready', needsPrior: false, liveSeason: 2026, priorSeason: 2025,
  basis: {
    WR: { values: Array.from({ length: 60 }, (_, i) => 30 + i), n: 60, season: 2026, source: 'live' },
    RB: { values: Array.from({ length: 60 }, () => 0.5), n: 60, season: 2026, source: 'live' },
    QB: null, TE: null,
  },
}
const status = (p, d, x) => [...Array(p).fill('P'), ...Array(d).fill('D'), ...Array(x).fill('X')]
const livePlayer = { gamesPlayed: 3, fantasyPoints: 30, team: 'DAL', weeklyStatus: [...status(3, 0, 0), ...status(0, 0, 15)], stats: {}, weeklyStats: {} }
const liveSeasonTotals = { season: 2026, complete: true, players: { w1: livePlayer, r1: { ...livePlayer, team: 'PHI' }, b1: { ...livePlayer, team: 'NYG' } } }
const prior = { fantasyPoints: 100, gamesPlayed: 15, stats: {}, weeklyStats: {} }
const careerStats = { 2025: {
  w1: { ...prior, weeklyStatus: [...status(15, 0, 0), ...status(0, 2, 0), 'X'] },
  r1: { ...prior, weeklyStatus: status(17, 0, 1) },
  b1: { ...prior, weeklyStatus: status(17, 0, 1) },
} }

const base = {
  playerRows, rosterTeams, seasonProjections, myTeamName: 'My Team', careerStats, playerMap,
  rosterPositions: ['QB', 'RB', 'WR', 'TE', 'BN'], scoringSettings, nflScheduleByYear,
  tradedPicks: [], ktcPickTable: parseKtcPickRows([{ name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 }]), firstLiveDraftSeason: 2027, draftRounds: 2,
  nflState: NFL_WK4, liveSeasonTotals, percentileBasis: B, liveWeeklyRows: W,
}

const tableRowFor = (tableId, playerName) => {
  const cell = [...screen.getByTestId(tableId).querySelectorAll('[data-testid="col-player"]')].find(c => c.textContent.includes(playerName))
  return cell?.closest('tr')
}
const gamesCell = (tableId, name) => tableRowFor(tableId, name).querySelector('[data-testid="col-games"]')
const slotsOf = el => [...el.querySelectorAll('[data-testid="strip-slot"]')]

describe('Portfolio — weekly strip (M3)', () => {
  it('M3 P1 every Starting ten and Bench player row carries the strip, in season', () => {
    render(<Portfolio {...base} />)
    for (const t of ['starting-ten', 'bench']) {
      const head = screen.getByTestId(t).querySelector('thead').textContent
      expect(head).toContain('2026 WEEKS')
      expect(head).not.toContain('GAMES 2026')
    }
    for (const [t, name] of [['starting-ten', 'Wes Wideout'], ['starting-ten', 'Rex Runner'], ['bench', 'Ben Bench']]) {
      expect(gamesCell(t, name).querySelectorAll('[data-testid="weekly-strip"]'), `${t} ${name}`).toHaveLength(1)
    }
    const w1 = slotsOf(gamesCell('starting-ten', 'Wes Wideout'))
    expect(w1.map(s => s.dataset.week)).toEqual(['1', '2', '3'])
    expect(w1.map(s => s.dataset.kind)).toEqual(['played', 'bye', 'unknown'])
    expect(w1.map(s => s.getAttribute('title'))).toEqual(['Wk 1 · 10.0 pts', 'Bye', 'Wk 3 · not loaded'])
    expect(w1.filter(s => s.dataset.last3 === 'true').map(s => s.dataset.week)).toEqual(['1'])
    const b1 = slotsOf(gamesCell('bench', 'Ben Bench'))
    expect(b1.find(s => s.dataset.week === '2').dataset.kind).toBe('dnp')
    expect(b1.find(s => s.dataset.week === '2').getAttribute('title')).toBe('Did not play')
    expect(screen.getByTestId('bench-picks').querySelector('[data-testid="weekly-strip"]')).toBeNull()
  })

  it("M3 P2 colour is App's basis, passed through", () => {
    render(<Portfolio {...base} />)
    expect(slotsOf(gamesCell('starting-ten', 'Wes Wideout'))[0].dataset.pct).toBe('0')
    expect(slotsOf(gamesCell('starting-ten', 'Rex Runner'))[0].dataset.pct).toBe('100')
  })

  it('M3 P4 the old live weeks display is gone — no duplicate weeks', () => {
    render(<Portfolio {...base} />)
    const cell = gamesCell('starting-ten', 'Wes Wideout')
    // case-sensitive: jsdom's [title^=] is not, and the strip's own titles read "Wk 1 · …"
    expect([...cell.querySelectorAll('[title]')].filter(e => e.getAttribute('title').startsWith('WK '))).toHaveLength(0)
    expect(cell.textContent).not.toContain('3/3')
    expect(cell.textContent).toContain('2025 15/17')
    const startHead = screen.getByTestId('starting-ten').textContent
    expect(startHead).toContain('did not play')
    expect(startHead).not.toContain('bye or no game')
    const legend = screen.getByTestId('starting-ten-legend').textContent
    expect(legend).toContain('2026 WEEKS has one bar per completed week')
    expect(legend).not.toContain('Dashed week is a bye')
  })

  it('M3 P5 no complete live weekly load → —, never red squares', () => {
    for (const rows of [null, { ...W, complete: false }]) {
      render(<Portfolio {...base} liveWeeklyRows={rows} />)
      const cell = gamesCell('starting-ten', 'Wes Wideout')
      expect(cell.querySelector('[data-testid="weekly-strip"]')).toBeNull()
      expect(cell.querySelector('[data-kind="dnp"]')).toBeNull()
      expect(cell.firstElementChild.firstElementChild.textContent).toBe('—')
      expect(cell.textContent).toContain('2025 15/17')
      cleanup()
    }
  })

  it('M3 P6 out of season My Team is unchanged', () => {
    render(<Portfolio {...base} nflState={NFL_PRE} />)
    expect(screen.queryByTestId('weekly-strip')).toBeNull()
    for (const t of ['starting-ten', 'bench']) {
      expect(screen.getByTestId(t).querySelector('thead').textContent).toContain('GAMES 2025')
    }
    expect([...gamesCell('starting-ten', 'Wes Wideout').querySelectorAll('[title]')].some(e => e.getAttribute('title').startsWith('WK 1 · Played'))).toBe(true)
    expect(screen.getByTestId('starting-ten').textContent).toContain('bye or no game')
    cleanup()
    render(<Portfolio {...base} nflState={NFL_WK1} />)
    for (const t of ['starting-ten', 'bench']) {
      const head = screen.getByTestId(t).querySelector('thead').textContent
      expect(head).toContain('GAMES 2025')
      expect(head).not.toContain('WEEKS')
    }
  })

  it('M3 D3 every My Team player row carries the shared PlayerCell and the phone cap', () => {
    render(<Portfolio {...base} />)
    for (const t of ['starting-ten', 'bench']) {
      const rows = [...screen.getByTestId(t).querySelectorAll('tbody tr')].filter(tr => tr.querySelector('[data-testid="col-player"]')?.textContent !== 'empty')
      expect(rows.length).toBeGreaterThan(0)
      for (const tr of rows) expect(tr.querySelectorAll('[data-testid="player-cell"]')).toHaveLength(1)
    }
    const defRows = [...screen.getByTestId('defences-ahead').querySelectorAll('tbody tr')]
    expect(defRows.length).toBeGreaterThan(0)
    for (const tr of defRows) expect(tr.querySelectorAll('[data-testid="player-cell"]')).toHaveLength(1)
    for (const t of ['starting-ten', 'bench', 'defences-ahead']) {
      for (const pc of screen.getByTestId(t).querySelectorAll('[data-testid="player-cell"]')) {
        expect(pc.classList.contains('max-w-[168px]'), `${t} cap`).toBe(true)
        expect(pc.querySelector('span.relative.shrink-0').className).toContain('hidden md:flex')
      }
    }
    const weak = [...screen.getByTestId('weakest-slots').querySelectorAll('[data-testid^="weak-row-"]')]
    expect(weak).toHaveLength(1)
    expect(weak[0].querySelectorAll('[data-testid="player-cell"]')).toHaveLength(1)
    expect(weak[0].querySelector('[data-testid="player-cell-team"]').textContent).toBe('DAL')
  })
})
