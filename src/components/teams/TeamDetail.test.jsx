// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamDetail } from './TeamDetail'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function week(overrides = {}) {
  return {
    week: 1, seasonType: 'REG', opponent: 'X',
    off: {
      plays: 60, passPlays: 30, rushPlays: 30,
      epaSum: 3, epaPlays: 60,
      passEpaSum: 2, passEpaPlays: 30,
      rushEpaSum: 1, rushEpaPlays: 30,
      successes: 30, successPlays: 60,
      proePlays: 60, proePassPlays: 30, proeXpassSum: 27,
      rzTrips: 4, rzTdTrips: 2,
      neutralSeconds: 720, neutralGaps: 24,
      pointsScored: 24,
      ...overrides.off,
    },
    def: { epaSum: -2, epaPlays: 60, ...overrides.def },
  }
}

// One loaded teamContext season with two teams — the resolved team (whatever key is passed) plus
// a second team (KC) so computeLeagueStanding has more than one entry to rank against.
function season(teamKey, overrides = {}) {
  return {
    complete: true, year: overrides.year, rowCount: 2,
    teams: {
      [teamKey]: { games: [week(overrides)] },
      KC: { games: [week()] },
    },
  }
}

function baseRow(overrides) {
  return {
    player_id: overrides.player_id ?? 'x',
    position: 'WR',
    full_name: 'X Player',
    age: 25,
    years_exp: 3,
    ownerTeamName: null,
    nfl_team: 'FA',
    ktcValue: null,
    ...overrides,
  }
}

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teams/:abbr" element={<TeamDetail {...props} />} />
      </Routes>
    </MemoryRouter>
  )
}

function chartBars(metricId) {
  const wrapper = screen.getByTestId(`chart-${metricId}`)
  return [...wrapper.firstChild.children]
}

describe('TeamDetail — loading vs degraded', () => {
  it('loaded=false renders the loading state, not a DegradedBlock', () => {
    renderAt('/teams/LA', { loaded: false, careerStats: null, teamContextByYear: {} })
    expect(screen.getByText(/loading in background/i)).toBeInTheDocument()
    expect(screen.queryByText(/NOT YET|NEVER AVAILABLE/i)).not.toBeInTheDocument()
  })

  it('loaded=true but the current season is not yet loaded renders a DegradedBlock, not "unknown team"', () => {
    renderAt('/teams/LA', { loaded: true, careerStats: { 2025: {} }, teamContextByYear: {} })
    expect(screen.getByText(/NOT YET/i)).toBeInTheDocument()
    expect(screen.queryByText(/not a recognised/i)).not.toBeInTheDocument()
  })

  it('unknown :abbr renders a degraded state, not a crash', () => {
    const careerStats = { 2025: {} }
    const teamContextByYear = { 2025: season('LA', { year: 2025 }) }
    renderAt('/teams/ZZZ', { loaded: true, careerStats, teamContextByYear })
    expect(screen.getByText(/not a recognised/i)).toBeInTheDocument()
  })
})

describe('TeamDetail — the 14-season lookup goes through eraTeam (§3.0, highest-value test)', () => {
  it('/teams/LA resolves STL for a pre-2016 season and renders a REAL bar, not a void slot', () => {
    const careerStats = { 2014: {}, 2025: {} }
    const teamContextByYear = {
      // Old era: teamcontext keys STL, not LA — LV/LAC-style franchise-code split (§3.0).
      2014: season('STL', { year: 2014, off: { proeXpassSum: 20 } }), // distinctive PROE
      2025: season('LA', { year: 2025 }),
    }
    const onNeedTeamHistory = vi.fn()
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, onNeedTeamHistory })

    // Real page rendered (not degraded) — proves isKnownTeam resolved LA for the CURRENT season.
    expect(screen.getByTestId('chart-proe')).toBeInTheDocument()
    const bars = chartBars('proe')
    // allSeasons sorted ascending: [2014, 2025] -> index 0 is the 2014 (STL-keyed) season.
    expect(bars[0].style.borderTop).not.toMatch(/dashed/) // real bar, not a void slot
    expect(onNeedTeamHistory).toHaveBeenCalledTimes(1)
  })

  it('a fixed "LA" lookup (the bug this guards) would find nothing for 2014 — sanity check on the fixture', () => {
    // If the component looked up 'LA' directly instead of eraTeam('LA', 2014)='STL', the 2014
    // teamContext object below (keyed STL, no LA) would yield a void slot. This test just proves
    // the FIXTURE itself has no 'LA' key for 2014, so the test above is discriminating for real.
    const teamContextByYear = { 2014: season('STL', { year: 2014 }) }
    expect(teamContextByYear[2014].teams.LA).toBeUndefined()
    expect(teamContextByYear[2014].teams.STL).toBeDefined()
  })

  it('/teams/LAC resolves SD for a pre-2017 season', () => {
    const careerStats = { 2016: {}, 2025: {} }
    const teamContextByYear = {
      2016: season('SD', { year: 2016, off: { proeXpassSum: 20 } }),
      2025: season('LAC', { year: 2025 }),
    }
    renderAt('/teams/LAC', { loaded: true, careerStats, teamContextByYear })
    const bars = chartBars('proe')
    expect(bars[0].style.borderTop).not.toMatch(/dashed/)
  })

  it('/teams/LV resolves OAK for a pre-2020 season', () => {
    const careerStats = { 2019: {}, 2025: {} }
    const teamContextByYear = {
      2019: season('OAK', { year: 2019, off: { proeXpassSum: 20 } }),
      2025: season('LV', { year: 2025 }),
    }
    renderAt('/teams/LV', { loaded: true, careerStats, teamContextByYear })
    const bars = chartBars('proe')
    expect(bars[0].style.borderTop).not.toMatch(/dashed/)
  })
})

describe('TeamDetail — partial window renders without gating', () => {
  it('renders the cards with 2 seasons present and 1 absent — void slot for the missing one, no gating', () => {
    const careerStats = { 2023: {}, 2024: {}, 2025: {} }
    const teamContextByYear = {
      // 2024 is missing entirely (on-demand load still in flight) — 2023 and 2025 are present.
      2023: season('LA', { year: 2023 }),
      2025: season('LA', { year: 2025 }),
    }
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear })
    expect(screen.getByTestId('chart-proe')).toBeInTheDocument() // not gated behind a complete window
    const bars = chartBars('proe')
    expect(bars).toHaveLength(3)
    expect(bars[0].style.borderTop).not.toMatch(/dashed/) // 2023 present
    expect(bars[1].style.borderTop).toMatch(/dashed/)      // 2024 absent -> void slot
    expect(bars[2].style.borderTop).not.toMatch(/dashed/) // 2025 present
  })
})

describe('TeamDetail — cards use computeTeamSeasonMetrics, scaled states its floor', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: season('LA', { year: 2025 }) }

  it('PROE card shows the current value, league median/rank, and the field expression', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear })
    // proe = (30/60) - (27/60) = 0.05 -> "+5.0%"
    expect(screen.getByText('+5.0%')).toBeInTheDocument()
    expect(screen.getAllByText(/League median/).length).toBeGreaterThan(0)
    expect(screen.getByText(/off\.passPlays/)).toBeInTheDocument()
  })

  it('SUCCESS RATE (scaled) states its axis floor on the card', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear })
    expect(screen.getByText('AXIS 0–100%')).toBeInTheDocument()
  })

  it('PROE/OFF EPA per PLAY (signed) state ZERO BASELINE, not a floor', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear })
    expect(screen.getAllByText('ZERO BASELINE')).toHaveLength(2) // PROE + OFF EPA/PLAY
  })
})

describe('TeamDetail — coaching (§5, two silent traps)', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: season('LA', { year: 2025 }) }

  it('resolves the LAR coaching entries for the LA route param (CR-16 mirror of 6a\'s exposure bug)', () => {
    const coaching = {
      entries: [
        { team: 'LAR', year: 2026, role: 'HC', name: 'Sean McVay' },
        { team: 'LAR', year: 2026, role: 'OC', name: 'Mike LaFleur' },
        { team: 'LAR', year: 2026, role: 'DC', name: 'Chris Shula' },
      ],
    }
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, coaching })
    expect(screen.getByText('Sean McVay')).toBeInTheDocument()
    expect(screen.getByText('Mike LaFleur')).toBeInTheDocument()
    expect(screen.getByText('Chris Shula')).toBeInTheDocument()
  })

  it('queries the enrichment\'s own year (2026), not dataSeason (2025), and labels the block with it', () => {
    const coaching = { entries: [{ team: 'LAR', year: 2026, role: 'HC', name: 'Sean McVay' }] }
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, coaching })
    expect(screen.getByText('· 2026')).toBeInTheDocument()
    expect(screen.getByText('Sean McVay')).toBeInTheDocument()
  })

  it('an empty coaching payload renders a DegradedBlock, not a blank block', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, coaching: { entries: [] } })
    expect(screen.getByText(/NO BASELINE/i)).toBeInTheDocument()
  })

  it('a null coaching payload renders a DegradedBlock', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, coaching: null })
    expect(screen.getByText(/NO BASELINE/i)).toBeInTheDocument()
  })
})

describe('TeamDetail — holdings (§4)', () => {
  const careerStats = { 2025: {} }
  const teamContextByYear = { 2025: season('LA', { year: 2025 }) }

  it('a player whose nfl_team is LAR (Sleeper domain) appears on the LA team page', () => {
    const playerRows = [baseRow({ player_id: 'p1', nfl_team: 'LAR', full_name: 'Rams Player' })]
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, playerRows })
    expect(screen.getByText('Rams Player')).toBeInTheDocument()
  })

  it('ownership meta: yours (with % of roster), another manager\'s, and unowned all render correctly', () => {
    const playerRows = [
      baseRow({ player_id: 'mine', nfl_team: 'LA', full_name: 'Mine', ownerTeamName: 'Me', ktcValue: 5000 }),
      baseRow({ player_id: 'other', nfl_team: 'LA', full_name: 'Other Owned', ownerTeamName: 'Rival', ktcValue: 1000 }),
      baseRow({ player_id: 'free', nfl_team: 'LA', full_name: 'Free Agent Guy', ownerTeamName: null, ktcValue: 500 }),
    ]
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, playerRows, myTeamName: 'Me' })
    const mineRow = screen.getByTestId('holding-mine')
    expect(mineRow.textContent).toContain('% of roster')
    const otherRow = screen.getByTestId('holding-other')
    expect(otherRow.textContent).toContain('owned by Rival')
    const freeRow = screen.getByTestId('holding-free')
    expect(freeRow.textContent).toContain('not owned')
  })

  it('a null ktcValue is skipped from the roster-value denominator, not treated as zero', () => {
    const playerRows = [
      baseRow({ player_id: 'valued', nfl_team: 'LA', full_name: 'Valued', ownerTeamName: 'Me', ktcValue: 1000 }),
      baseRow({ player_id: 'nullval', nfl_team: 'KC', full_name: 'No Value Yet', ownerTeamName: 'Me', ktcValue: null }),
    ]
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, playerRows, myTeamName: 'Me' })
    // denom = 1000 (nullval's null is skipped, not zeroed) -> valued player reads 100% of roster.
    expect(screen.getByTestId('holding-valued').textContent).toContain('100% of roster')
  })

  it('a team with no matching rows renders a muted one-liner, not an empty table or a DegradedBlock', () => {
    renderAt('/teams/LA', { loaded: true, careerStats, teamContextByYear, playerRows: [] })
    expect(screen.getByText(/no tracked players on LA/i)).toBeInTheDocument()
    // The holdings block itself carries no DegradedBlock — the coaching block below it renders
    // its own (no coaching prop passed here), which is unrelated and expected.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByTestId(/^holding-/)).not.toBeInTheDocument()
  })
})
