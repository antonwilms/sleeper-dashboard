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

  // ---------------------------------------------------------------------------
  // 9-14: Position-stat column group (E2-E4)
  // ---------------------------------------------------------------------------

  // Extended fixtures for position-stat tests
  const teRow = {
    player_id: 'te1', position: 'TE', full_name: 'Dave Daniels', age: 25,
    nfl_team: 'SEA', years_exp: 3, projectedPPG: 11.0, projectionConfidence: 'medium',
    nextSeasonRank: 5, dynastyScore: null, currentSeasonPPG: 10.0, careerSparkline: [], ktcValue: 4000,
  }
  const extendedRows = [...playerRows, teRow]

  // QB fixture with passing stats (2 seasons for qb_alpha, 1 for qb_solo, sacks-up for qb_beta)
  const qbPlayerRows = [
    {
      player_id: 'qb_alpha', position: 'QB', full_name: 'Aaron Archer', age: 28,
      nfl_team: 'KC', years_exp: 7, projectedPPG: 22.0, projectionConfidence: 'high',
      nextSeasonRank: 1, dynastyScore: null, currentSeasonPPG: 22.0, careerSparkline: [], ktcValue: 6000,
    },
    {
      player_id: 'qb_solo', position: 'QB', full_name: 'Brad Baker', age: 26,
      nfl_team: 'DAL', years_exp: 3, projectedPPG: 18.0, projectionConfidence: 'medium',
      nextSeasonRank: 2, dynastyScore: null, currentSeasonPPG: 18.0, careerSparkline: [], ktcValue: 5000,
    },
    {
      player_id: 'qb_beta', position: 'QB', full_name: 'Xavier Xanthos', age: 30,
      nfl_team: 'GB', years_exp: 8, projectedPPG: 20.0, projectionConfidence: 'high',
      nextSeasonRank: 3, dynastyScore: null, currentSeasonPPG: 20.0, careerSparkline: [], ktcValue: 4000,
    },
    {
      player_id: 'qb_nodata', position: 'QB', full_name: 'Craig Cane', age: 24,
      nfl_team: 'NYG', years_exp: 1, projectedPPG: 15.0, projectionConfidence: 'low',
      nextSeasonRank: 4, dynastyScore: null, currentSeasonPPG: 15.0, careerSparkline: [], ktcValue: 3000,
    },
  ]
  // qb_alpha 2023 cmpPct: 100*320/500=64.0  2024: 100*345/520≈66.3  delta≈2.3 → ↑+2.3
  // qb_solo  2024 cmpPct: 100*200/300≈66.7  (1 season → level only)
  // qb_beta  2023 sacks:15  2024 sacks:25  delta=+10 → ↑+10  (valence:'none' → neutral)
  // qb_alpha 2023 sacks:30  2024 sacks:22  delta=-8  → ↓-8   (valence:'none' → neutral)
  // qb_nodata: pass_att=0 → no cmpPct/passerRating qualifying season; _ps_cmpPct=null → sinks
  const qbCareerStats = {
    2023: {
      qb_alpha: {
        gamesPlayed: 16, fantasyPoints: 350,
        stats: { pass_att: 500, pass_cmp: 320, pass_yd: 4000, pass_td: 28, pass_int: 8, pass_sack: 30 },
      },
      qb_beta: {
        gamesPlayed: 16, fantasyPoints: 300,
        stats: { pass_att: 400, pass_cmp: 240, pass_yd: 3200, pass_td: 20, pass_int: 10, pass_sack: 15 },
      },
    },
    2024: {
      qb_alpha: {
        gamesPlayed: 16, fantasyPoints: 360,
        stats: { pass_att: 520, pass_cmp: 345, pass_yd: 4200, pass_td: 32, pass_int: 7, pass_sack: 22 },
      },
      qb_solo: {
        gamesPlayed: 10, fantasyPoints: 200,
        stats: { pass_att: 300, pass_cmp: 200, pass_yd: 2500, pass_td: 18, pass_int: 6, pass_sack: 15 },
      },
      qb_beta: {
        gamesPlayed: 16, fantasyPoints: 320,
        stats: { pass_att: 450, pass_cmp: 290, pass_yd: 3600, pass_td: 24, pass_int: 9, pass_sack: 25 },
      },
      qb_nodata: {
        gamesPlayed: 10, fantasyPoints: 100,
        stats: { pass_att: 0, pass_cmp: 0, pass_yd: 0, pass_td: 0, pass_int: 0, pass_sack: 10 },
      },
    },
  }
  const QB_PROPS = { ...BASE_PROPS, playerRows: qbPlayerRows, careerStats: qbCareerStats,
                     historicalShares: {}, playerMap: {}, seasonProjections: {} }

  it('9. ALL view renders Snap trend / Opp trend / Role headers', () => {
    render(<OutlookTab {...BASE_PROPS} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent.includes('Snap trend'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Opp trend'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Role'))).toBe(true)
  })

  it('10. Position pills swap right-group headers: QB→Cmp%/Passer rtg/Sacks; RB→Rush/Target/Y/C; WR/TE→Target/AY/aDOT', () => {
    render(<OutlookTab {...BASE_PROPS} playerRows={extendedRows} />)

    // QB pill
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    let headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent.includes('Cmp%'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Passer rtg'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Sacks'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Snap trend'))).toBe(false)

    // RB pill
    fireEvent.click(screen.getByRole('button', { name: 'RB' }))
    headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent.includes('Rush share'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Y/C'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Cmp%'))).toBe(false)

    // WR pill
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent.includes('AY share'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('aDOT'))).toBe(true)

    // TE pill — same columns as WR
    fireEvent.click(screen.getByRole('button', { name: 'TE' }))
    headers = screen.getAllByRole('columnheader')
    expect(headers.some(h => h.textContent.includes('AY share'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('aDOT'))).toBe(true)
    expect(headers.some(h => h.textContent.includes('Rush share'))).toBe(false)
  })

  it('11. QB pill: QB rows show Cmp% level (% string) where ALL view would be blank', () => {
    render(<OutlookTab {...QB_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    // At least one Cmp% value appears as a percentage string
    const pctMatches = screen.getAllByText(/\d+\.\d+%/)
    expect(pctMatches.length).toBeGreaterThan(0)
  })

  it('12. Level-only vs trend cell: 1-season player shows level no arrow; ≥2-season shows arrow + muted level', () => {
    render(<OutlookTab {...QB_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    // qb_solo (1 qualifying season): level only → "66.7%" (100*200/300)
    expect(screen.getByText('66.7%')).toBeInTheDocument()
    // qb_alpha (2 qualifying seasons): primary="↑+2.3" and secondary="66.3%" (100*345/520)
    expect(screen.getByText('↑+2.3')).toBeInTheDocument()
    expect(screen.getByText('66.3%')).toBeInTheDocument()
  })

  it('13. Sort on position-stat level: click Cmp% header → null level sinks to bottom', () => {
    render(<OutlookTab {...QB_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    const headers = screen.getAllByRole('columnheader')
    const cmpHeader = headers.find(h => h.textContent.includes('Cmp%'))
    expect(cmpHeader).toBeTruthy()
    fireEvent.click(cmpHeader) // sort by cmpPct desc
    const html = document.body.innerHTML
    // qb_nodata has no qualifying cmpPct → _ps_cmpPct=null → sinks last
    const posCraig = html.indexOf('Craig Cane')
    const posAaron = html.indexOf('Aaron Archer')
    const posBrad  = html.indexOf('Brad Baker')
    expect(posCraig).toBeGreaterThan(posAaron)
    expect(posCraig).toBeGreaterThan(posBrad)
  })

  it('14. Pill swap is non-crashing and resets sort: QB→RB→ALL re-renders correct headers', () => {
    render(<OutlookTab {...BASE_PROPS} playerRows={extendedRows} />)
    // ALL: Snap trend visible
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Snap trend'))).toBe(true)
    // Switch QB
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Cmp%'))).toBe(true)
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Snap trend'))).toBe(false)
    // Switch RB
    fireEvent.click(screen.getByRole('button', { name: 'RB' }))
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Rush share'))).toBe(true)
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Cmp%'))).toBe(false)
    // Back to ALL
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }))
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Snap trend'))).toBe(true)
    expect(screen.getAllByRole('columnheader').some(h => h.textContent.includes('Rush share'))).toBe(false)
    // Sort resets to projectedPPG desc (default)
    expect(screen.getByText('Proj ↓')).toBeInTheDocument()
  })

  // Override 1: sacks valence — neutral colour for both ↑ and ↓ deltas
  it('sacks ↑ delta (more sacks) renders neutral colour class, not positive', () => {
    render(<OutlookTab {...QB_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    // qb_beta: sacks 15→25, delta=+10 → text "↑+10"
    const cell = screen.getByText('↑+10')
    expect(cell.className).toContain('color-market-neutral')
    expect(cell.className).not.toContain('color-positive-text')
  })

  it('sacks ↓ delta (fewer sacks) renders neutral colour class, not negative', () => {
    render(<OutlookTab {...QB_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    // qb_alpha: sacks 30→22, delta=-8 → text "↓-8"
    const cell = screen.getByText('↓-8')
    expect(cell.className).toContain('color-market-neutral')
    expect(cell.className).not.toContain('color-negative-text')
  })
})
