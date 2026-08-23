// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Market } from './Market'
import * as environmentModule from '../../utils/environment'

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

  it('renders the four column sets with their own headers', () => {
    renderMarket()
    expect(screen.getByRole('columnheader', { name: /Dynasty score/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Vs market/ })).toBeInTheDocument()
    expect(screen.getByText('Career PPG')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    expect(screen.getByRole('columnheader', { name: 'Proj ↓' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Signals/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volume' }))
    expect(screen.getByRole('columnheader', { name: /^G/ })).toBeInTheDocument()

    // Efficiency (dp-v2 5b) — its own describe block below covers per-position column shapes
    // in depth; this is just proof the fourth set has a real, distinct header (ALL/WR here).
    fireEvent.click(screen.getByRole('button', { name: 'Efficiency' }))
    expect(screen.getByRole('columnheader', { name: /Target share/ })).toBeInTheDocument()
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

    it('2. clicking a position pill while Volume is active resets sort to games, not Value\'s default', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: 'Volume' }))
      // Change sort away from the default (games).
      fireEvent.click(screen.getByRole('columnheader', { name: /Player/ }))
      expect(screen.queryByRole('columnheader', { name: /G ↓/ })).not.toBeInTheDocument()

      // Position pill click must reset to Volume's own default (games desc), not
      // dynastyScoreValue (a key Volume has no column for).
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

  // ── Column-set rename & migration (dp-v2 Slice 5a §2) ───────────────────
  describe('column-set rename & migration (dp-v2 5a §2)', () => {
    it('a stored "production" column-set migrates to "volume" and is written back', () => {
      localStorage.setItem('market-column-set', 'production')
      renderMarket()
      // The Volume-only "G" header is proof we land on Volume, not Value.
      expect(screen.getByRole('columnheader', { name: /^G/ })).toBeInTheDocument()
      expect(localStorage.getItem('market-column-set')).toBe('volume')
    })

    it('an unrecognised stored value still falls back to Value', () => {
      localStorage.setItem('market-column-set', 'bogus')
      renderMarket()
      expect(screen.getByRole('columnheader', { name: /Dynasty score/ })).toBeInTheDocument()
    })
  })

  // ── TREND gutter (dp-v2 Slice 5a §4) ─────────────────────────────────────
  describe('TREND gutter (dp-v2 5a §4)', () => {
    const ktcHistory = {
      series: {
        p1: [
          { date: '2026-05-18', value: 7500, positionRank: 3, valueVsPosMedian: 1.10 },
          { date: '2026-06-01', value: 7650, positionRank: 3, valueVsPosMedian: 1.12 },
          { date: '2026-06-15', value: 7750, positionRank: 2, valueVsPosMedian: 1.15 },
          { date: '2026-07-01', value: 7900, positionRank: 2, valueVsPosMedian: 1.18 },
          { date: '2026-08-17', value: 8000, positionRank: 2, valueVsPosMedian: 1.20 },
        ],
        p2: [
          { date: '2026-08-03', value: 4100, positionRank: 10, valueVsPosMedian: 0.90 },
          { date: '2026-08-17', value: 4000, positionRank: 11, valueVsPosMedian: 0.88 },
        ],
      },
    }
    const seasonProjectionsWithTrend = {
      ...seasonProjections,
      p1: { ...seasonProjections.p1, factors: { ktcHistDelta: 500, ktcHistWindowSpanDays: 91, ktcHistConfidence: 'high' } },
      p2: { ...seasonProjections.p2, factors: { ktcHistDelta: -100, ktcHistWindowSpanDays: 14, ktcHistConfidence: 'low' } },
      // p3/p5 keep the base fixture's factors-less projections — no ktcHist* factors at all,
      // which is the 'none'/em-dash case (distinct from p2's short-but-present 'low' series).
    }

    it('renders under all three column sets and is sortable from each', () => {
      renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })
      expect(screen.getByRole('columnheader', { name: /Trend/ })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      expect(screen.getByRole('columnheader', { name: 'Trend ↓' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
      expect(screen.getByRole('columnheader', { name: /Trend/ })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      expect(screen.getByRole('columnheader', { name: 'Trend ↓' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Volume' }))
      expect(screen.getByRole('columnheader', { name: /Trend/ })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      expect(screen.getByRole('columnheader', { name: 'Trend ↓' })).toBeInTheDocument()
    })

    it('a healthy series shows a sparkline + signed delta + window; a short/low-band series shows delta+window with no sparkline; no signal at all shows "—"', () => {
      renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })

      // p1 — high band: real bars (mapped from the object-shaped series) + delta + a week-labelled window.
      const p1Row = screen.getByText('Wide Receiver One').closest('tr')
      const p1TrendCell = p1Row.querySelectorAll('td')[1]
      expect(within(p1TrendCell).getByText('▲ 500')).toBeInTheDocument()
      expect(within(p1TrendCell).getByText('13w')).toBeInTheDocument()
      expect(p1TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(5)

      // p2 — low band: delta + window render, but the series is suppressed (no sparkline bars).
      const p2Row = screen.getByText('Running Back Two').closest('tr')
      const p2TrendCell = p2Row.querySelectorAll('td')[1]
      expect(within(p2TrendCell).getByText('▼ 100')).toBeInTheDocument()
      expect(within(p2TrendCell).getByText('2w')).toBeInTheDocument()
      expect(p2TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(0)

      // p3 — no ktcHist* factors at all: band 'none', renders only "—".
      const p3Row = screen.getByText('Quarterback Three').closest('tr')
      const p3TrendCell = p3Row.querySelectorAll('td')[1]
      expect(within(p3TrendCell).getByText('—')).toBeInTheDocument()
      expect(p3TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(0)
    })

    it('sorting by TREND orders on delta with nulls last', () => {
      const { container } = renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      const rows = [...container.querySelectorAll('tbody tr')]
      // p1 (+500) > p2 (-100) > p3/p4/p5 (no delta, sink last regardless of direction).
      expect(within(rows[0]).getByText('Wide Receiver One')).toBeInTheDocument()
    })

    it('TREND sorts within the Volume set too — the _avg branch that previously returned early on every other key', () => {
      const { container } = renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })
      fireEvent.click(screen.getByRole('button', { name: 'Volume' }))
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      const rows = [...container.querySelectorAll('tbody tr')]
      expect(within(rows[0]).getByText('Wide Receiver One')).toBeInTheDocument()
    })

    it('ktcHistory === null renders "—" without throwing', () => {
      renderMarket({ ktcHistory: null })
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      const p1Row = screen.getByText('Wide Receiver One').closest('tr')
      expect(within(p1Row.querySelectorAll('td')[1]).getByText('—')).toBeInTheDocument()
    })

    it('ktcHistory resolving to an empty series ({series: {}}) renders "—" without throwing', () => {
      renderMarket({ ktcHistory: { series: {} } })
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      const p1Row = screen.getByText('Wide Receiver One').closest('tr')
      expect(within(p1Row.querySelectorAll('td')[1]).getByText('—')).toBeInTheDocument()
    })
  })

  // ── UsageTrendCell rename (dp-v2 Slice 5a §4.4) ──────────────────────────
  describe('UsageTrendCell rename (dp-v2 5a §4.4)', () => {
    it('Outlook set\'s Snap/Opp trend cells render exactly as before the rename', () => {
      renderMarket()
      fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
      expect(screen.getByRole('columnheader', { name: /Snap trend/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Opp trend/ })).toBeInTheDocument()
      // No fixture row carries qualifying snap/share history, so both cells render the same "—"
      // fallback they rendered before the rename — a rename must not change that.
      const p1Row = screen.getByText('Wide Receiver One').closest('tr')
      expect(within(p1Row).getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  // ── Efficiency column set (dp-v2 Slice 5b) ───────────────────────────────
  describe('Efficiency column set (dp-v2 5b)', () => {
    const dataSeason = 2025

    const effCareerStats = {
      [dataSeason]: {
        qb1: { gamesPlayed: 10, fantasyPoints: 220, team: 'KC', stats: { pass_att: 300, pass_sack: 20, pass_air_yd: 2400 } },
        qb2: { gamesPlayed: 1, fantasyPoints: 0, team: 'KC', stats: {} }, // no passing stats at all
        rb1: { gamesPlayed: 10, fantasyPoints: 150, team: 'SF', stats: { rush_att: 180, rush_yac: 380, rush_btkl: 12 } },
        wr1: { gamesPlayed: 10, fantasyPoints: 170, team: 'DAL', stats: { rec_tgt: 90, rec: 60, rec_yd: 800, rec_air_yd: 700, rec_drop: 5 } },
        wr2: { gamesPlayed: 5, fantasyPoints: 40, team: 'DAL', stats: { rec_tgt: 20, rec: 15, rec_yd: 150, rec_air_yd: 100 } }, // gp<8
      },
    }

    const effPlayerMap = {
      qb1: { player_id: 'qb1', position: 'QB', full_name: 'Test Quarterback', age: 27, years_exp: 5, team: 'KC' },
      qb2: { player_id: 'qb2', position: 'QB', full_name: 'Backup Quarterback', age: 24, years_exp: 1, team: 'KC' },
      rb1: { player_id: 'rb1', position: 'RB', full_name: 'Test Runningback', age: 24, years_exp: 3, team: 'SF' },
      wr1: { player_id: 'wr1', position: 'WR', full_name: 'Test Receiver', age: 25, years_exp: 3, team: 'DAL' },
      wr2: { player_id: 'wr2', position: 'WR', full_name: 'Bench Receiver', age: 23, years_exp: 1, team: 'DAL' },
    }

    function effRow(id, position, team) {
      return {
        player_id: id, position, full_name: effPlayerMap[id].full_name, age: effPlayerMap[id].age,
        years_exp: effPlayerMap[id].years_exp, nfl_team: team,
        dynastyScore: { score: 70, label: 'Solid', confidence: 'high' }, ktcValue: 5000,
        ownerTeamName: null, currentSeasonPPG: 10, projectedPPG: 10, careerSparkline: [null, null, null, null, 10],
      }
    }
    const effPlayerRows = [
      effRow('qb1', 'QB', 'KC'), effRow('qb2', 'QB', 'KC'), effRow('rb1', 'RB', 'SF'),
      effRow('wr1', 'WR', 'DAL'), effRow('wr2', 'WR', 'DAL'),
    ]

    const effSeasonProjections = Object.fromEntries(
      effPlayerRows.map(r => [r.player_id, { projectedPPG: 10, projectedGames: 16, confidence: 'high', adjustmentSummary: [] }])
    )

    // QB CPOE fixture: one low-attempt/high-CPOE game, one high-attempt/low-CPOE game — the
    // attempt-weighted answer must differ from the arithmetic mean (dp-v2 5b §3.1). A POST game
    // with a much larger stat line proves REG-only filtering (if it leaked in, EPA/ATT would be
    // far higher than the REG-only value asserted below). REG attempts sum to exactly
    // MIN_PASS_ATTEMPTS (100) so qb1 clears the denominator floor and still renders a real value.
    const gameLogsByYear = {
      [dataSeason]: {
        complete: true,
        players: {
          qb1: {
            games: [
              { week: 1, seasonType: 'REG', team: 'KC', attempts: 5, passingEpa: 2, passingCpoe: 40, rushingEpa: 1 },
              { week: 2, seasonType: 'REG', team: 'KC', attempts: 95, passingEpa: 3, passingCpoe: 2, rushingEpa: 0.5 },
              { week: 1, seasonType: 'POST', team: 'KC', attempts: 50, passingEpa: 100, passingCpoe: 99, rushingEpa: 50 },
            ],
          },
          rb1: {
            games: [
              { week: 1, seasonType: 'REG', team: 'SF', carries: 15, rushingEpa: 3 },
              { week: 2, seasonType: 'REG', team: 'SF', carries: 10, rushingEpa: 1 },
            ],
          },
          wr1: {
            games: [
              { week: 1, seasonType: 'REG', team: 'DAL', targets: 8, receivingEpa: 2 },
              { week: 2, seasonType: 'REG', team: 'DAL', targets: 6, receivingEpa: 1 },
            ],
          },
        },
      },
    }

    const teamContextByYear = {
      [dataSeason]: {
        complete: true,
        teams: { SF: { games: [
          { week: 1, seasonType: 'REG', off: { rushPlays: 25 } },
          { week: 2, seasonType: 'REG', off: { rushPlays: 20 } },
        ] } },
      },
    }

    const advStats = { complete: true, byId: { wr1: { racr: 1.15 } } }

    function renderEfficiency(overrides = {}) {
      return renderMarket({
        careerStats: effCareerStats, playerMap: effPlayerMap, playerRows: effPlayerRows,
        seasonProjections: effSeasonProjections, gameLogsByYear, teamContextByYear,
        historicalTeamTotals: {}, advStats, ...overrides,
      })
    }

    function goToEfficiency(position) {
      fireEvent.click(screen.getByRole('button', { name: 'Efficiency' }))
      if (position) fireEvent.click(screen.getByRole('button', { name: position }))
    }

    it('QB renders EPA/ATT · CPOE · Sack% · AY/ATT · Rush EPA, and never Target share', () => {
      renderEfficiency()
      goToEfficiency('QB')
      expect(screen.getByRole('columnheader', { name: /EPA\/ATT/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /CPOE/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Sack%/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /AY\/ATT/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Rush EPA/ })).toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /Target share/ })).not.toBeInTheDocument()
    })

    it('WR never renders CPOE, and shows its own distinct column set', () => {
      renderEfficiency()
      goToEfficiency('WR')
      expect(screen.queryByRole('columnheader', { name: /CPOE/ })).not.toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Target share/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Air yards share/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /RACR/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Drops/ })).toBeInTheDocument()
    })

    it('CPOE is attempt-weighted, not the arithmetic mean, and EPA/ATT sums components (REG only) before dividing', () => {
      renderEfficiency()
      goToEfficiency('QB')
      const row = screen.getByText('Test Quarterback').closest('tr')

      const weighted = (40 * 5 + 2 * 95) / (5 + 95)
      const arithmeticMean = (40 + 2) / 2
      expect(within(row).getByText(`+${weighted.toFixed(1)}pp`)).toBeInTheDocument()
      expect(within(row).queryByText(`+${arithmeticMean.toFixed(1)}pp`)).not.toBeInTheDocument()

      // REG only — if the POST game (epa=100/att=50) had leaked in, this would read ~0.7, not ~0.05.
      const epaPerAtt = (2 + 3) / (5 + 95)
      expect(within(row).getByText(epaPerAtt.toFixed(2))).toBeInTheDocument()
    })

    // A 3-attempt backup with a real, high CPOE — well below MIN_PASS_ATTEMPTS. Shared by the two
    // floor tests below (the "—" render check and the sort check are two assertions on one fixture).
    function withFlooredBackupQb3() {
      const qb3PlayerMap = { player_id: 'qb3', position: 'QB', full_name: 'Third String', age: 22, years_exp: 0, team: 'KC' }
      return {
        careerStats: {
          ...effCareerStats,
          [dataSeason]: {
            ...effCareerStats[dataSeason],
            qb3: { gamesPlayed: 1, fantasyPoints: 8, team: 'KC', stats: { pass_att: 3, pass_sack: 0, pass_air_yd: 30 } },
          },
        },
        playerMap: { ...effPlayerMap, qb3: qb3PlayerMap },
        playerRows: [
          ...effPlayerRows,
          {
            player_id: 'qb3', position: 'QB', full_name: qb3PlayerMap.full_name, age: qb3PlayerMap.age,
            years_exp: qb3PlayerMap.years_exp, nfl_team: 'KC',
            dynastyScore: { score: 40, label: 'Depth', confidence: 'low' }, ktcValue: 500,
            ownerTeamName: null, currentSeasonPPG: 2, projectedPPG: 2, careerSparkline: [null, null, null, null, 2],
          },
        ],
        seasonProjections: { ...effSeasonProjections, qb3: { projectedPPG: 2, projectedGames: 16, confidence: 'low', adjustmentSummary: [] } },
        gameLogsByYear: {
          [dataSeason]: {
            ...gameLogsByYear[dataSeason],
            players: {
              ...gameLogsByYear[dataSeason].players,
              // 3 attempts at CPOE +29pp — without the floor this outranks qb1's 100-attempt, +3.9pp season.
              qb3: { games: [{ week: 1, seasonType: 'REG', team: 'KC', attempts: 3, passingEpa: 3, passingCpoe: 29 }] },
            },
          },
        },
      }
    }

    it('EPA/ATT and CPOE render "—" for a QB below the pass-attempt denominator floor, even with real passing stats (§2/§3 denominator floors)', () => {
      renderEfficiency(withFlooredBackupQb3())
      goToEfficiency('QB')
      const row = screen.getByText('Third String').closest('tr')
      expect(within(row).queryByText(/\+29\.0pp/)).not.toBeInTheDocument()
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2) // EPA/ATT and CPOE
    })

    it('a low-attempt backup with a real (floored) CPOE sorts below a starter who clears the floor, not above it', () => {
      const { container } = renderEfficiency(withFlooredBackupQb3())
      goToEfficiency('QB')
      fireEvent.click(screen.getByRole('columnheader', { name: /CPOE/ }))
      expect(screen.getByRole('columnheader', { name: 'CPOE ↓' })).toBeInTheDocument()
      const rows = [...container.querySelectorAll('tbody tr')]
      expect(within(rows[0]).getByText('Test Quarterback')).toBeInTheDocument()
      // The floored backup (null CPOE) sinks with the other null rows, never sorting to the top.
      expect(within(rows[0]).queryByText('Third String')).not.toBeInTheDocument()
    })

    it('zero/absent denominators render "—", never "0"', () => {
      renderEfficiency()
      goToEfficiency('QB')
      const row = screen.getByText('Backup Quarterback').closest('tr')
      // EPA/ATT, CPOE, Sack%, AY/ATT, Rush EPA — no passing/gamelogs data at all for qb2.
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(4)
      expect(within(row).queryByText('0')).not.toBeInTheDocument()
      expect(within(row).queryByText('0%')).not.toBeInTheDocument()
    })

    it('CARRY SH joins gamelogs carries against teamcontext off.rushPlays, matched by (team, week)', () => {
      renderEfficiency()
      goToEfficiency('RB')
      const row = screen.getByText('Test Runningback').closest('tr')
      const carrySh = (15 + 10) / (25 + 20)
      expect(within(row).getByText(`${(carrySh * 100).toFixed(1)}%`)).toBeInTheDocument()
      const rushEpaPerAtt = (3 + 1) / (15 + 10)
      expect(within(row).getByText(rushEpaPerAtt.toFixed(2))).toBeInTheDocument()
      expect(within(row).getByText('380')).toBeInTheDocument() // YAC, season total
      expect(within(row).getByText('12')).toBeInTheDocument()  // BTKL, season total
    })

    it('RACR renders from advStats for WR, gated on complete (not key presence)', () => {
      renderEfficiency()
      goToEfficiency('WR')
      const row = screen.getByText('Test Receiver').closest('tr')
      expect(within(row).getByText('1.15')).toBeInTheDocument()
    })

    it('advStats gating — complete:false and byId:null both render "—", not a crash', () => {
      renderEfficiency({ advStats: { complete: false, byId: null } })
      goToEfficiency('WR')
      const row = screen.getByText('Test Receiver').closest('tr')
      expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
    })

    it('Target/air-yards share and aDOT populate once a player reaches 8 games this season', () => {
      renderEfficiency()
      goToEfficiency('WR')
      const row = screen.getByText('Test Receiver').closest('tr') // gp=10
      // Team totals include wr2 too (buildTeamShareTotals only gates gp>=1, unlike the gp>=8
      // gate on the player's OWN entry) — DAL recTgt = 90+20=110, so wr1's share is 90/110.
      const targetShare = (90 / 110) * 100
      expect(within(row).getByText(`${targetShare.toFixed(1)}%`)).toBeInTheDocument()
      const aDOT = 700 / 90
      expect(within(row).getByText(aDOT.toFixed(1))).toBeInTheDocument()
    })

    it('share columns stay "—" for a player who has not reached 8 games this season (gp>=8 gate, §3.0b) — the gate is not forked, only rendered as a stated "—"', () => {
      renderEfficiency()
      goToEfficiency('WR')
      const row = screen.getByText('Bench Receiver').closest('tr') // gp=5
      // Target share / air-yards share / aDOT — buildPositionStatSeries emits no entry below
      // QUALIFYING_GP, so all three render "—" rather than a real-looking early-season number.
      expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(3)
    })

    it('does not fall through to volumeRows in either the row-enrichment or the sort memo (§3.0c)', () => {
      const { container } = renderEfficiency()
      goToEfficiency('QB')
      // Volume's QB columns ("Pass Yd/G" etc.) must not appear under Efficiency.
      expect(screen.queryByRole('columnheader', { name: /Pass Yd\/G/ })).not.toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /EPA\/ATT/ })).toBeInTheDocument()

      // Sorting by CPOE must actually reorder via `_eff` — qb1 has a real CPOE, qb2 has none, so a
      // descending sort puts qb1 first; a silent `_avg` no-op would leave the original row order.
      fireEvent.click(screen.getByRole('columnheader', { name: /CPOE/ }))
      expect(screen.getByRole('columnheader', { name: 'CPOE ↓' })).toBeInTheDocument()
      const rows = [...container.querySelectorAll('tbody tr')]
      expect(within(rows[0]).getByText('Test Quarterback')).toBeInTheDocument()
    })

    it('switching QB → WR while Efficiency is active re-asserts the WR lead metric (air-yards share), not a stale QB column (§3.0d)', () => {
      renderEfficiency()
      goToEfficiency('QB')
      fireEvent.click(screen.getByRole('columnheader', { name: /CPOE/ })) // sort by a QB-only column
      fireEvent.click(screen.getByRole('button', { name: 'WR' }))
      expect(screen.getByRole('columnheader', { name: 'Air yards share ↓' })).toBeInTheDocument()
    })

    it('switching from another set directly to Efficiency asserts the current position\'s lead metric', () => {
      renderEfficiency()
      fireEvent.click(screen.getByRole('button', { name: 'RB' })) // still on Value
      fireEvent.click(screen.getByRole('button', { name: 'Efficiency' }))
      expect(screen.getByRole('columnheader', { name: 'Carry share ↓' })).toBeInTheDocument()
    })

    it('colSpan matches the Efficiency column count (empty-state row)', () => {
      renderEfficiency({ playerRows: [] })
      goToEfficiency('QB')
      const cell = screen.getByText('No players match your filters.')
      expect(cell.closest('td')).toHaveAttribute('colspan', '7') // PLAYER + TREND + 5 QB columns
    })

    it('states the fixed-season and gp>=8 limitations in the header, and hides the season <select>', () => {
      renderEfficiency()
      goToEfficiency()
      expect(screen.getByText(/Fixed to the 2025 season/)).toBeInTheDocument()
      expect(screen.getByText(/8 games this season/)).toBeInTheDocument()
      expect(screen.queryByText('Season')).not.toBeInTheDocument()
    })
  })

  // ── Environment filters (dp-v2 Slice 5c) ─────────────────────────────────
  describe('Environment filters (dp-v2 5c)', () => {
    const dataSeason = 2025

    // KC is tuned to rank best on all four metrics, CLE worst — proe: 35/60−30/60=+0.083 (KC) vs
    // 25/60−30/60=−0.083 (CLE); pace: 20s (KC, fast) vs 45s (CLE, slow); epaPerPlay: 0.25 vs −0.167;
    // rzTdRate: 1.0 vs 0. One team each keeps the fixture legible while still proving direction.
    function teamGame({ off, def }) {
      return { week: 1, seasonType: 'REG', opponent: 'X', off, def }
    }
    const fastTeamGame = teamGame({
      off: {
        plays: 60, passPlays: 35, proeXpassSum: 30, proePlays: 60,
        neutralSeconds: 400, neutralGaps: 20,
        successes: 40, successPlays: 60,
        rzTrips: 2, rzTdTrips: 2,
        epaSum: 15, epaPlays: 60,
        passEpaSum: 10, passEpaPlays: 35, rushEpaSum: 5, rushEpaPlays: 25,
        pointsScored: 30,
      },
      def: { epaSum: -5, epaPlays: 60 },
    })
    const slowTeamGame = teamGame({
      off: {
        plays: 60, passPlays: 25, proeXpassSum: 30, proePlays: 60,
        neutralSeconds: 900, neutralGaps: 20,
        successes: 20, successPlays: 60,
        rzTrips: 2, rzTdTrips: 0,
        epaSum: -10, epaPlays: 60,
        passEpaSum: -5, passEpaPlays: 25, rushEpaSum: -5, rushEpaPlays: 35,
        pointsScored: 10,
      },
      def: { epaSum: 5, epaPlays: 60 },
    })

    const envCareerStats = {
      [dataSeason]: { p1: { team: 'KC' }, p2: { team: 'CLE' } },
    }
    const envPlayerMap = {
      p1: { player_id: 'p1', position: 'WR', full_name: 'Fast Offense Player', age: 25, years_exp: 3, team: 'KC' },
      p2: { player_id: 'p2', position: 'WR', full_name: 'Slow Offense Player', age: 25, years_exp: 3, team: 'CLE' },
    }
    function envRow(id, team) {
      return {
        player_id: id, position: 'WR', full_name: envPlayerMap[id].full_name, age: 25, years_exp: 3, nfl_team: team,
        dynastyScore: { score: 70, label: 'Solid', confidence: 'high' }, ktcValue: 5000,
        ownerTeamName: null, currentSeasonPPG: 10, projectedPPG: 10, careerSparkline: [null, null, null, null, 10],
      }
    }
    const envPlayerRows = [envRow('p1', 'KC'), envRow('p2', 'CLE')]
    const envSeasonProjections = {
      p1: { projectedPPG: 10, projectedGames: 16, confidence: 'high', adjustmentSummary: [] },
      p2: { projectedPPG: 10, projectedGames: 16, confidence: 'high', adjustmentSummary: [] },
    }
    const teamContextByYear = {
      [dataSeason]: { complete: true, teams: { KC: { games: [fastTeamGame] }, CLE: { games: [slowTeamGame] } } },
    }

    function renderEnv(overrides = {}) {
      return renderMarket({
        careerStats: envCareerStats, playerMap: envPlayerMap, playerRows: envPlayerRows,
        seasonProjections: envSeasonProjections, teamContextByYear, ...overrides,
      })
    }
    function openPanel() {
      fireEvent.click(screen.getByRole('button', { name: '+ Add filter' }))
    }

    it('the panel shows a NEW-marked Environment group with four sliders reading "any" at rest', () => {
      renderEnv()
      openPanel()
      expect(screen.getByText('Environment')).toBeInTheDocument()
      expect(screen.getByText('New')).toBeInTheDocument()
      for (const label of ['Team PROE', 'Team pace', 'Team off. EPA/play', 'Team RZ TD rate']) {
        expect(screen.getByRole('slider', { name: label })).toBeInTheDocument()
      }
      expect(screen.getAllByText('any').length).toBe(4)
    })

    it('setting Team pace to top 1 keeps only the FAST offence — the check that catches a reversed rank', () => {
      renderEnv()
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team pace' }), { target: { value: '1' } })
      expect(screen.getByText('Fast Offense Player')).toBeInTheDocument()
      expect(screen.queryByText('Slow Offense Player')).not.toBeInTheDocument()
      expect(screen.getByText('top 1 of 32')).toBeInTheDocument()
    })

    it('setting Team PROE to top 1 keeps only the pass-heavier-than-expected offence', () => {
      renderEnv()
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team PROE' }), { target: { value: '1' } })
      expect(screen.getByText('Fast Offense Player')).toBeInTheDocument()
      expect(screen.queryByText('Slow Offense Player')).not.toBeInTheDocument()
    })

    it('renders a "top N" pill and clears it back to "any" via the pill\'s ×', () => {
      renderEnv()
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team pace' }), { target: { value: '1' } })
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
      expect(screen.getByText('Pace top 1')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Clear Pace top 1' }))
      expect(screen.queryByText('Pace top 1')).not.toBeInTheDocument()
      expect(screen.getByText('Slow Offense Player')).toBeInTheDocument()
    })

    it('complete: false leaves all four filters inert, distinct from an absent season', () => {
      renderEnv({ teamContextByYear: { [dataSeason]: { complete: false, teams: {} } } })
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team pace' }), { target: { value: '1' } })
      // Both rows still render — an incomplete load must not empty the table.
      expect(screen.getByText('Fast Offense Player')).toBeInTheDocument()
      expect(screen.getByText('Slow Offense Player')).toBeInTheDocument()
    })

    it('no teamContextByYear at all leaves the filters inert the same way', () => {
      renderEnv({ teamContextByYear: undefined })
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team pace' }), { target: { value: '1' } })
      expect(screen.getByText('Fast Offense Player')).toBeInTheDocument()
      expect(screen.getByText('Slow Offense Player')).toBeInTheDocument()
    })

    it('builds the league rank table once per season — identity/call-count stable across an unrelated filter change', () => {
      const spy = vi.spyOn(environmentModule, 'buildLeagueRankTable')
      renderEnv()
      const callsAfterMount = spy.mock.calls.length
      expect(callsAfterMount).toBeGreaterThan(0)

      openPanel()
      fireEvent.click(screen.getByLabelText('Rookies only')) // an unrelated filter — teamContextByYear is unchanged
      expect(spy.mock.calls.length).toBe(callsAfterMount)
      spy.mockRestore()
    })

    it('a saved preset with a non-default env value survives being saved and reapplied (§5 smoke)', () => {
      renderEnv()
      openPanel()
      fireEvent.change(screen.getByRole('slider', { name: 'Team pace' }), { target: { value: '1' } })
      fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))

      fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Fast offences' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      fireEvent.click(screen.getByRole('button', { name: 'Reset all' }))
      expect(screen.getByText('Slow Offense Player')).toBeInTheDocument()

      // The presets dropdown is still open from the save above (saving doesn't close it) — apply
      // straight from it rather than re-toggling, which would close it instead.
      fireEvent.click(screen.getByRole('button', { name: 'Fast offences' }))
      expect(screen.getByText('Fast Offense Player')).toBeInTheDocument()
      expect(screen.queryByText('Slow Offense Player')).not.toBeInTheDocument()
    })
  })
})
