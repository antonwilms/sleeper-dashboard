// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Market } from './Market'

expect.extend(jestDomMatchers)
afterEach(() => {
  cleanup()
  localStorage.removeItem('market-sort')
  localStorage.removeItem('market-column-set')
  localStorage.removeItem('market-production-season')
  localStorage.removeItem('market-filters')
  localStorage.removeItem('market-filter-presets')
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWeekly(n, val) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), val]))
}

// p1 WR — full data: dynasty score, KTC (undervalued), consistency-eligible, projection.
// p2 RB — dynasty score, KTC (overvalued), consistency-eligible, projection.
// p3 QB — dynasty score, NO ktcValue (the 4th VS MARKET state), consistency-eligible.
// p4 TE — dynastyScore.score null (non-skill-style path), no careerStats at all
//         (computeConsistency === null — the null-OBJECT ±SD case), no projection.
// p5 WR — one qualifying season (gp=8) but only 5 weeklyPoints entries: pooledGames(5) <
//         MIN_POOLED_GAMES(10) → computeConsistency returns a non-null object whose sd is
//         null (the null-sd, non-null-object ±SD case a null-object check alone would miss).
const careerStats = {
  2023: {
    p1: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', stats: { rec_tgt: 90, rec: 60, rec_yd: 800 }, weeklyPoints: makeWeekly(15, 14.0) },
    p2: { gamesPlayed: 15, fantasyPoints: 165, team: 'SF',  stats: { rush_att: 220, rush_yd: 900, rush_td: 6 }, weeklyPoints: makeWeekly(15, 11.0) },
    p3: { gamesPlayed: 16, fantasyPoints: 320, team: 'KC',  stats: { pass_att: 500, pass_cmp: 330, pass_yd: 3800, pass_td: 28 }, weeklyPoints: makeWeekly(16, 20.0) },
  },
  2024: {
    p1: { gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', stats: { rec_tgt: 100, rec: 70, rec_yd: 950 }, weeklyPoints: makeWeekly(16, 16.0) },
    p2: { gamesPlayed: 16, fantasyPoints: 176, team: 'SF',  stats: { rush_att: 240, rush_yd: 1000, rush_td: 8 }, weeklyPoints: makeWeekly(16, 11.0) },
    p3: { gamesPlayed: 17, fantasyPoints: 374, team: 'KC',  stats: { pass_att: 550, pass_cmp: 370, pass_yd: 4200, pass_td: 32 }, weeklyPoints: makeWeekly(17, 22.0) },
    p5: { gamesPlayed: 8, fantasyPoints: 64, team: 'DAL', stats: { rec_tgt: 40, rec: 25, rec_yd: 300 }, weeklyPoints: makeWeekly(5, 12.0) },
  },
}

const playerMap = {
  p1: { player_id: 'p1', position: 'WR', full_name: 'Wide Receiver One', age: 26, years_exp: 4, team: 'DAL' },
  p2: { player_id: 'p2', position: 'RB', full_name: 'Running Back Two', age: 25, years_exp: 3, team: 'SF' },
  p3: { player_id: 'p3', position: 'QB', full_name: 'Quarterback Three', age: 29, years_exp: 6, team: 'KC' },
  p4: { player_id: 'p4', position: 'TE', full_name: 'Tight End Four', age: 23, years_exp: 1, team: 'NYJ' },
  p5: { player_id: 'p5', position: 'WR', full_name: 'Wide Receiver Five', age: 22, years_exp: 0, team: 'DAL' },
}

const playerRows = [
  {
    player_id: 'p1', position: 'WR', full_name: 'Wide Receiver One', age: 26, years_exp: 4, nfl_team: 'DAL',
    dynastyScore: { score: 85, label: 'Elite', confidence: 'high' },
    ktcValue: 8000, divergenceSignal: 'undervalued', divergencePct: 30, dynRank: 2, ktcRank: 6,
    ownerTeamName: 'My Team', currentSeasonPPG: 18.2, projectedPPG: 20.1,
    careerSparkline: [null, null, 10, 14, 16],
  },
  {
    player_id: 'p2', position: 'RB', full_name: 'Running Back Two', age: 25, years_exp: 3, nfl_team: 'SF',
    dynastyScore: { score: 60, label: 'Solid Floor', confidence: 'high' },
    ktcValue: 4000, divergenceSignal: 'overvalued', divergencePct: -30, dynRank: 8, ktcRank: 2,
    ownerTeamName: null, currentSeasonPPG: 11.0, projectedPPG: 10.5,
    careerSparkline: [null, null, 8, 10, 11],
  },
  {
    player_id: 'p3', position: 'QB', full_name: 'Quarterback Three', age: 29, years_exp: 6, nfl_team: 'KC',
    dynastyScore: { score: 70, label: 'Peak Window', confidence: 'high' },
    ktcValue: null, divergenceSignal: null, divergencePct: null, dynRank: null, ktcRank: null,
    ownerTeamName: 'Other Team', currentSeasonPPG: 22.0, projectedPPG: 23.0,
    careerSparkline: [null, null, 18, 20, 22],
  },
  {
    player_id: 'p4', position: 'TE', full_name: 'Tight End Four', age: 23, years_exp: 1, nfl_team: 'NYJ',
    dynastyScore: { score: null, label: 'N/A', confidence: 'none' },
    ktcValue: 2000, divergenceSignal: null, divergencePct: 5, dynRank: null, ktcRank: null,
    ownerTeamName: null, currentSeasonPPG: 0, projectedPPG: null,
    careerSparkline: [null, null, null, null, null],
  },
  {
    player_id: 'p5', position: 'WR', full_name: 'Wide Receiver Five', age: 22, years_exp: 0, nfl_team: 'DAL',
    dynastyScore: { score: 40, label: 'Prospect', confidence: 'prospect' },
    ktcValue: 1500, divergenceSignal: null, divergencePct: 8, dynRank: null, ktcRank: null,
    ownerTeamName: null, currentSeasonPPG: 8.0, projectedPPG: 9.0,
    careerSparkline: [null, null, null, null, 8],
  },
]

const seasonProjections = {
  p1: { projectedPPG: 20.1, projectedGames: 16, confidence: 'high', adjustmentSummary: [] },
  p2: { projectedPPG: 10.5, projectedGames: 15, confidence: 'medium', adjustmentSummary: [] },
  p3: { projectedPPG: 23.0, projectedGames: 17, confidence: 'high', adjustmentSummary: [] },
  p5: { projectedPPG: 9.0, projectedGames: 14, confidence: 'low', adjustmentSummary: [] },
  // p4 intentionally absent — projection === null.
}

const BASE_PROPS = {
  playerRows, loaded: true, careerStats, playerMap, seasonProjections,
  myTeamName: 'My Team', onOpenPlayerDetail: vi.fn(),
}

function renderMarket(overrides = {}) {
  const onOpenPlayerDetail = overrides.onOpenPlayerDetail ?? vi.fn()
  const utils = render(<Market {...BASE_PROPS} {...overrides} onOpenPlayerDetail={onOpenPlayerDetail} />)
  return { ...utils, onOpenPlayerDetail }
}

function makeBulkRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    player_id: `b${i}`, position: 'WR', full_name: `Bulk Player ${String(i).padStart(3, '0')}`,
    age: 25, years_exp: 3, nfl_team: 'DAL',
    dynastyScore: { score: n - i, label: 'Solid Floor', confidence: 'high' },
    ktcValue: null, divergenceSignal: null, divergencePct: null,
    ownerTeamName: null, currentSeasonPPG: 10, projectedPPG: 10,
    careerSparkline: [null, null, null, null, null],
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Market', () => {
  it('mounts without crashing with no props at all', () => {
    render(<Market />)
    expect(screen.getByText('Market')).toBeInTheDocument()
    // loaded defaults to false — the loading notice + loading-state table message, not a crash.
    expect(screen.getByText(/Player data loading in background/)).toBeInTheDocument()
    expect(screen.getByText('Loading player data…')).toBeInTheDocument()
  })

  it('renders the three column sets with their own headers', () => {
    renderMarket()
    expect(screen.getByRole('columnheader', { name: /Dynasty score/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Vs market/ })).toBeInTheDocument()
    expect(screen.getByText('Career PPG')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    expect(screen.getByRole('columnheader', { name: 'Proj ↓' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Signals/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Production' }))
    expect(screen.getByRole('columnheader', { name: /^G/ })).toBeInTheDocument()
  })

  it('position pills filter rows by position', () => {
    renderMarket()
    expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
    expect(screen.getByText('Running Back Two')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.queryByText('Wide Receiver One')).not.toBeInTheDocument()
    expect(screen.getByText('Quarterback Three')).toBeInTheDocument()
  })

  it('Value default sort is dynastyScore.score DESCENDING — best scores first', () => {
    // Rows carry role="button" (§5's keyboard-reachability requirement), which overrides the
    // implicit tr "row" role — query body rows directly rather than via getAllByRole('row').
    const { container } = renderMarket()
    const rows = [...container.querySelectorAll('tbody tr')]
    // p1 (85) > p3 (70) > p2 (60) > p5 (40) > p4 (null, sinks last)
    expect(within(rows[0]).getByText('Wide Receiver One')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Quarterback Three')).toBeInTheDocument()
    expect(within(rows[rows.length - 1]).getByText('Tight End Four')).toBeInTheDocument()
  })

  it('VS MARKET renders all four states: undervalued, overvalued, aligned-with-KTC is not fabricated, and no-KTC "—"', () => {
    renderMarket()
    expect(screen.getByText(/▲ 30% under by rank/)).toBeInTheDocument()
    expect(screen.getByText(/▼ 30% over by rank/)).toBeInTheDocument()
    // p3 has no ktcValue → "—" in both VS MARKET and the raw KTC column, not "≈ aligned" anywhere.
    const p3Row = screen.getByText('Quarterback Three').closest('tr')
    expect(within(p3Row).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(p3Row).queryByText('≈ aligned')).not.toBeInTheDocument()
  })

  // ── Ceiling/Floor + raw KTC (Slice vii follow-up — parity items the Explorer's Value tab has
  // that Market's original Value set lacked: career-finish extremes and the raw market number
  // behind the "Vs market" chip) ────────────────────────────────────────────────────────────
  describe('Ceiling/Floor + KTC (Slice vii follow-up)', () => {
    it('renders "—" for a player with no careerStats at all (p4)', () => {
      renderMarket()
      const p4Row = screen.getByText('Tight End Four').closest('tr')
      expect(within(p4Row).getAllByText('—').length).toBeGreaterThan(0)
    })

    it('picks the best/worst single-season positional finish, tie-broken by points, with the correct rank/season/points/delta', () => {
      renderMarket()
      const p3Row = screen.getByText('Quarterback Three').closest('tr')
      // p3 is QB1 in both fixture seasons (only QB) — ceiling ties on rank, tie-break picks the
      // HIGHER-points season (2024, 374 pts); floor picks the lower (2023, 320 pts). Reference
      // avg for QB rank 1 is (320+374)/2=347, so ceiling delta=+27, floor delta=-27.
      expect(within(p3Row).getAllByText('QB1').length).toBe(2) // both ceiling and floor are QB1 finishes
      expect(within(p3Row).getByText('2024')).toBeInTheDocument()
      expect(within(p3Row).getByText('374')).toBeInTheDocument()
      expect(within(p3Row).getByText('+27')).toBeInTheDocument()
      expect(within(p3Row).getByText('2023')).toBeInTheDocument()
      expect(within(p3Row).getByText('320')).toBeInTheDocument()
      expect(within(p3Row).getByText('-27')).toBeInTheDocument()
    })

    it('renders no delta span when the finish exactly matches the reference average (delta === 0)', () => {
      renderMarket()
      // p5 is WR2 in its only season (2024) — the sole data point for that rank, so refAvg
      // equals its own points and delta is exactly 0. The `delta !== 0` guard must suppress it.
      const p5Row = screen.getByText('Wide Receiver Five').closest('tr')
      expect(within(p5Row).getAllByText('WR2').length).toBe(2) // same season is both ceiling and floor
      expect(within(p5Row).queryByText('+0')).not.toBeInTheDocument()
      expect(within(p5Row).queryByText('-0')).not.toBeInTheDocument()
    })

    it('the raw KTC column renders the locale-formatted value, distinct from the derived "Vs market" chip', () => {
      renderMarket()
      const p1Row = screen.getByText('Wide Receiver One').closest('tr')
      expect(within(p1Row).getByText('8,000')).toBeInTheDocument()
    })

    it('clicking the Ceiling header sorts ascending by default (rank 1 = best) and sinks null-ceiling rows last', () => {
      const { container } = renderMarket()
      fireEvent.click(screen.getByRole('columnheader', { name: /^Ceiling/ }))
      expect(screen.getByRole('columnheader', { name: 'Ceiling ↑' })).toBeInTheDocument()
      const rows = [...container.querySelectorAll('tbody tr')]
      // p4 has no careerStats at all → ceilingRank null → sinks to the bottom regardless of direction.
      expect(within(rows[rows.length - 1]).getByText('Tight End Four')).toBeInTheDocument()
    })
  })

  it('±SD renders "—" for the null-object case (p4, no careerStats) and the null-sd non-null-object case (p5, pooled games < floor)', () => {
    renderMarket()
    const p4Row = screen.getByText('Tight End Four').closest('tr')
    const p4Cells = within(p4Row).getAllByText('—')
    expect(p4Cells.length).toBeGreaterThan(0)

    const p5Row = screen.getByText('Wide Receiver Five').closest('tr')
    const p5Cells = within(p5Row).getAllByText('—')
    expect(p5Cells.length).toBeGreaterThan(0)
  })

  it('row click calls onOpenPlayerDetail with the row player_id', () => {
    const { onOpenPlayerDetail } = renderMarket()
    fireEvent.click(screen.getByText('Wide Receiver One').closest('tr'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('p1')
  })

  it('keyboard activation (Enter) opens the pop-up the same as a click', () => {
    const { onOpenPlayerDetail } = renderMarket()
    fireEvent.keyDown(screen.getByText('Running Back Two').closest('tr'), { key: 'Enter' })
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('p2')
  })

  it('keyboard activation (Space) opens the pop-up', () => {
    const { onOpenPlayerDetail } = renderMarket()
    fireEvent.keyDown(screen.getByText('Quarterback Three').closest('tr'), { key: ' ' })
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('p3')
  })

  it('loaded === false shows the loading notice', () => {
    renderMarket({ loaded: false })
    expect(screen.getByText(/Player data loading in background/)).toBeInTheDocument()
  })

  it('zero rows after filtering shows "No players match your filters."', () => {
    renderMarket({ playerRows: [] })
    expect(screen.getByText('No players match your filters.')).toBeInTheDocument()
  })

  it('pagination arithmetic at a boundary: 55 rows shows 1–50 on page 1, 51–55 on page 2', () => {
    renderMarket({ playerRows: makeBulkRows(55), careerStats: {}, seasonProjections: {} })
    expect(screen.getByText(/1–50 of 55/)).toBeInTheDocument()
    expect(screen.getByText('Bulk Player 000')).toBeInTheDocument()
    expect(screen.queryByText('Bulk Player 050')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/51–55 of 55/)).toBeInTheDocument()
    expect(screen.getByText('Bulk Player 050')).toBeInTheDocument()
    expect(screen.queryByText('Bulk Player 000')).not.toBeInTheDocument()
  })

  // ── §3.4a — the three sort behaviours ─────────────────────────────────────
  describe('sort behaviours (§3.4a)', () => {
    it('1. switching column sets re-asserts the new set\'s default sort and resets page', () => {
      const { container } = renderMarket()
      // Value default is dynastyScoreValue desc — p1 (85) leads.
      let rows = [...container.querySelectorAll('tbody tr')]
      expect(within(rows[0]).getByText('Wide Receiver One')).toBeInTheDocument()

      // Change sort away from the default.
      fireEvent.click(screen.getByRole('columnheader', { name: /Player/ }))

      // Switch to Outlook — must re-assert Outlook's own default (projectedPPG desc), not
      // carry the Player sort forward.
      fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
      expect(screen.getByRole('columnheader', { name: 'Proj ↓' })).toBeInTheDocument()
      rows = [...container.querySelectorAll('tbody tr')]
      // p3 has the highest projectedPPG (23.0).
      expect(within(rows[0]).getByText('Quarterback Three')).toBeInTheDocument()
    })

    it('2. clicking a position pill while Production is active resets sort to games, not Value\'s default', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: 'Production' }))
      // Change sort away from the default (games).
      fireEvent.click(screen.getByRole('columnheader', { name: /Player/ }))
      expect(screen.queryByRole('columnheader', { name: /G ↓/ })).not.toBeInTheDocument()

      // Position pill click must reset to Production's own default (games desc), not
      // dynastyScoreValue (a key Production has no column for).
      fireEvent.click(screen.getByRole('button', { name: 'QB' }))
      expect(screen.getByRole('columnheader', { name: /^G ↓/ })).toBeInTheDocument()
    })

    it('3. a market-sort value naming a column the active set lacks falls back to that set\'s default', () => {
      localStorage.setItem('market-column-set', 'value')
      localStorage.setItem('market-sort', JSON.stringify({ column: 'games', direction: 'desc' }))
      const { container } = renderMarket()
      // Falls back to Value's default (dynastyScoreValue desc) rather than sorting by
      // 'games', which Value has no column for.
      expect(screen.getByRole('columnheader', { name: 'Dynasty score ↓' })).toBeInTheDocument()
      const rows = [...container.querySelectorAll('tbody tr')]
      expect(within(rows[0]).getByText('Wide Receiver One')).toBeInTheDocument()
    })
  })

  // ── Filters (1b Slice vi) ───────────────────────────────────────────────
  describe('filters (1b Slice vi)', () => {
    it('the panel opens via "+ Add filter" and closes via Apply', () => {
      renderMarket()
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    })

    it('a filter narrows the rendered rows', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undervalued' }))

      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()
      expect(screen.queryByText('Quarterback Three')).not.toBeInTheDocument()
    })

    it('the Apply-button count matches the rendered (filtered) row count', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undervalued' }))
      // Only p1 has divergenceSignal === 'undervalued' among the five fixture rows.
      expect(screen.getByRole('button', { name: 'Apply · 1 players' })).toBeInTheDocument()
    })

    it('a pill\'s × clears one dimension and leaves the other active', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'My roster' }))
      fireEvent.click(screen.getByLabelText('Rookies only'))
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))

      expect(screen.getByText('My roster')).toBeInTheDocument()
      expect(screen.getByText('Rookies only')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Clear My roster' }))

      expect(screen.queryByText('My roster')).not.toBeInTheDocument()
      expect(screen.getByText('Rookies only')).toBeInTheDocument()
    })

    it('"Reset all" restores every dimension to default and hides itself', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'My roster' }))
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
      expect(screen.getByText('My roster')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Reset all' }))
      expect(screen.queryByText('My roster')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument()
      // Undoing every filter restores all five rows.
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(screen.getByText('Running Back Two')).toBeInTheDocument()
    })

    it('changing a filter resets page to 1', () => {
      renderMarket({ playerRows: makeBulkRows(55), careerStats: {}, seasonProjections: {} })
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByText(/51–55 of 55/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      // makeBulkRows sets every row's age to 25 — narrowing to [20,30] still keeps all 55 rows,
      // isolating the page-reset behaviour from any row-count change.
      fireEvent.change(screen.getByRole('slider', { name: 'Age minimum' }), { target: { value: '20' } })

      expect(screen.getByText(/1–50 of 55/)).toBeInTheDocument()
    })

    it('header count follows the filters and stops claiming "every asset" once filtered', () => {
      renderMarket()
      expect(screen.getByText('5 players · every asset in the league, owned or not')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undervalued' }))

      expect(screen.getByText('1 of 5 players · 1 filter active')).toBeInTheDocument()
    })
  })

  // ── Search (1b Slice vii §2) ─────────────────────────────────────────────
  describe('search (1b Slice vii)', () => {
    it('narrows the rendered rows by full_name, case-insensitively', () => {
      renderMarket()
      fireEvent.change(screen.getByLabelText('Filter players by name'), { target: { value: 'wide receiver' } })
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(screen.getByText('Wide Receiver Five')).toBeInTheDocument()
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()
    })

    it('renders a pill for an active search and clears it via the pill\'s ×', () => {
      renderMarket()
      fireEvent.change(screen.getByLabelText('Filter players by name'), { target: { value: 'One' } })
      expect(screen.getByText('"One"')).toBeInTheDocument()
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Clear "One"' }))
      expect(screen.queryByText('"One"')).not.toBeInTheDocument()
      expect(screen.getByText('Running Back Two')).toBeInTheDocument()
    })

    it('whitespace-only query filters nothing and shows no pill', () => {
      renderMarket()
      fireEvent.change(screen.getByLabelText('Filter players by name'), { target: { value: '   ' } })
      expect(screen.getByText('Running Back Two')).toBeInTheDocument()
      expect(screen.queryByText(/^"/)).not.toBeInTheDocument()
    })

    it('resets page to 1 on change, like every other filter', () => {
      renderMarket({ playerRows: makeBulkRows(55), careerStats: {}, seasonProjections: {} })
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByText(/51–55 of 55/)).toBeInTheDocument()

      // Every bulk row's full_name contains "Bulk" — narrowing by it keeps all 55 rows, isolating
      // the page-reset behaviour from any row-count change (same trick the age-filter test uses).
      fireEvent.change(screen.getByLabelText('Filter players by name'), { target: { value: 'Bulk' } })
      expect(screen.getByText(/1–50 of 55/)).toBeInTheDocument()
    })

    it('is never persisted to localStorage, though the in-memory value still drives the table (§2, both ends)', () => {
      renderMarket()
      fireEvent.change(screen.getByLabelText('Filter players by name'), { target: { value: 'One' } })
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()

      const stored = JSON.parse(localStorage.getItem('market-filters'))
      expect(stored.search).toBe('')
    })

    it('does not restore a stale non-empty search from localStorage on mount', () => {
      localStorage.setItem('market-filters', JSON.stringify({ search: 'stale query' }))
      renderMarket()
      expect(screen.getByText('Running Back Two')).toBeInTheDocument()
      expect(screen.getByLabelText('Filter players by name')).toHaveValue('')
    })
  })

  // ── Presets (1b Slice vii §3) ────────────────────────────────────────────
  describe('presets (1b Slice vii)', () => {
    const fullDefaultState = {
      startersOnly: false, rookiesOnly: false, ageRange: [18, 45], expRange: [0, 20],
      availability: 'all', nflTeams: [], fantasyTeams: [], dynastyGroups: [],
      marketSignal: 'all', ktcRange: [0, 10000], minProjectedGames: 0, search: '',
    }

    it('save → apply → delete round-trip, under the market-filter-presets key (not explorer-presets)', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undervalued' }))
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))

      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'My preset' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(JSON.parse(localStorage.getItem('market-filter-presets'))).toHaveLength(1)
      expect(localStorage.getItem('explorer-presets')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Reset all' }))
      expect(screen.getByText('Running Back Two')).toBeInTheDocument()

      // The presets dropdown is still open from the save above (saving doesn't close it) — apply
      // straight from it rather than re-toggling, which would close it instead.
      fireEvent.click(screen.getByRole('button', { name: 'My preset' }))
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete My preset' }))
      expect(screen.queryByRole('button', { name: 'My preset' })).not.toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('market-filter-presets'))).toHaveLength(0)
    })

    it('re-saving an existing name works at the 5-preset cap — the Explorer\'s dead end (§0/§3) not reproduced', () => {
      const seeded = ['P1', 'P2', 'P3', 'P4', 'P5'].map(name => ({ name, state: fullDefaultState }))
      localStorage.setItem('market-filter-presets', JSON.stringify(seeded))

      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
      fireEvent.click(screen.getByRole('button', { name: 'Undervalued' }))
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))

      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      // A brand-new name at the cap is disabled — the list is full and this name isn't in it.
      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'P6' } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

      // Re-using an existing name is NOT disabled at the cap.
      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'P3' } })
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const stored = JSON.parse(localStorage.getItem('market-filter-presets'))
      expect(stored).toHaveLength(5)
      expect(stored.find(p => p.name === 'P3').state.marketSignal).toBe('undervalued')
    })

    it('a preset failing isRestorableFilters is dropped at mount, not offered for apply', () => {
      localStorage.setItem('market-filter-presets', JSON.stringify([
        { name: 'Bad', state: { ageRange: ['18', '45'] } },
        { name: 'Good', state: { ...fullDefaultState, marketSignal: 'undervalued' } },
      ]))
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      expect(screen.queryByRole('button', { name: 'Bad' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Good' })).toBeInTheDocument()
    })

    it('applying a preset does not restore search, even when the saved state carried one', () => {
      localStorage.setItem('market-filter-presets', JSON.stringify([
        { name: 'WithSearch', state: { ...fullDefaultState, marketSignal: 'undervalued', search: 'leftover query' } },
      ]))
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      fireEvent.click(screen.getByRole('button', { name: 'WithSearch' }))

      expect(screen.getByLabelText('Filter players by name')).toHaveValue('')
      // The rest of the preset's state DID apply — only search was excluded.
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(screen.queryByText('Running Back Two')).not.toBeInTheDocument()
    })

    it('the Presets control still renders when presets exist but no filter is currently active', () => {
      localStorage.setItem('market-filter-presets', JSON.stringify([{ name: 'Saved', state: fullDefaultState }]))
      renderMarket()
      expect(screen.queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Presets/ })).toBeInTheDocument()
    })
  })
})
