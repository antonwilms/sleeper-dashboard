// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'

const STUB = {
  weights: [], lineup: { starters: [], bench: [] }, n: 0, scheduleIndex: null, loading: false, error: null,
  failedWeeks: [], weeklyMaps: [], projections: {}, priorAllowed: null, currentAllowed: null,
  priorSeason: 2025, currentSeason: 2026, priorSnapByPlayer: {}, dataSeason: 2025, priorRecords: {},
  currentRecords: {}, defenceFailedWeeks: [], liveTeamContext: { teams: {}, year: null, complete: false, rowCount: 0 },
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
