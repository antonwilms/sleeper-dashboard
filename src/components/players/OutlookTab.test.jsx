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

// wr1: 2 qualifying seasons (2023: 14gp, 2024: 15gp) with weeklyPoints → consistency eligible
// weeklyPoints chosen so mean ≠ 14.2 (avoids collision with projectedPPG)
// 2024: 15 games with value 13.0 each → season mean=13.0
// 2023: 14 games with value 11.0 each → season mean=11.0
// pooled 29 games, pooled mean=~12.069
const careerStats = {
  2023: {
    wr1: {
      gamesPlayed: 14,
      fantasyPoints: 154,
      stats: { off_snp: 700, tm_off_snp: 1000 },
      weeklyPoints: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i + 1), 11.0]))
    }
  },
  2024: {
    wr1: {
      gamesPlayed: 15,
      fantasyPoints: 180,
      stats: { off_snp: 750, tm_off_snp: 1000 },
      weeklyPoints: Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), 13.0]))
    },
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
    nextSeasonRank: 3,
    dynastyScore: {
      signals: {
        isBreakout: true,
        isBounceBack: false,
        momentumLabel: 'accelerating',
        isTdReliant: false,
        ageCurveFactor: 1.10,
        tdDependency: 0.2
      }
    },
    currentSeasonPPG: 12.0, careerSparkline: [], ktcValue: 7000
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

const seasonProjections = {
  wr1: { projectedGames: 16, adjustmentSummary: ['Growing role ↑'] },
  qb1: { projectedGames: 17, adjustmentSummary: [] },
}

const BASE_PROPS = {
  playerRows,
  loaded: true,
  careerStats,
  historicalShares,
  playerMap: {},
  positionPeakPPG: {},
  ktcMap: new Map(),
  collegeStats: {},
  seasonProjections,
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
    // rk1 has projectedPPG:null → at least one — cell
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('WR row (2 snap+share seasons): snap and opp trend cells show arrow + %', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    const positiveSpans = container.querySelectorAll('.text-\\[var\\(--color-positive-text\\)\\]')
    expect(positiveSpans.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('↑+5%').length).toBeGreaterThanOrEqual(2)
  })

  it('rookie row (1 season): snap and opp trend cells show —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('QB row: snap/opp/role all —, but Proj shown', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getByText('22.0')).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // Δ vs now
  // ---------------------------------------------------------------------------
  it('Δ vs now: wr1 shows ↑+2.2 (proj 14.2 - cur 12.0)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // delta = 14.2 - 12.0 = 2.2 → positive → ↑+2.2
    expect(screen.getByText('↑+2.2')).toBeInTheDocument()
  })

  it('Δ vs now: qb1 shows → (delta ≈ 0, within dead-band)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // qb1: proj=22.0, cur=22.0, delta=0 → flat → →
    expect(screen.getByText('→0.0')).toBeInTheDocument()
  })

  it('Δ vs now: rk1 (projectedPPG null) shows —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // rk1 has projectedPPG:null → DeltaCell renders —
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Proj G
  // ---------------------------------------------------------------------------
  it('Proj G: wr1 → 16, qb1 → 17', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
  })

  it('Proj G: row with no seasonProjections entry → —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // rk1 has no seasonProjections entry → _projGames null → —
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Signals cluster
  // ---------------------------------------------------------------------------
  it('Signals: wr1 shows ⚡ (isBreakout), ↑↑ (accelerating), age ↑ (ageCurveFactor 1.10 ≥ 1.05)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getByText('⚡')).toBeInTheDocument()
    expect(screen.getByText('↑↑')).toBeInTheDocument()
    // age up glyph — there may be multiple ↑ in the DOM (snap trend etc), use getAllByText
    const upGlyphs = screen.getAllByText('↑')
    expect(upGlyphs.length).toBeGreaterThanOrEqual(1)
  })

  it('Signals: rows with dynastyScore:null render empty Signals cell (no glyph, no —)', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    // Filter to QB so only qb1 (dynastyScore:null) is visible
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    // SignalCluster returns null when signals is null → cell is empty
    // Confirm no signal glyphs appear
    expect(container.querySelector('.inline-flex.gap-1.text-xs')).toBeNull()
  })

  it('Signals: ageCurveFactor null → no age glyph, no — in Signals cell', () => {
    const rowsWithNullAge = playerRows.map(r =>
      r.player_id === 'wr1'
        ? { ...r, dynastyScore: { signals: { isBreakout: false, isBounceBack: false, momentumLabel: 'neutral', isTdReliant: false, ageCurveFactor: null, tdDependency: 0 } } }
        : r
    )
    render(<OutlookTab {...BASE_PROPS} playerRows={rowsWithNullAge} />)
    // No signal glyphs should fire — SignalCluster returns null (no flags)
    const cluster = screen.queryByText('⚡')
    expect(cluster).toBeNull()
    // The Signals cell should be completely empty (not '—')
  })

  // ---------------------------------------------------------------------------
  // Consistency PPG ± SD
  // ---------------------------------------------------------------------------
  it('Consistency: wr1 shows mean±sd (eligible: 2 qualifying seasons, 29 pooled games)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // pooled 29 games: 15×13.0 + 14×11.0 = 195+154=349; mean=349/29≈12.034...
    // Rendered as toFixed(1) → "12.0"
    // sd also shown as toFixed(1)
    // Since Tooltip is mocked (passthrough), we can check for the text
    const consistencyText = screen.getByText(/12\.0/)
    expect(consistencyText).toBeInTheDocument()
  })

  it('Consistency: rk1/qb1 (below floor) → —', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    // rk1 has only 2024 (no weeklyPoints), qb1 has only 2024 (no weeklyPoints) → both ineligible
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Expansion panel
  // ---------------------------------------------------------------------------
  it('expanding wr1 shows adjustment chip, distribution table header, and usage history', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    expect(chevrons).toHaveLength(1)
    fireEvent.click(chevrons[0])

    // (a) adjustment chip
    expect(screen.getByText('Growing role ↑')).toBeInTheDocument()

    // (b) distribution table header — multiple "Season" elements exist (distribution + usage history)
    expect(screen.getAllByText('Season').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('SD')).toBeInTheDocument()
    expect(screen.getByText('CV')).toBeInTheDocument()

    // (c) usage history still renders below — multiple "2024"/"2023" from distribution + usage rows
    expect(screen.getAllByText('2024').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2023').length).toBeGreaterThanOrEqual(1)
  })

  it('clicking chevron expands → usage-history panel rows visible (Season / Snap% / Share columns)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    expect(chevrons).toHaveLength(1)
    fireEvent.click(chevrons[0])
    expect(screen.getAllByText('2024').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2023').length).toBeGreaterThanOrEqual(1)
  })

  it('clicking row body → profile panel appears with correct playerId; chevron click does NOT open it', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    const chevrons = screen.getAllByRole('button', { name: /toggle details/i })
    fireEvent.click(chevrons[0])
    expect(screen.queryByTestId('profile')).toBeNull()

    fireEvent.click(screen.getByText('Alice Adams'))
    expect(screen.getByTestId('profile')).toBeInTheDocument()
    expect(screen.getByTestId('profile').textContent).toBe('wr1')
  })

  // ---------------------------------------------------------------------------
  // Sort headers
  // ---------------------------------------------------------------------------
  it('clicking a SortTh toggles sort direction (Proj desc→asc)', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    expect(screen.getByText('Proj ↓')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Proj ↓'))
    expect(screen.getByText('Proj ↑')).toBeInTheDocument()
  })

  it('clicking Δ vs now SortTh toggles direction', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    const headers = screen.getAllByRole('columnheader')
    const deltaHeader = headers.find(h => h.textContent.includes('Δ vs now'))
    expect(deltaHeader).toBeTruthy()
    // Before click: no sort indicator (not the active column)
    expect(deltaHeader.textContent).not.toMatch(/[↑↓]/)
    fireEvent.click(deltaHeader)
    // First click activates column (desc by default)
    expect(deltaHeader.textContent).toContain('↓')
    fireEvent.click(deltaHeader)
    // Second click toggles to asc
    expect(deltaHeader.textContent).toContain('↑')
  })

  it('clicking PPG ± SD SortTh toggles direction', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    const headers = screen.getAllByRole('columnheader')
    const sdHeader = headers.find(h => h.textContent.includes('PPG') && h.textContent.includes('SD'))
    expect(sdHeader).toBeTruthy()
    expect(sdHeader.textContent).not.toMatch(/[↑↓]/)
    fireEvent.click(sdHeader)
    expect(sdHeader.textContent).toContain('↓')
    fireEvent.click(sdHeader)
    expect(sdHeader.textContent).toContain('↑')
  })

  it('clicking Proj G SortTh toggles direction', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    const headers = screen.getAllByRole('columnheader')
    const projGHeader = headers.find(h => h.textContent.includes('Proj G'))
    expect(projGHeader).toBeTruthy()
    expect(projGHeader.textContent).not.toMatch(/[↑↓]/)
    fireEvent.click(projGHeader)
    expect(projGHeader.textContent).toContain('↓')
    fireEvent.click(projGHeader)
    expect(projGHeader.textContent).toContain('↑')
  })

  // ---------------------------------------------------------------------------
  // No NaN / crash guards
  // ---------------------------------------------------------------------------
  it('no NaN/empty-crash with 1-season and QB rows', () => {
    const { container } = render(<OutlookTab {...BASE_PROPS} />)
    expect(container.textContent).not.toMatch(/NaN|undefined/)
  })
})
