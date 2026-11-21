// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// myteam-m2a-offences.md T10 — the REAL hook, fed App's teamContextByYear through WeekView. The lineup's
// PACE/PROE must read the entry keyed by nflState.season (the live season), never dataSeason.
vi.mock('../../api/sleeperStats', () => ({
  getWeeklyStatRows: vi.fn(() => Promise.resolve({})),
  getWeeklyProjectionRows: vi.fn(() => Promise.resolve({})),
}))
vi.mock('../../api/sleeper', () => ({ getMatchups: vi.fn(() => Promise.resolve([])) }))
import { WeekView } from './WeekView'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const OFF = {
  plays: 60, passPlays: 35, proeXpassSum: 30, proePlays: 60, neutralSeconds: 1800, neutralGaps: 60,
  successes: 25, successPlays: 60, rzTdTrips: 2, rzTrips: 3, epaSum: 6, epaPlays: 60,
  passEpaSum: 4, passEpaPlays: 35, rushEpaSum: 2, rushEpaPlays: 25, pointsScored: 24,
}
const ctx = (passPlays, neutralSeconds) => ({
  teams: { DAL: { games: [{ week: 1, seasonType: 'REG', off: { ...OFF, passPlays, neutralSeconds, neutralGaps: 20 }, def: { epaSum: -3, epaPlays: 60, pointsAllowed: 17 } }] } },
  complete: true, rowCount: 100,
})
const tcByYear = { 2025: ctx(24, 800), 2026: ctx(35, 600) }

const view = teamContextByYear => (
  <MemoryRouter>
    <WeekView
      myTeamName="Me"
      rosterTeams={[{ rosterId: 3, teamName: 'Me', starterSlots: ['w1'], starters: [{ id: 'w1', position: 'WR', team: 'DAL', full_name: 'W One' }], bench: [], reserve: [], taxi: [] }]}
      rosterPositions={['WR']}
      careerStats={{ 2025: {} }}
      playerMap={{ w1: { position: 'WR', full_name: 'W One' } }}
      nflState={{ season: '2026', week: 4 }}
      teamContextByYear={teamContextByYear}
    />
  </MemoryRouter>
)

describe('WeekView — lineup PACE/PROE read App\'s live team context (M2a T10)', () => {
  it('keys the map by the live season, and a non-complete entry reads —', async () => {
    const { rerender } = render(view(tcByYear))
    await waitFor(() => expect(screen.getByTestId('col-pace').textContent).toContain('30.0s'))
    expect(screen.getByTestId('col-pace').textContent).not.toContain('40.0s')
    expect(screen.getByTestId('col-proe').textContent).toContain('+8.3%')
    expect(screen.getByTestId('col-proe').textContent).not.toContain('−10.0%')
    rerender(view({ ...tcByYear, 2026: { ...ctx(35, 600), complete: false } }))
    await waitFor(() => expect(screen.getByTestId('col-pace').textContent).toBe('—'))
    expect(screen.getByTestId('col-proe').textContent).toBe('—')
  })
})
