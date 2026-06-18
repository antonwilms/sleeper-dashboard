// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LeagueView } from './LeagueView'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const FIXTURE_LEAGUE_DATA = {
  standings: [
    {
      rosterId: 1, rank: 1, teamName: 'Fixture Team', managerName: 'Fix Manager',
      wins: 5, losses: 3, ties: 0, pointsFor: 800.50, pointsAgainst: 750.20,
    },
  ],
  weeklyScores: {
    1: [{ week: 1, points: 100.5, opponentRosterId: 2, won: true }],
  },
  weeks: [1, 2, 3],
  rosterTeams: [
    {
      rosterId: 1, ownerId: 'u1', rank: 1, teamName: 'Fixture Team', managerName: 'Fix Manager',
      starters: [{ id: 'p1', slot: 'Starter', full_name: 'Fixture Player', position: 'QB', team: 'KC', age: 28 }],
      bench: [],
      reserve: [],
    },
  ],
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/league/:view" element={<LeagueView leagueData={FIXTURE_LEAGUE_DATA} />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LeagueView sub-view switching', () => {
  it('/league/standings renders the standings table', () => {
    renderAt('/league/standings')
    expect(screen.getByText('Fixture Team')).toBeInTheDocument()
    expect(screen.getByText('Fix Manager')).toBeInTheDocument()
    // Column headers from StandingsTable
    expect(screen.getByText('PF')).toBeInTheDocument()
  })

  it('/league/schedule renders the schedule grid', () => {
    renderAt('/league/schedule')
    // ScheduleGrid shows week labels
    expect(screen.getByText('Wk 1')).toBeInTheDocument()
    expect(screen.getByText('Wk 2')).toBeInTheDocument()
  })

  it('/league/rosters renders the rosters view', () => {
    renderAt('/league/rosters')
    expect(screen.getByText('Fixture Player')).toBeInTheDocument()
  })

  it('unknown :view falls back to standings', () => {
    renderAt('/league/unknown-view')
    expect(screen.getByText('Fixture Team')).toBeInTheDocument()
    expect(screen.getByText('PF')).toBeInTheDocument()
  })
})
