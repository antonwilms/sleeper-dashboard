// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { Teams } from './Teams'

expect.extend(jestDomMatchers)
afterEach(() => {
  cleanup()
  localStorage.removeItem('teams-sort')
})

// Era-accurate (teamContext) domain — 32 codes, including LA (not LAR, the Sleeper domain).
const TEAM_CODES = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS',
]

function week(overrides = {}) {
  return {
    week: 1, seasonType: 'REG', opponent: 'X',
    off: {
      plays: 60, passPlays: 30, rushPlays: 30,
      epaSum: 1, epaPlays: 60,
      passEpaSum: 1, passEpaPlays: 30,
      rushEpaSum: 0, rushEpaPlays: 30,
      successes: 24, successPlays: 60,
      proePlays: 60, proePassPlays: 30, proeXpassSum: 30,
      rzTrips: 2, rzTdTrips: 1,
      neutralSeconds: 700, neutralGaps: 20,
      pointsScored: 17,
      ...overrides.off,
    },
    def: { epaSum: -1, epaPlays: 60, ...overrides.def },
  }
}

// PROE increases with team index (0..31): proeXpassSum = 30 - i -> proe = i/60.
// DEF EPA increases with team index too: epaSum = i - 16 -> most negative (best defence) at i=0.
function buildTeamContext() {
  const teams = {}
  TEAM_CODES.forEach((code, i) => {
    teams[code] = {
      games: [week({
        off: { proeXpassSum: 30 - i },
        def: { epaSum: i - 16 },
      })],
    }
  })
  return { teams, year: 2025, complete: true, rowCount: 32 }
}

function baseRow(overrides) {
  return {
    player_id: overrides.player_id ?? 'x',
    position: 'WR',
    full_name: 'X Player',
    ownerTeamName: null,
    nfl_team: 'FA',
    ktcValue: null,
    ...overrides,
  }
}

function headerFor(label) {
  const needle = label.toLowerCase()
  return screen.getAllByRole('columnheader').find(th => th.textContent.toLowerCase().startsWith(needle))
}

function firstRowTeam() {
  return screen.getAllByRole('row')[1].querySelector('td').textContent
}

describe('Teams — loading vs degraded', () => {
  it('loaded=false renders the loading state, not a DegradedBlock', () => {
    render(<MemoryRouter><Teams loaded={false} careerStats={null} teamContextByYear={{}} /></MemoryRouter>)
    expect(screen.getByText(/loading in background/i)).toBeInTheDocument()
    expect(screen.queryByText(/NOT YET/i)).not.toBeInTheDocument()
  })

  it('loaded=true but the season is absent from teamContextByYear renders a DegradedBlock', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={{ 2025: {} }} teamContextByYear={{}} /></MemoryRouter>)
    expect(screen.getByText(/NOT YET/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('loaded=true but the season is incomplete renders a DegradedBlock, not an empty table', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={{ 2025: {} }} teamContextByYear={{ 2025: { teams: {}, complete: false } }} /></MemoryRouter>)
    expect(screen.getByText(/NOT YET/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('Teams — all 32 rows, sorting', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: buildTeamContext() }

  it('renders all 32 teams', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    for (const code of TEAM_CODES) {
      expect(screen.getByTestId(`row-${code}`)).toBeInTheDocument()
    }
  })

  it('default sort is PROE descending — highest-PROE team (WAS, i=31) first', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    expect(firstRowTeam()).toBe('WAS')
  })

  it('clicking PROE again toggles to ascending — lowest-PROE team (ARI, i=0) first', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    fireEvent.click(headerFor('Proe'))
    expect(firstRowTeam()).toBe('ARI')
  })

  it('OFF EPA/PL first click sorts descending', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    fireEvent.click(headerFor('Off epa/pl'))
    // epaSum is fixed (1) for every team here — a stable/equal sort still proves the CLICK worked
    // and didn't throw; the direction itself is asserted precisely on DEF EPA ALL below, which
    // varies per team.
    expect(headerFor('Off epa/pl').textContent).toContain('↓')
  })

  it('DEF EPA ALL first click sorts ASCENDING — best (most negative) defence first, not the worst', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    fireEvent.click(headerFor('Def epa all'))
    expect(headerFor('Def epa all').textContent).toContain('↑')
    expect(firstRowTeam()).toBe('ARI') // i=0, epaSum -16 -> most negative -> best defence
  })

  it('DEF EPA ALL colour is INVERTED vs OFF EPA/PL — negative renders blue (up), positive renders amber (down)', () => {
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} /></MemoryRouter>)
    // ARI (i=0): defEpaPerPlay negative (good defence) -> blue/up. offEpaPerPlay positive (1/60) -> blue/up too.
    expect(screen.getByTestId('defepa-ARI').className).toContain('text-dp-up-text')
    expect(screen.getByTestId('offepa-ARI').className).toContain('text-dp-up-text')
    // WAS (i=31): defEpaPerPlay positive (15/60, bad defence) -> amber/down, the INVERSE of OFF EPA/PL's rule.
    expect(screen.getByTestId('defepa-WAS').className).toContain('text-dp-down-text')
  })
})

describe('Teams — YOUR EXPOSURE', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: buildTeamContext() }

  it('a player whose nfl_team is LAR (Sleeper domain) counts toward the LA row (era-accurate domain) — CR-16', () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'Me', nfl_team: 'LAR', ktcValue: 1000 }),
    ]
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={playerRows} myTeamName="Me" /></MemoryRouter>)
    expect(screen.getByTestId('exposure-LA').textContent).toContain('1 player')
    expect(screen.getByTestId('exposure-LA').textContent).toContain('100.0%')
  })

  it('a team with no owned players renders "none" / "—", not 0 players / 0%', () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'Me', nfl_team: 'LA', ktcValue: 1000 }),
    ]
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={playerRows} myTeamName="Me" /></MemoryRouter>)
    const kcCell = screen.getByTestId('exposure-KC')
    expect(kcCell.textContent).toContain('none')
    expect(kcCell.textContent).toContain('—')
    expect(kcCell.textContent).not.toContain('0 players')
    expect(kcCell.textContent).not.toContain('0%')
  })

  it("'FA' players are in the value denominator but have no team bucket — shares are NOT rescaled to 100%", () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'Me', nfl_team: 'LA', ktcValue: 1000 }),
      baseRow({ player_id: 'p2', ownerTeamName: 'Me', nfl_team: 'FA', ktcValue: 1000 }),
    ]
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={playerRows} myTeamName="Me" /></MemoryRouter>)
    // denom = 2000 (both players' value); LA gets only its own 1000 -> 50%, not rescaled to 100%.
    expect(screen.getByTestId('exposure-LA').textContent).toContain('50.0%')
  })

  it('a null ktcValue is skipped in both numerator and denominator, not treated as zero', () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'Me', nfl_team: 'LA', ktcValue: 1000 }),
      baseRow({ player_id: 'p2', ownerTeamName: 'Me', nfl_team: 'KC', ktcValue: null }),
    ]
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={playerRows} myTeamName="Me" /></MemoryRouter>)
    // denom counts only p1's 1000 (p2's null is skipped, not zeroed) -> LA share is 100%, not 50%.
    expect(screen.getByTestId('exposure-LA').textContent).toContain('100.0%')
    // KC still shows its 1 player (count is independent of ktcValue), with a — share.
    expect(screen.getByTestId('exposure-KC').textContent).toContain('1 player')
    expect(screen.getByTestId('exposure-KC').textContent).toContain('—')
  })

  it('myTeamName null renders "—" throughout the whole column, not zeros or "none"', () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'Someone Else', nfl_team: 'LA', ktcValue: 1000 }),
    ]
    render(<MemoryRouter><Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={playerRows} myTeamName={null} /></MemoryRouter>)
    expect(screen.getByTestId('exposure-LA').textContent.trim()).toBe('—')
    expect(screen.getByTestId('exposure-KC').textContent.trim()).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// dp-v2 Slice 7 §8 — routing carry-over fix: useNavigate(), not window.location.hash.
// The 14 renders above only prove Teams mounts inside a Router without crashing; these prove a
// row click/keypress actually lands on /teams/:abbr, via the router (not a bare hash write it
// can't see).
// ---------------------------------------------------------------------------
describe('Teams — row navigation (dp-v2 Slice 7 §8)', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: buildTeamContext() }

  function TeamDetailStub() {
    const { abbr } = useParams()
    return <div>team-detail-for-{abbr}</div>
  }

  function renderWithRoutes() {
    return render(
      <MemoryRouter initialEntries={['/teams']}>
        <Routes>
          <Route path="/teams" element={
            <Teams loaded={true} careerStats={careerStats} teamContextByYear={teamContextByYear} playerRows={[]} />
          } />
          <Route path="/teams/:abbr" element={<TeamDetailStub />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('row click navigates to /teams/:abbr via the router', () => {
    renderWithRoutes()
    fireEvent.click(screen.getByTestId('row-ARI'))
    expect(screen.getByText('team-detail-for-ARI')).toBeInTheDocument()
  })

  it('keyboard activation (Enter) navigates to /teams/:abbr via the router', () => {
    renderWithRoutes()
    fireEvent.keyDown(screen.getByTestId('row-KC'), { key: 'Enter' })
    expect(screen.getByText('team-detail-for-KC')).toBeInTheDocument()
  })

  it('keyboard activation (Space) navigates to /teams/:abbr via the router', () => {
    renderWithRoutes()
    fireEvent.keyDown(screen.getByTestId('row-SF'), { key: ' ' })
    expect(screen.getByText('team-detail-for-SF')).toBeInTheDocument()
  })
})
