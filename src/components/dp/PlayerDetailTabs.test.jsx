// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailTabs } from './PlayerDetailTabs'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// jsdom implements neither IntersectionObserver nor Element.scrollIntoView — this file mounts
// PlayerDetailModal (the active tab's body), which uses both for its section-index highlight/
// scroll mechanism (dp-v2 Slice 3, task file §5/§7). Stub both here too, or the failure looks
// unrelated to this file.
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  disconnect() {}
})
Element.prototype.scrollIntoView = vi.fn()

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWeekly(n, values) {
  // values: single number (repeated) or an array cycled to length n.
  const arr = Array.isArray(values) ? values : Array.from({ length: n }, () => values)
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), arr[i % arr.length]]))
}

// p1 vs p2: p1 wins every metric (both higher-is-better and lower-is-better), so the matrix
// exercises both directions against a single deterministic winner/loser pair.
// p1: sd=0 (constant weeklyPoints, pooled variance 0) — best (lowest) Consistency.
// p2: sd=10 (alternating 4/24) — worst.
const careerStats = {
  2023: {
    p1: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) },
    p2: { gamesPlayed: 15, fantasyPoints: 210, team: 'SF', weeklyPoints: makeWeekly(15, [4.0, 24.0]) },
  },
  2024: {
    p1: { gamesPlayed: 16, fantasyPoints: 224, team: 'DAL', weeklyPoints: makeWeekly(16, 14.0) },
    p2: { gamesPlayed: 16, fantasyPoints: 224, team: 'SF', weeklyPoints: makeWeekly(16, [4.0, 24.0]) },
  },
}

const playersMap = {
  p1: { player_id: 'p1', position: 'WR', full_name: 'Player One', age: 24, years_exp: 3, team: 'DAL' },
  p2: { player_id: 'p2', position: 'RB', full_name: 'Player Two', age: 29, years_exp: 7, team: 'SF' },
  p3: { player_id: 'p3', position: 'QB', full_name: 'Player Three', age: 30, years_exp: 8, team: 'KC' },
  p4: { player_id: 'p4', position: 'WR', full_name: 'Player Four', age: 26, years_exp: 4, team: 'NYJ' },
  p5: { player_id: 'p5', position: 'RB', full_name: 'Player Five', age: 27, years_exp: 5, team: 'LAR' },
  s1: { player_id: 's1', position: 'WR', full_name: 'Suggest One', age: 23, years_exp: 1, team: 'MIA' },
  s2: { player_id: 's2', position: 'RB', full_name: 'Suggest Two', age: 24, years_exp: 2, team: 'BUF' },
  s3: { player_id: 's3', position: 'WR', full_name: 'Suggest Three', age: 25, years_exp: 3, team: 'CIN' },
  s4: { player_id: 's4', position: 'TE', full_name: 'Suggest Four', age: 26, years_exp: 4, team: 'PHI' },
  s5: { player_id: 's5', position: 'QB', full_name: 'Suggest Five', age: 27, years_exp: 5, team: 'DET' },
  s6: { player_id: 's6', position: 'WR', full_name: 'Suggest Six', age: 28, years_exp: 6, team: 'SEA' },
}

function row(id, overrides) {
  return {
    player_id: id, position: playersMap[id].position, full_name: playersMap[id].full_name,
    age: playersMap[id].age, nfl_team: playersMap[id].team, years_exp: playersMap[id].years_exp,
    ownerTeamName: null,
    ...overrides,
  }
}

const playerRows = [
  row('p1', { dynastyScore: { score: 80, label: 'Elite', signals: {} }, ktcValue: 5000, currentSeasonPPG: 15, projectedPPG: 18 }),
  row('p2', { dynastyScore: { score: 60, label: 'Solid Floor', signals: {} }, ktcValue: 3000, currentSeasonPPG: 10, projectedPPG: 12 }),
  // p3 deliberately has no ktcValue field at all — the "missing value" case.
  row('p3', { dynastyScore: { score: 50, label: 'Plateau', signals: {} }, currentSeasonPPG: 8, projectedPPG: 9 }),
  // p4 / p5 tie on dynastyScore.score — the all-tie case.
  row('p4', { dynastyScore: { score: 55, label: 'Plateau', signals: {} }, ktcValue: 2000, currentSeasonPPG: 9, projectedPPG: 10 }),
  row('p5', { dynastyScore: { score: 55, label: 'Plateau', signals: {} }, ktcValue: 2500, currentSeasonPPG: 11, projectedPPG: 13 }),
  // Suggestion pool — none open by default, descending dynasty score.
  row('s1', { dynastyScore: { score: 90, label: 'Elite', signals: {} } }),
  row('s2', { dynastyScore: { score: 85, label: 'Elite', signals: {} } }),
  row('s3', { dynastyScore: { score: 75, label: 'Peak Window', signals: {} } }),
  row('s4', { dynastyScore: { score: 70, label: 'Peak Window', signals: {} } }),
  row('s5', { dynastyScore: { score: 65, label: 'Solid Floor', signals: {} } }),
  row('s6', { dynastyScore: { score: 60, label: 'Solid Floor', signals: {} } }),
]

const seasonProjections = {
  p1: { projectedPPG: 18, projectedGames: 16, confidence: 'high', adjustmentSummary: [] },
  p2: { projectedPPG: 12, projectedGames: 14, confidence: 'medium', adjustmentSummary: [] },
  p3: { projectedPPG: 9, projectedGames: 13, confidence: 'medium', adjustmentSummary: [] },
  p4: { projectedPPG: 10, projectedGames: 12, confidence: 'low', adjustmentSummary: [] },
  p5: { projectedPPG: 13, projectedGames: 15, confidence: 'medium', adjustmentSummary: [] },
}

const positionPeakPPG = { WR: 20, RB: 18, TE: 14, QB: 24 }

const baseContextValue = {
  careerStats,
  playersMap,
  playerRows,
  positionPeakPPG,
  ktcMap: new Map(),
  historicalShares: {},
  collegeStats: {},
  seasonProjections,
  enrichmentMap: {},
  advStats: { byId: {}, year: 2025 },
}

function renderTabs(overrides = {}) {
  const props = {
    tabs: ['p1'],
    activeTab: 'p1',
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseAll: vi.fn(),
    onOpenPlayerDetail: vi.fn(),
    myTeamName: null,
    ...overrides,
  }
  const utils = render(
    <ProfileDataContext.Provider value={baseContextValue}>
      <PlayerDetailTabs {...props} />
    </ProfileDataContext.Provider>
  )
  return { ...utils, props }
}

// ---------------------------------------------------------------------------
// Shell behaviour (relocated from PlayerDetailModal.test.jsx, 1b Slice v)
// ---------------------------------------------------------------------------
describe('shell behaviour', () => {
  it('onCloseAll fires on scrim click', () => {
    const onCloseAll = vi.fn()
    const { container } = renderTabs({ onCloseAll })
    fireEvent.click(container.querySelector('.z-40'))
    expect(onCloseAll).toHaveBeenCalledTimes(1)
  })

  it('onCloseAll fires on Escape', () => {
    const onCloseAll = vi.fn()
    renderTabs({ onCloseAll })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseAll).toHaveBeenCalledTimes(1)
  })

  it('onCloseAll fires on the shell\'s own close button', () => {
    const onCloseAll = vi.fn()
    renderTabs({ onCloseAll })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCloseAll).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------
describe('tab strip', () => {
  it('clicking a tab calls onSelectTab with its player_id', () => {
    const onSelectTab = vi.fn()
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1', onSelectTab })
    fireEvent.click(within(screen.getByTestId('tab-p2')).getByText('Player Two'))
    expect(onSelectTab).toHaveBeenCalledWith('p2')
  })

  it('clicking a tab\'s × calls onCloseTab with its player_id', () => {
    const onCloseTab = vi.fn()
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1', onCloseTab })
    fireEvent.click(within(screen.getByTestId('tab-p2')).getByRole('button', { name: 'Close Player Two' }))
    expect(onCloseTab).toHaveBeenCalledWith('p2')
  })

  it('renders the active tab\'s body (PlayerDetailModal) for activeTab, not the others', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    expect(screen.getByTestId('tile-dynasty').textContent).toContain('80')
  })
})

// ---------------------------------------------------------------------------
// Compare matrix
// ---------------------------------------------------------------------------
describe('compare matrix', () => {
  it('is absent with only 1 tab open', () => {
    renderTabs({ tabs: ['p1'], activeTab: 'p1' })
    expect(screen.queryByText('COMPARE')).not.toBeInTheDocument()
  })

  it('appears with 2 tabs open', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    expect(screen.getByText('COMPARE')).toBeInTheDocument()
  })

  // Rows are [label td, tab-1 td, tab-2 td, ...] — drop the label cell before indexing.
  function valueCells(label) {
    const tr = screen.getByText(label).closest('tr')
    return within(tr).getAllByRole('cell').slice(1)
  }

  it('higher-is-better metric colours the higher value up, the lower value down', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    const cells = valueCells('Dynasty score')
    expect(cells[0].textContent).toBe('80')
    expect(cells[0].className).toContain('text-dp-up-text')
    expect(cells[1].textContent).toBe('60')
    expect(cells[1].className).toContain('text-dp-down-text')
  })

  it('lower-is-better metric (Age) colours the LOWER value up, the higher value down', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    const cells = valueCells('Age')
    expect(cells[0].textContent).toBe('24')
    expect(cells[0].className).toContain('text-dp-up-text')
    expect(cells[1].textContent).toBe('29')
    expect(cells[1].className).toContain('text-dp-down-text')
  })

  it('lower-is-better metric (Consistency) colours the lower ±sd up, the higher ±sd down', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    const cells = valueCells('Consistency')
    expect(cells[0].textContent).toBe('±0.0')
    expect(cells[0].className).toContain('text-dp-up-text')
    expect(cells[1].textContent).toBe('±10.0')
    expect(cells[1].className).toContain('text-dp-down-text')
  })

  it('an all-tie row renders every cell neutral (text-strong), not up/down', () => {
    renderTabs({ tabs: ['p4', 'p5'], activeTab: 'p4' })
    const cells = valueCells('Dynasty score')
    expect(cells[0].textContent).toBe('55')
    expect(cells[0].className).toContain('text-dp-text-strong')
    expect(cells[1].textContent).toBe('55')
    expect(cells[1].className).toContain('text-dp-text-strong')
  })

  it('a missing value renders "—" in muted, and is excluded from min/max (the sole real value does not "win")', () => {
    renderTabs({ tabs: ['p1', 'p3'], activeTab: 'p1' })
    const cells = valueCells('Market value')
    // p1 has ktcValue; p3 does not.
    expect(cells[1].textContent).toBe('—')
    expect(cells[1].className).toContain('text-dp-muted')
    // p1's cell must not be coloured a winner against a value that was never really compared.
    expect(cells[0].textContent).toBe('5,000')
    expect(cells[0].className).toContain('text-dp-text-strong')
    expect(cells[0].className).not.toContain('text-dp-up-text')
  })

  it('Games proj. is sourced from seasonProjections[id], not a row field (§4.0)', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    const cells = valueCells('Games proj.')
    expect(cells[0].textContent).toBe('16')
    expect(cells[1].textContent).toBe('14')
  })

  it('renders exactly seven rows (no Risk row)', () => {
    renderTabs({ tabs: ['p1', 'p2'], activeTab: 'p1' })
    const labels = ['Dynasty score', 'Market value', 'Age', 'PPG now', 'PPG next', 'Games proj.', 'Consistency']
    for (const label of labels) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText('Risk')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// "+ Add player to compare" dropdown
// ---------------------------------------------------------------------------
describe('add-player dropdown', () => {
  it('the identity row\'s Compare button opens the dropdown', () => {
    renderTabs({ tabs: ['p1'], activeTab: 'p1' })
    expect(screen.queryByText('Suggest One')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByText('Suggest One')).toBeInTheDocument()
  })

  it('suggestions are the top 5 by dynasty score, excluding already-open tabs', () => {
    renderTabs({ tabs: ['p1'], activeTab: 'p1' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add player to compare' }))
    const dropdown = within(screen.getByTestId('compare-dropdown'))
    // s1..s5 (scores 90,85,75,70,65) rank above s6 (60) and p1 is excluded by being open.
    expect(dropdown.getByText('Suggest One')).toBeInTheDocument()
    expect(dropdown.getByText('Suggest Five')).toBeInTheDocument()
    expect(dropdown.queryByText('Suggest Six')).not.toBeInTheDocument()
    expect(dropdown.queryByText('Player One')).not.toBeInTheDocument()
  })

  it('picking a suggestion calls onOpenPlayerDetail with its player_id and closes the dropdown', () => {
    const onOpenPlayerDetail = vi.fn()
    renderTabs({ tabs: ['p1'], activeTab: 'p1', onOpenPlayerDetail })
    fireEvent.click(screen.getByRole('button', { name: '+ Add player to compare' }))
    fireEvent.click(screen.getByText('Suggest One'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('s1')
    expect(screen.queryByText('Suggest Two')).not.toBeInTheDocument()
  })

  it('the dropdown stays visible at the 4-tab cap', () => {
    renderTabs({ tabs: ['p1', 'p2', 'p4', 'p5'], activeTab: 'p1' })
    expect(screen.getByRole('button', { name: '+ Add player to compare' })).toBeInTheDocument()
  })

  it('Escape closes the dropdown WITHOUT closing the pop-up; a second Escape then closes the pop-up', () => {
    const onCloseAll = vi.fn()
    renderTabs({ tabs: ['p1'], activeTab: 'p1', onCloseAll })
    fireEvent.click(screen.getByRole('button', { name: '+ Add player to compare' }))
    expect(screen.getByText('Suggest One')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Suggest One')).not.toBeInTheDocument()
    expect(onCloseAll).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseAll).toHaveBeenCalledTimes(1)
  })
})
