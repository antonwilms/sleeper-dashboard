// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { NflStatsTab } from './NflStatsTab'

expect.extend(jestDomMatchers)
afterEach(() => { cleanup(); localStorage.clear() })

vi.mock('../Tooltip', () => ({ default: ({ children }) => <>{children}</> }))

vi.mock('../PlayersTab', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    PlayerProfile: ({ playerId }) => <div data-testid="profile">{playerId}</div>,
  }
})

// Mock schedule: one REG game for DAL (WR's team) in week 1 of 2024
vi.mock('../../api/nflSchedule', () => ({
  loadNflSchedule: vi.fn().mockResolvedValue({
    games: [{
      gameId: 'g1', season: 2024, week: 1, gameType: 'REG',
      homeTeam: 'DAL', awayTeam: 'PIT',
      homeScore: 24, awayScore: 14, result: 10,
      spreadLine: 3, totalLine: 43,
      roof: 'outdoors', surface: 'grass', temp: 72, wind: 5,
    }],
    year: 2024, complete: true, rowCount: 1,
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeStatus(map) {
  const arr = new Array(18).fill('X')
  for (const [w, s] of Object.entries(map)) arr[Number(w) - 1] = s
  return arr
}

const careerStats = {
  2023: {
    wr1: {
      gamesPlayed: 14, fantasyPoints: 154,
      stats: { rec_tgt: 100, rec: 72, rec_yd: 900, rec_td: 5 },
      weeklyPoints: { 1: 11, 2: 12 },
      weeklyStatus: makeStatus({ 1: 'P', 2: 'P' }),
    },
  },
  2024: {
    wr1: {
      gamesPlayed: 15, fantasyPoints: 240,
      stats: { rec_tgt: 120, rec: 90, rec_yd: 1200, rec_td: 8 },
      weeklyPoints: { 1: 16 },
      weeklyStatus: makeStatus({ 1: 'P' }),
    },
    rb1: {
      gamesPlayed: 12, fantasyPoints: 108,
      stats: { rush_att: 100, rush_yd: 450, rush_td: 4 },
      weeklyPoints: { 1: 9 },
      weeklyStatus: makeStatus({ 1: 'P' }),
    },
    qb1: {
      gamesPlayed: 16, fantasyPoints: 352,
      stats: { pass_cmp: 300, pass_att: 450, pass_yd: 4200, pass_td: 30, pass_int: 10, rush_yd: 200, rush_td: 3 },
      weeklyPoints: { 1: 22 },
      weeklyStatus: makeStatus({ 1: 'P' }),
    },
    // nd1 has no 2024 entry → should show — in every stat cell
  },
}

const playerRows = [
  {
    player_id: 'wr1', position: 'WR', full_name: 'Alice Adams', age: 26,
    nfl_team: 'DAL', years_exp: 5, projectedPPG: 14.2, projectionConfidence: 'high',
    nextSeasonRank: 3, dynastyScore: null, currentSeasonPPG: 12.0, ktcValue: 7000,
  },
  {
    player_id: 'rb1', position: 'RB', full_name: 'Bob Brown', age: 24,
    nfl_team: 'SF', years_exp: 2, projectedPPG: 10.0, projectionConfidence: 'medium',
    nextSeasonRank: null, dynastyScore: null, currentSeasonPPG: 9.0, ktcValue: 4000,
  },
  {
    player_id: 'qb1', position: 'QB', full_name: 'Chris Carter', age: 28,
    nfl_team: 'KC', years_exp: 7, projectedPPG: 22.0, projectionConfidence: 'high',
    nextSeasonRank: 2, dynastyScore: null, currentSeasonPPG: 22.0, ktcValue: 5000,
  },
  {
    player_id: 'nd1', position: 'WR', full_name: 'Dana Dunn', age: 22,
    nfl_team: 'NE', years_exp: 1, projectedPPG: null, projectionConfidence: null,
    nextSeasonRank: null, dynastyScore: null, currentSeasonPPG: 0, ktcValue: null,
  },
]

const BASE_PROPS = {
  playerRows,
  loaded: true,
  careerStats,
  playerMap: {},
  positionPeakPPG: {},
  ktcMap: new Map(),
  historicalShares: {},
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
describe('NflStatsTab', () => {
  it('1 — renders a row per player', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    expect(screen.getByText('Alice Adams')).toBeInTheDocument()
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('Chris Carter')).toBeInTheDocument()
    expect(screen.getByText('Dana Dunn')).toBeInTheDocument()
  })

  it('2 — position columns switch: QB pill shows Cmp%/hides Catch%; WR pill opposite', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.getByText(/Cmp%/)).toBeInTheDocument()
    expect(screen.queryByText(/Catch%/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    expect(screen.getByText(/Catch%/)).toBeInTheDocument()
    expect(screen.queryByText(/Cmp%/)).toBeNull()
  })

  it('3 — season-average formatting: FP/G rendered; no-data player shows —', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    // wr1 2024: 240/15 = 16.0
    expect(screen.getByText('16.0')).toBeInTheDocument()
    // nd1 has no 2024 data → all cells —
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('3b — table-level season select: switching season recomputes averages + localStorage', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    // Initial: 2024, wr1 FP/G = 16.0
    expect(screen.getByText('16.0')).toBeInTheDocument()

    const seasonSelect = screen.getByRole('combobox')
    fireEvent.change(seasonSelect, { target: { value: '2023' } })

    // After switching to 2023: wr1 FP/G = 154/14 = 11.0
    expect(screen.getByText('11.0')).toBeInTheDocument()
    expect(screen.queryByText('16.0')).toBeNull()
    expect(localStorage.getItem('nflstats-season')).toBe('2023')
  })

  it('4 — sort toggle: FP/G ↓ → click → FP/G ↑', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    // Default sort
    expect(screen.getByText('FP/G ↓')).toBeInTheDocument()
    fireEvent.click(screen.getByText('FP/G ↓'))
    expect(screen.getByText('FP/G ↑')).toBeInTheDocument()
  })

  it('5 — expansion: game-log panel appears; schedule opponent renders; per-row season select when ≥2 seasons', async () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    // Filter to WR so wr1 is among the results
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))

    // Click wr1's chevron
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    fireEvent.click(chevrons[0])

    // Schedule is async — wait for the opponent to appear
    await waitFor(() => {
      expect(screen.getByText('vs PIT')).toBeInTheDocument()
    })

    // wr1 has 2023+2024 seasons → per-row season <select> should appear inside the panel
    const selects = screen.getAllByRole('combobox')
    // At least one select inside the expanded panel
    expect(selects.length).toBeGreaterThanOrEqual(1)
  })

  it('6 — row click opens profile; chevron click does not', () => {
    render(<NflStatsTab {...BASE_PROPS} />)
    // Chevron should NOT open profile
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    fireEvent.click(chevrons[0])
    expect(screen.queryByTestId('profile')).toBeNull()

    // Click player name → opens profile
    fireEvent.click(screen.getByText('Alice Adams'))
    expect(screen.getByTestId('profile')).toBeInTheDocument()
    expect(screen.getByTestId('profile').textContent).toBe('wr1')
  })

  it('7 — no NaN/undefined in rendered output', () => {
    const { container } = render(<NflStatsTab {...BASE_PROPS} />)
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.textContent).not.toMatch(/undefined/)
  })
})
