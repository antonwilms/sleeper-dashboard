// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, screen } from '@testing-library/react'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'

const STUB = {
  weights: [], lineup: { starters: [], bench: [] }, n: 0, scheduleIndex: null, loading: false, error: null,
  failedWeeks: [], weeklyMaps: [], projections: {}, priorAllowed: null, currentAllowed: null,
  priorSeason: 2025, currentSeason: 2026, priorSnapByPlayer: {}, dataSeason: 2025, priorRecords: {},
  currentRecords: {}, defenceFailedWeeks: [],
  projectionGap: null, ownByPlayer: {},
  matchup: {
    week: 9, status: 'ready', reason: 'no-matchup', opponent: null, live: false, projMargin: null,
    mine: { rosterId: 3, teamName: 'Me', record: null, proj: { total: null, valued: 0, slots: 0 }, ours: { total: null, valued: 0, slots: 0 }, points: null },
  },
  startSit: { flags: [], uncheckedSlots: [], basisAvailable: false },
}
const { useWeeklyDecision } = vi.hoisted(() => ({ useWeeklyDecision: vi.fn() }))
vi.mock('../../hooks/useWeeklyDecision', () => ({ useWeeklyDecision }))
import { WeekView } from './WeekView'

expect.extend(jestDomMatchers)
afterEach(() => { cleanup(); vi.clearAllMocks() })

const rosterTeams = [{ rosterId: 3, teamName: 'Me', starters: [], starterSlots: [], bench: [], reserve: [], taxi: [] }]
const standings = [{ rosterId: 3, wins: 7, losses: 4, ties: 0 }]

describe('WeekView wiring (week-w-matchup-flags-visuals.md)', () => {
  it('T18 passes the league inputs to the hook and lays out the card', () => {
    useWeeklyDecision.mockReturnValue(STUB)
    render(
      <MemoryRouter>
        <WeekView leagueId="L1" rosterTeams={rosterTeams} standings={standings} myTeamName="Me" nflState={{ season: '2026', week: 9 }} />
      </MemoryRouter>
    )
    const arg = useWeeklyDecision.mock.calls[0][0]
    expect(arg.leagueId).toBe('L1')
    expect(arg.rosterTeams).toBe(rosterTeams)
    expect(arg.standings).toBe(standings)
    expect(arg.myTeam.rosterId).toBe(3)
    const legend = screen.getByTestId('lineup-legend')
    expect(screen.getByTestId('matchup-header')).toBeInTheDocument()
    expect(legend).not.toContainElement(screen.getByTestId('matchup-header'))
    expect(legend).toContainElement(screen.getByText(/HOW MUCH OF THIS IS/i))
  })

  it('T19 App.jsx passes leagueId and standings to <WeekView>', () => {
    const src = readFileSync('src/App.jsx', 'utf8')
    const el = src.match(/<WeekView[\s\S]*?\/>/)[0]
    expect(el).toMatch(/leagueId=\{selectedLeague\?\.league_id/)
    expect(el).toMatch(/standings=\{leagueData\.standings\}/)
  })
})

describe('WeekView — header order and OURS pending (T15b)', () => {
  const stubWithStarter = {
    ...STUB,
    lineup: {
      starters: [{
        slot: 'WR', player_id: 'p1', name: 'P One', position: 'WR', team: 'KC', opponent: 'DEN', opponentEra: 'DEN', bye: false,
        allows: null, allowsRank: null, weight: null, usage: null, points: 10, counts: null, ranks: null, depth: null, backup: false,
      }],
      bench: [],
    },
    matchupCols: {},
  }
  const mount = seasonProjections => render(
    <MemoryRouter>
      <WeekView leagueId="L1" rosterTeams={rosterTeams} standings={standings} myTeamName="Me" nflState={{ season: '2026', week: 9 }} seasonProjections={seasonProjections} />
    </MemoryRouter>
  )

  it('the matchup header card precedes the lineup table', () => {
    useWeeklyDecision.mockReturnValue(stubWithStarter)
    mount({})
    expect(stubWithStarter.lineup.starters.some(r => r.player_id != null)).toBe(true)
    const header = screen.getByTestId('matchup-header')
    const table = screen.getByTestId('frozen-scroll')
    expect(header.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('null seasonProjections marks the lineup OURS pending; a map does not', () => {
    useWeeklyDecision.mockReturnValue(stubWithStarter)
    const a = mount(null)
    expect(a.container.querySelectorAll('[data-testid="ours-pending"]')).toHaveLength(1)
    expect(screen.getByTestId('matchup-ours-pending')).toBeInTheDocument()
    a.unmount()
    const b = mount({})
    expect(b.container.querySelectorAll('[data-testid="ours-pending"]')).toHaveLength(0)
    expect(screen.queryByTestId('matchup-ours-pending')).toBeNull()
  })
})

describe('WeekView — no Offences panel (M2a T8)', () => {
  const listSrc = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = `${dir}/${e.name}`
    if (e.isDirectory()) return listSrc(full)
    return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [full] : []
  })

  it('renders no "Offences you own" panel', () => {
    useWeeklyDecision.mockReturnValue(STUB)
    const { container } = render(
      <MemoryRouter>
        <WeekView leagueId="L1" rosterTeams={rosterTeams} standings={standings} myTeamName="Me" nflState={{ season: '2026', week: 9 }} />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('offences-owned')).toBeNull()
    expect(container.textContent).not.toContain('Offences you own')
  })

  it('the component file is gone and no non-test source names it', () => {
    expect(existsSync('src/components/week/OffencesOwned.jsx')).toBe(false)
    const holders = listSrc('src').filter(f => /\bOffencesOwned\b/.test(readFileSync(f, 'utf8')))
    expect(holders).toEqual([])
  })
})
