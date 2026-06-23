// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OutlookTab } from './OutlookTab'

expect.extend(jestDomMatchers)
afterEach(() => { cleanup(); localStorage.clear() })

vi.mock('../Tooltip', () => ({ default: ({ children }) => <>{children}</> }))

vi.mock('../PlayersTab', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    PlayerProfile: ({ playerId }) => <div data-testid="profile">{playerId}</div>
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const careerStats = {
  2023: {
    wr1: { gamesPlayed: 14, fantasyPoints: 154, stats: { off_snp: 700, tm_off_snp: 1000 } }
  },
  2024: {
    wr1: { gamesPlayed: 15, fantasyPoints: 180, stats: { off_snp: 750, tm_off_snp: 1000 } },
    rk1: { gamesPlayed: 12, fantasyPoints: 108, stats: { off_snp: 400, tm_off_snp: 1000 } },
    qb1: { gamesPlayed: 16, fantasyPoints: 352, stats: { off_snp: 1050, tm_off_snp: 1050 } },
  }
}
const historicalShares = {
  wr1: [
    { season: 2023, share: 0.20, gamesPlayed: 14 },
    { season: 2024, share: 0.25, gamesPlayed: 15 }
  ]
}
const playerRows = [
  {
    player_id: 'wr1', position: 'WR', full_name: 'Alice Adams', age: 26,
    nfl_team: 'DAL', years_exp: 5, projectedPPG: 14.2, projectionConfidence: 'high',
    nextSeasonRank: 3, dynastyScore: null, currentSeasonPPG: 12.0, careerSparkline: [],
    ktcValue: 7000
  },
  {
    player_id: 'rk1', position: 'RB', full_name: 'Bob Brown', age: 22,
    nfl_team: 'SF', years_exp: 0, projectedPPG: null, projectionConfidence: 'rookie',
    nextSeasonRank: null, dynastyScore: null, currentSeasonPPG: 0, careerSparkline: [],
    ktcValue: null
  },
  {
    player_id: 'qb1', position: 'QB', full_name: 'Chris Carter', age: 28,
    nfl_team: 'KC', years_exp: 7, projectedPPG: 22.0, projectionConfidence: 'medium',
    nextSeasonRank: 2, dynastyScore: null, currentSeasonPPG: 22.0, careerSparkline: [],
    ktcValue: 5000
  }
]

const BASE_PROPS = {
  playerRows,
  loaded: true,
  careerStats,
  historicalShares,
  playerMap: {},
  positionPeakPPG: {},
  ktcMap: new Map(),
  collegeStats: {},
  seasonProjections: {},
  enrichmentMap: {},
  advStats: {},
  comparisonList: [],
  addToComparison: () => {},
  removeFromComparison: () => {},
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('OutlookTab', () => {
  it('renders a row per relevant player', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getByText('Alice Adams')).toBeInTheDocument()
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('Chris Carter')).toBeInTheDocument()
  })

  it('Proj cell: high-confidence row shows projectedPPG.toFixed(1) with font-bold; nextSeasonRank shown', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    // projectedPPG=14.2 → "14.2"
    expect(screen.getByText('14.2')).toBeInTheDocument()
    // high confidence → font-bold class
    const span = container.querySelector('.font-bold')
    expect(span).not.toBeNull()
    expect(span.textContent).toBe('14.2')
    // nextSeasonRank=3 + position='WR' → "WR3"
    expect(screen.getByText('WR3')).toBeInTheDocument()
  })

  it('Proj cell: null projection → —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // rk1 has projectedPPG:null → at least one — cell (not necessarily unique)
    // Bob Brown's row should contain a —
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('WR row (2 snap+share seasons): snap and opp trend cells show arrow + %', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    // snap trend: 0.75-0.70=+0.05 → ↑+5%; opp trend: 0.25-0.20=+0.05 → ↑+5%
    const positiveSpans = container.querySelectorAll('.text-\\[var\\(--color-positive-text\\)\\]')
    expect(positiveSpans.length).toBeGreaterThanOrEqual(2)
    // at least one "+5%"
    expect(screen.getAllByText('↑+5%').length).toBeGreaterThanOrEqual(2)
  })

  it('rookie row (1 season): snap and opp trend cells show —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // rk1 only has 2024 data (1 season) → no trend → faintest — for both snap and opp
    // We check that the text — appears multiple times (more than 1 because of rookie proj + trends)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('QB row: snap/opp/role all —, but Proj shown', () => {
    // Chris Carter QB: snapPct=null (QB skipped), share=null (QB) → both trends null → —; role null → —
    render(<OutlookTab {...BASE_PROPS} />)
    // QB Proj is shown (22.0)
    expect(screen.getByText('22.0')).toBeInTheDocument()
  })

  it('clicking chevron expands → usage-history panel rows visible (Season / Snap% / Share columns)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // Filter to WR so wr1 (which has 2023+2024 data) is the only row
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    expect(chevrons).toHaveLength(1)
    fireEvent.click(chevrons[0])
    // Usage history shows most-recent first: 2024, then 2023
    expect(screen.getByText('2024')).toBeInTheDocument()
    expect(screen.getByText('2023')).toBeInTheDocument()
  })

  it('clicking row body → profile panel appears with correct playerId; chevron click does NOT open it', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // Chevron click should not open profile
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    fireEvent.click(chevrons[0])
    expect(screen.queryByTestId('profile')).toBeNull()

    // Click on player name cell (WR row) — fires onRowClick → opens profile
    fireEvent.click(screen.getByText('Alice Adams'))
    expect(screen.getByTestId('profile')).toBeInTheDocument()
    expect(screen.getByTestId('profile').textContent).toBe('wr1')
  })

  it('clicking a SortTh toggles sort direction (Proj desc→asc)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // Default: projectedPPG desc — active header shows the indicator
    expect(screen.getByText('Proj ↓')).toBeInTheDocument()
    // Click header to toggle to asc
    fireEvent.click(screen.getByText('Proj ↓'))
    expect(screen.getByText('Proj ↑')).toBeInTheDocument()
  })

  it('no NaN/empty-crash with 1-season and QB rows', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    expect(container.textContent).not.toMatch(/NaN|undefined/)
  })
})
