// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Portfolio } from './Portfolio'

expect.extend(jestDomMatchers)
afterEach(() => {
  cleanup()
  localStorage.removeItem('portfolio-sort')
})

function baseRow(overrides) {
  return {
    player_id: 'x', position: 'WR', full_name: 'X Player', age: 25, years_exp: 3, nfl_team: 'DAL',
    ownerTeamName: null, currentSeasonPPG: 0, careerSparkline: [0, 0, 0, 0, 0],
    dynastyScore: { signals: {} },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tile arithmetic — hand-computed expected numbers
// ---------------------------------------------------------------------------
describe('tile arithmetic (hand-computed)', () => {
  // My Team: 5 valued+aged rows. rosterValue = 6000+3000+1000+500+400 = 10900.
  // weightedAge = (24*6000+28*3000+30*1000+26*500+27*400)/10900 = 25.853... -> "25.9"
  // top4 (6000,3000,1000,500) = 10500 / 10900 = 96.3% -> 96%
  // Other Team: single row age 25 ktc 20000 -> weightedAge 25.0, rosterValue 20000 (ranks #1)
  // median([25.853..., 25.0]) = 25.4266... -> "25.4"
  const playerRows = [
    baseRow({ player_id: 'p1', ownerTeamName: 'My Team', age: 24, ktcValue: 6000 }),
    baseRow({ player_id: 'p2', ownerTeamName: 'My Team', age: 28, ktcValue: 3000 }),
    baseRow({ player_id: 'p3', ownerTeamName: 'My Team', age: 30, ktcValue: 1000 }),
    baseRow({ player_id: 'p4', ownerTeamName: 'My Team', age: 26, ktcValue: 500 }),
    baseRow({ player_id: 'p5', ownerTeamName: 'My Team', age: 27, ktcValue: 400 }),
    baseRow({ player_id: 'o1', ownerTeamName: 'Other Team', age: 25, ktcValue: 20000 }),
  ]
  const rosterTeams = [
    {
      teamName: 'My Team',
      starters: [
        { id: 'p1', slot: 'Starter', full_name: 'X', position: 'WR', team: 'DAL', age: 24 },
        { id: 'p2', slot: 'Starter', full_name: 'Y', position: 'RB', team: 'DAL', age: 28 },
      ],
      bench: [], reserve: [],
    },
    { teamName: 'Other Team', starters: [], bench: [], reserve: [] },
  ]
  const seasonProjections = {
    p1: { projectedPPG: 12, projectedGames: 16, projectedTotalPts: 192 },
    p2: { projectedPPG: 9, projectedGames: 15, projectedTotalPts: 135 },
    // projectedPoints = round(192 + 135) = 327
  }

  it('ROSTER VALUE: sum of owned ktcValue, note is rank among teams', () => {
    render(<Portfolio playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections} myTeamName="My Team" />)
    const tile = screen.getByTestId('tile-value')
    expect(tile.textContent).toContain('10,900')
    expect(tile.textContent).toContain('2nd of 2')
  })

  it('WEIGHTED AGE: ktcValue-weighted mean, note is league median', () => {
    render(<Portfolio playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections} myTeamName="My Team" />)
    const tile = screen.getByTestId('tile-age')
    expect(tile.textContent).toContain('25.9')
    expect(tile.textContent).toContain('League median 25.4')
  })

  it('CONCENTRATION: top-4-of-owned share of total owned value', () => {
    render(<Portfolio playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections} myTeamName="My Team" />)
    const tile = screen.getByTestId('tile-conc')
    expect(tile.textContent).toContain('96%')
    expect(tile.textContent).toContain('Top 4 of 5 assets by value')
  })

  it('PROJ. POINTS: sum of starters\' projectedTotalPts, joined on starter.id', () => {
    render(<Portfolio playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections} myTeamName="My Team" />)
    const tile = screen.getByTestId('tile-proj')
    expect(tile.textContent).toContain('327')
    expect(tile.textContent).toContain('Next season, starters only')
  })
})

// ---------------------------------------------------------------------------
// Degenerate cases — each renders "—", never a fabricated number
// ---------------------------------------------------------------------------
describe('tile degenerate cases', () => {
  it('no owned rows with ktcValue: ROSTER VALUE, WEIGHTED AGE, CONCENTRATION all "—"', () => {
    const playerRows = [baseRow({ player_id: 'p1', ownerTeamName: 'My Team', age: 25 })] // no ktcValue at all
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-value').textContent).toContain('—')
    expect(screen.getByTestId('tile-age').textContent).toContain('—')
    expect(screen.getByTestId('tile-conc').textContent).toContain('—')
  })

  it('fewer than four valued assets: CONCENTRATION renders "—" even though value/age are real', () => {
    const playerRows = [
      baseRow({ player_id: 'p1', ownerTeamName: 'My Team', age: 25, ktcValue: 1000 }),
      baseRow({ player_id: 'p2', ownerTeamName: 'My Team', age: 27, ktcValue: 500 }),
    ]
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-value').textContent).toContain('1,500')
    expect(screen.getByTestId('tile-conc').textContent).toContain('—')
  })

  it('empty starters: PROJ. POINTS renders "—"', () => {
    const rosterTeams = [{ teamName: 'My Team', starters: [], bench: [], reserve: [] }]
    render(<Portfolio playerRows={[]} rosterTeams={rosterTeams} seasonProjections={{}} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-proj').textContent).toContain('—')
  })

  it('null seasonProjections: PROJ. POINTS renders "—" (not a fabricated 0.0) even with non-empty starters', () => {
    const rosterTeams = [{ teamName: 'My Team', starters: [{ id: 's1', slot: 'Starter', full_name: 'S', position: 'RB', team: 'DAL', age: 24 }], bench: [], reserve: [] }]
    render(<Portfolio playerRows={[]} rosterTeams={rosterTeams} seasonProjections={null} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-proj').textContent).toContain('—')
  })

  it('starters exist but none carry a projection: PROJ. POINTS renders "—", not 0', () => {
    const rosterTeams = [{ teamName: 'My Team', starters: [{ id: 's1', slot: 'Starter', full_name: 'S', position: 'RB', team: 'DAL', age: 24 }], bench: [], reserve: [] }]
    // seasonProjections is non-null but has no entry matching s1.
    render(<Portfolio playerRows={[]} rosterTeams={rosterTeams} seasonProjections={{ other: { projectedTotalPts: 999 } }} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-proj').textContent).toContain('—')
  })

  it('a starter joins on id (not player_id) — enrichPlayer\'s real shape has no player_id, and the tile must still be non-zero', () => {
    const rosterTeams = [{
      teamName: 'My Team',
      // Deliberately no player_id field anywhere on this object — matches enrichPlayer's real
      // { id, slot, full_name, position, team, age } shape exactly.
      starters: [{ id: 's1', slot: 'Starter', full_name: 'S One', position: 'RB', team: 'DAL', age: 24 }],
      bench: [], reserve: [],
    }]
    const seasonProjections = { s1: { projectedPPG: 10, projectedGames: 16, projectedTotalPts: 160 } }
    render(<Portfolio playerRows={[]} rosterTeams={rosterTeams} seasonProjections={seasonProjections} myTeamName="My Team" />)
    expect(screen.getByTestId('tile-proj').textContent).toContain('160')
  })
})

// ---------------------------------------------------------------------------
// myTeamName === null — one empty state, not four "—" tiles
// ---------------------------------------------------------------------------
describe('myTeamName null', () => {
  it('renders a single explanatory empty state, not the tile grid', () => {
    render(<Portfolio playerRows={[baseRow({ ownerTeamName: 'Some Team', ktcValue: 100 })]} myTeamName={null} />)
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
    expect(screen.getByText(/No roster found/)).toBeInTheDocument()
    expect(screen.queryByTestId('tile-value')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Age-band bucketing
// ---------------------------------------------------------------------------
describe('value by age band', () => {
  it('null-age rows are excluded from every band; an under-21 row lands in the first (≤23) band rather than vanishing', () => {
    const playerRows = [
      baseRow({ player_id: 'a1', ownerTeamName: 'My Team', age: null, ktcValue: 1000 }), // excluded entirely
      baseRow({ player_id: 'a2', ownerTeamName: 'My Team', age: 20, ktcValue: 500 }),    // -> ≤23
      baseRow({ player_id: 'a3', ownerTeamName: 'My Team', age: 24, ktcValue: 300 }),    // -> 24–25
      baseRow({ player_id: 'a4', ownerTeamName: 'My Team', age: 27, ktcValue: 200 }),    // -> 26–28
      baseRow({ player_id: 'a5', ownerTeamName: 'My Team', age: 29, ktcValue: 150 }),    // -> 29–30
      baseRow({ player_id: 'a6', ownerTeamName: 'My Team', age: 35, ktcValue: 100 }),    // -> 31+
    ]
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('ageband-b1').textContent).toContain('500')
    expect(screen.getByTestId('ageband-b2').textContent).toContain('300')
    expect(screen.getByTestId('ageband-b3').textContent).toContain('200')
    expect(screen.getByTestId('ageband-b4').textContent).toContain('150')
    expect(screen.getByTestId('ageband-b5').textContent).toContain('100')
    // The null-age row's 1000 value must not appear anywhere in the bands (would inflate one).
    for (const key of ['b1', 'b2', 'b3', 'b4', 'b5']) {
      expect(screen.getByTestId(`ageband-${key}`).textContent).not.toContain('1,000')
    }
  })
})

// ---------------------------------------------------------------------------
// HORIZON — thresholds, "—", and the signals === null row
// ---------------------------------------------------------------------------
describe('HORIZON pill', () => {
  const playerRows = [
    baseRow({ player_id: 'h1', ownerTeamName: 'My Team', ktcValue: 100, dynastyScore: { signals: { yearsFromPeak: -2 } } }),  // boundary -> Appreciating
    baseRow({ player_id: 'h2', ownerTeamName: 'My Team', ktcValue: 100, dynastyScore: { signals: { yearsFromPeak: 0 } } }),   // -> Peak
    baseRow({ player_id: 'h3', ownerTeamName: 'My Team', ktcValue: 100, dynastyScore: { signals: { yearsFromPeak: 2 } } }),   // boundary -> Depreciating
    baseRow({ player_id: 'h4', ownerTeamName: 'My Team', ktcValue: 100, dynastyScore: { signals: { yearsFromPeak: null } } }), // -> "—"
    baseRow({ player_id: 'h5', ownerTeamName: 'My Team', ktcValue: 100, dynastyScore: { score: null, label: 'N/A', signals: null } }), // non-scored path -> "—"
  ]

  it('yearsFromPeak <= -2 renders Appreciating', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('horizon-h1').textContent).toContain('Appreciating')
  })

  it('-2 < yearsFromPeak < 2 renders Peak', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('horizon-h2').textContent).toContain('Peak')
  })

  it('yearsFromPeak >= 2 renders Depreciating', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('horizon-h3').textContent).toContain('Depreciating')
  })

  it('null yearsFromPeak renders "—"', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('horizon-h4').textContent).toContain('—')
  })

  it('signals === null (non-scored path) renders "—"', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('horizon-h5').textContent).toContain('—')
  })
})

// ---------------------------------------------------------------------------
// PROJ Δ — currentSeasonPPG === 0 guard
// ---------------------------------------------------------------------------
describe('PROJ Δ', () => {
  it('currentSeasonPPG === 0 renders "—", not projectedPPG - 0 as a fabricated gain', () => {
    const playerRows = [
      baseRow({ player_id: 'd1', ownerTeamName: 'My Team', ktcValue: 100, currentSeasonPPG: 0, projectedPPG: 15 }),
    ]
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('projdelta-d1').textContent).toContain('—')
  })

  it('a real prior season renders the true delta', () => {
    const playerRows = [
      baseRow({ player_id: 'd2', ownerTeamName: 'My Team', ktcValue: 100, currentSeasonPPG: 10, projectedPPG: 15 }),
    ]
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" />)
    expect(screen.getByTestId('projdelta-d2').textContent).toContain('+5.0')
  })
})

// ---------------------------------------------------------------------------
// Row interaction
// ---------------------------------------------------------------------------
describe('row interaction', () => {
  const playerRows = [
    baseRow({ player_id: 'r1', full_name: 'Row One', ownerTeamName: 'My Team', ktcValue: 100 }),
  ]

  it('row click calls onOpenPlayerDetail with the player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" onOpenPlayerDetail={onOpenPlayerDetail} />)
    fireEvent.click(screen.getByText('Row One').closest('tr'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('r1')
  })

  it('keyboard activation (Enter) calls onOpenPlayerDetail with the player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" onOpenPlayerDetail={onOpenPlayerDetail} />)
    fireEvent.keyDown(screen.getByText('Row One').closest('tr'), { key: 'Enter' })
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('r1')
  })
})

// ---------------------------------------------------------------------------
// No-props mount
// ---------------------------------------------------------------------------
describe('mounting with no props', () => {
  it('does not crash and renders the myTeamName-null empty state (its default)', () => {
    render(<Portfolio />)
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
    expect(screen.getByText(/No roster found/)).toBeInTheDocument()
  })
})
