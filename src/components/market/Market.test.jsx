// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Market } from './Market'
import * as environmentModule from '../../utils/environment'

expect.extend(jestDomMatchers)
// The cases below were written against Value as the clean-store default; Overview is the default now,
// so this pins that precondition. Tests that set the key in their own body still override it.
beforeEach(() => localStorage.setItem('market-column-set', 'value'))
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

  it('renders the Value, Outlook and Efficiency sets with their own headers', () => {
    renderMarket()
    expect(screen.getByRole('columnheader', { name: /Dynasty score/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Vs market/ })).toBeInTheDocument()
    expect(screen.getByText('Career PPG')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    expect(screen.getByRole('columnheader', { name: 'Proj ↓' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Signals/ })).toBeInTheDocument()
  })

  it('Value/Outlook "Next"/"Proj" headers read ROS with a tooltip once scoring is on, else unscored labels (fix pass 1 item 3)', () => {
    // Unscored (no scoringPosteriors prop): the legacy labels, and no title on any of the three (fix pass 2 item 3).
    renderMarket()
    const nextHeader = screen.getByRole('columnheader', { name: 'Next' })
    expect(nextHeader).toBeInTheDocument()
    expect(nextHeader.getAttribute('title')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    const projHeader = screen.getByRole('columnheader', { name: 'Proj ↓' })
    expect(projHeader).toBeInTheDocument()
    expect(projHeader.getAttribute('title')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Proj G' }).getAttribute('title')).toBeNull()
    cleanup()
    localStorage.setItem('market-column-set', 'value')

    // Scored (scoringPosteriors present, even if empty): both sets switch to ROS with the tooltip.
    renderMarket({ scoringPosteriors: new Map() })
    const valueHeader = screen.getByRole('columnheader', { name: /^ROS/ })
    expect(valueHeader).toBeInTheDocument()
    expect(valueHeader.getAttribute('title')).toBe(
      "Rest-of-season rate: the preseason projection updated with this season's games (In-season tab shows the prior)."
    )
    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    const outlookHeader = screen.getByRole('columnheader', { name: /^ROS/ })
    expect(outlookHeader.getAttribute('title')).toBe(
      "Rest-of-season rate: the preseason projection updated with this season's games (In-season tab shows the prior)."
    )
    expect(screen.getByRole('columnheader', { name: 'Proj G' }).getAttribute('title')).toBe('Full-season projected games.')
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

    it('renders under Value, Outlook and is sortable from each', () => {
      renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })
      expect(screen.getByRole('columnheader', { name: /Trend/ })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('columnheader', { name: /Trend/ }))
      expect(screen.getByRole('columnheader', { name: 'Trend ↓' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
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
      // Environment and Performance both carry a New badge; Performance adds its own two "any" readouts.
      expect(screen.getAllByText('New').length).toBe(2)
      for (const label of ['Team PROE', 'Team pace', 'Team off. EPA/play', 'Team RZ TD rate']) {
        expect(screen.getByRole('slider', { name: label })).toBeInTheDocument()
      }
      expect(screen.getAllByText('any').length).toBe(6)
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
  // ── In-season set (in-season-evidence-1-view.md §6.3; "what changed" tab, 2b-2 §7) ────────────────
  // Own fixture: the base fixtures stop at 2024 and carry no scoringBasis, so no live row would be
  // eligible for the opportunity blend there. The points columns read `scoringPosteriors` records (built
  // here by hand — Market does not import the seam).
  describe('In-season set (in-season-evidence-2b-2)', () => {
    const HP = 'half_ppr'
    const isCareer = {
      2025: {
        v1: { gamesPlayed: 12, fantasyPoints: 180, scoringBasis: HP, team: 'DAL', stats: { rec_tgt: 96 }, weeklyPoints: makeWeekly(12, 15) },
        rb2: { gamesPlayed: 2, fantasyPoints: 10, scoringBasis: HP, team: 'SF', stats: { rush_att: 4 }, weeklyPoints: makeWeekly(2, 5) },
        mm: { gamesPlayed: 12, fantasyPoints: 120, scoringBasis: HP, team: 'KC', stats: { rec_tgt: 60 }, weeklyPoints: makeWeekly(12, 10) },
      },
    }
    const isMap = {
      v1: { position: 'WR' }, rk: { position: 'WR' }, rn: { position: 'WR' }, rb2: { position: 'RB' }, mm: { position: 'WR' },
    }
    const mk = (id, pos, name, proj) => ({
      player_id: id, position: pos, full_name: name, age: 25, years_exp: 3, nfl_team: 'DAL',
      dynastyScore: { score: 50, label: 'x', confidence: 'high' }, ktcValue: null, divergenceSignal: null,
      divergencePct: null, ownerTeamName: null, currentSeasonPPG: 10, projectedPPG: proj,
      careerSparkline: [null, null, null, null, null],
    })
    const isRows = [
      mk('v1', 'WR', 'Vet Wideout', 12),
      mk('rk', 'WR', 'Rookie Wideout', 8),
      mk('rn', 'WR', 'Rookie NoProj', null),
      mk('rb2', 'RB', 'Backup Back', 6),
      mk('mm', 'WR', 'Mismatch Wideout', 9),
    ]
    const live = (g, fp, stats) => ({ gamesPlayed: g, fantasyPoints: fp, scoringBasis: HP, stats })
    const usable = {
      season: 2026, complete: true,
      players: {
        v1: live(2, 30, { rec_tgt: 20 }), rk: live(2, 28, { rec_tgt: 10 }), rn: live(2, 20, { rec_tgt: 8 }),
        rb2: live(2, 20, { rush_att: 10, rec_tgt: 2 }), mm: { ...live(2, 20, { rec_tgt: 20 }), scoringBasis: 'ppr' },
      },
    }
    // A seam record as buildScoringPosteriors emits it (only the fields Market reads matter).
    const rec = (n, population, prior, value, weight, { frozen = true, notFrozenReason = null } = {}) => ({
      season: 2026, n, population, frozen, notFrozenReason,
      ros: { prior, k: 3, weight, value },
      next: { priorKind: 'history', prior, k: 6, weight, value },
    })
    const posteriors = () => new Map([
      ['v1', rec(2, 'standard', 12, 12.86, 0.2857)],                                                       // frozen, +0.86
      ['rk', rec(2, 'ROOKIE0', 8, 6.4, 0.36, { frozen: false, notFrozenReason: 'model-changed' })],     // live, −1.6
      ['rb2', rec(2, 'SHORT', 6, 6, 0.5, { frozen: true })],                                              // flat
    ])
    const props = (over = {}) => ({
      playerRows: isRows, careerStats: isCareer, playerMap: isMap, seasonProjections: {}, currentSeasonTotals: usable,
      scoringPosteriors: posteriors(), frozenPriorStatus: { status: 'ok', reason: null, dateKey: '2026-09-08' }, ...over,
    })
    const rowOf = name => screen.getByText(name).closest('tr')
    const cells = name => [...rowOf(name).querySelectorAll('td')]
    const openTab = () => fireEvent.click(screen.getByRole('button', { name: 'In-season' }))

    it('the In-season chip renders in MODEL, after Outlook', () => {
      renderMarket(props())
      const group = screen.getByText('MODEL', { exact: true }).parentElement
      const labels = within(group).getAllByRole('button').map(b => b.textContent)
      expect(labels).toEqual(['Value', 'Outlook', 'In-season'])
    })

    it('renders exactly the ten headers (suffixed by season), no Dyn / Current proj / ext', () => {
      renderMarket(props())
      openTab()
      // the active sort column (Δ, the default) carries an arrow — strip it
      const heads = screen.getAllByRole('columnheader').map(h => h.textContent.trim().replace(/ [↑↓]$/, ''))
      expect(heads).toEqual(['Player', 'Trend', 'G 2026', 'PPG 2026', 'Prior', 'ROS', 'Δ', 'Opp/G base', 'Opp/G 2026', 'Opp shift'])
      expect(screen.getByRole('columnheader', { name: /^Opp\/G base/ }).getAttribute('title'))
        .toBe('Most recent of the last three seasons with 4+ games')
      expect(screen.getByRole('columnheader', { name: /^ROS/ }).getAttribute('title'))
        .toMatch(/Weights were measured by backtest \(2014–2025\)\./)
      expect(screen.getByRole('columnheader', { name: /^Δ/ }).getAttribute('title')).toBe('Rest-of-season estimate minus the prior.')
    })

    it('a frozen record renders its prior with no chip; ROS = value · weight%; Δ is signed and coloured', () => {
      renderMarket(props())
      openTab()
      const c = cells('Vet Wideout')
      expect(c[2].textContent.trim()).toBe('2')                    // G
      expect(c[4].textContent.trim()).toBe('12.0')                 // Prior, no `live` chip
      expect(c[4].textContent).not.toMatch(/live/)
      expect(c[5].textContent.trim()).toBe('12.9 · 29%')           // ROS, standard → no group chip
      expect(c[6].textContent.trim()).toBe('+0.9')
      expect(c[6].querySelector('span').className).toContain('text-dp-up-text')
    })

    it('a model-changed record renders the `live` chip with its reason as the title; a rookie ROS carries the rookie chip', () => {
      renderMarket(props())
      openTab()
      const c = cells('Rookie Wideout')
      const chip = c[4].querySelector('span[title]')
      expect(chip.textContent).toBe('live')
      expect(chip.getAttribute('title')).toBe('Not frozen: the projection model changed after the preseason capture, so this is today\'s projection')
      expect(c[5].textContent).toMatch(/6\.4 · 36%rookie/)
      expect(c[5].querySelector('span[title]').getAttribute('title')).toBe('Own measured update weight for this group')
      expect(c[6].textContent.trim()).toBe('-1.6')
      expect(c[6].querySelector('span').className).toContain('text-dp-down-text')
    })

    // P6b Stage B §3.5 — a record carrying `start`: GP shows his starts with a `starts` chip, ROS gains the QB chip.
    it('a start-chain record: the G cell reads starts (not games played) with a `starts` chip; ROS carries the `QB n%` chip; Prior/Δ unchanged', () => {
      const start = { kind: 'backup', fraction: 0.4, expected: 4, remaining: 10, pNext: 0.3, starts: 5, seasonPoints: 55.5, starterPrior: 15, starterValue: 16.5, priorSource: 'live' }
      const map = new Map([['v1', { ...rec(7, 'standard', 6, 6.6, 0.4), start }], ['rk', rec(2, 'ROOKIE0', 8, 6.4, 0.36)]])
      renderMarket(props({ scoringPosteriors: map }))
      openTab()
      const c = cells('Vet Wideout')
      expect(c[2].textContent.trim()).toBe('5starts')                       // not n = 7
      expect(c[2].querySelector('span[title]').textContent).toBe('starts')
      expect(c[5].textContent).toMatch(/6\.6 · 40%QB 40%/)
      expect(c[5].querySelector('span[title]').getAttribute('title')).toMatch(/^Not his team's week-1 starter/)
      expect(c[4].textContent.trim()).toMatch(/^6\.0/)
      expect(c[6].textContent.trim()).toBe('+0.6')
      // a record without `start` keeps the plain games-played cell and no QB chip
      expect(cells('Rookie Wideout')[2].textContent.trim()).toBe('2')
      expect(cells('Rookie Wideout')[5].textContent).not.toMatch(/QB \d+%/)
    })

    it('every not-frozen reason maps to its own chip title', () => {
      const cases = {
        absent: 'Not in the preseason capture',
        league: 'Preseason capture was for a different league',
        basis: 'Preseason capture is not comparable',
        season: 'Preseason capture is not comparable',
        'no-snapshot': 'No preseason capture available',
        unavailable: 'No preseason capture available',
      }
      for (const [reason, title] of Object.entries(cases)) {
        const map = new Map([['rk', rec(2, 'standard', 8, 8, 0.4, { frozen: false, notFrozenReason: reason })]])
        const { unmount } = renderMarket(props({ scoringPosteriors: map }))
        openTab()
        expect(cells('Rookie Wideout')[4].querySelector('span[title]').getAttribute('title')).toBe(title)
        unmount()
        localStorage.setItem('market-column-set', 'value')
      }
    })

    it('SHORT gets the short chip; no record → every posterior cell reads — and the chip still toggles', () => {
      renderMarket(props())
      openTab()
      expect(cells('Backup Back')[5].textContent).toMatch(/6\.0 · 50%short/)
      const none = cells('Mismatch Wideout')            // no record (basis mismatch) → dashes
      for (const i of [2, 4, 5, 6]) expect(none[i].textContent.trim()).toBe('—')
    })

    it('scoringPosteriors null → every posterior cell reads —, the chip still toggles, and no null/NaN text', () => {
      renderMarket(props({ scoringPosteriors: null }))
      openTab()
      expect(screen.getByRole('columnheader', { name: /^Opp shift/ })).toBeInTheDocument()
      for (const name of ['Vet Wideout', 'Rookie Wideout', 'Backup Back']) {
        const c = cells(name)
        for (const i of [2, 4, 5, 6]) expect(c[i].textContent.trim()).toBe('—')
      }
      // the opportunity columns do not depend on the records
      expect(cells('Vet Wideout')[8].textContent.trim()).toBe('10.0')
      expect(document.body.textContent).not.toMatch(/\bnull\b|undefined|NaN/)
    })

    it('Opp shift: baselined veteran reads +10% (relative), a new role reads its opp/g with the chip, ineligible reads —', () => {
      renderMarket(props())
      openTab()
      // v1: baseline 96/12 = 8.0 (2025), 20/2 = 10 now, WR k 3 → rosOpp 8.8, shift 0.8, 10%
      expect(cells('Vet Wideout')[7].textContent.trim()).toBe('8.0')
      expect(cells('Vet Wideout')[7].getAttribute('title')).toBe('2025 season')
      expect(cells('Vet Wideout')[9].textContent.trim()).toBe('+10%')
      expect(cells('Backup Back')[9].textContent).toMatch(/6\.0new role/)   // no baseline (2 games)
      expect(cells('Mismatch Wideout')[9].textContent.trim()).toBe('—')
      expect(document.body.textContent).not.toMatch(/\bnull\b|undefined|NaN/)
    })

    it('a baselined player with 0 games this season renders — in Opp shift, not a 0.0 shift (fix pass 1, item 2)', () => {
      const zRow = mk('z0', 'RB', 'Zero Games Back', 10)
      const zCareer = { 2025: { z0: { gamesPlayed: 10, fantasyPoints: 100, scoringBasis: HP, stats: { rush_att: 40 } } } } // oppPrior 4.0 — a baseline
      const zMap = { z0: { position: 'RB' } }
      const zTotals = { season: 2026, complete: true, players: { z0: { gamesPlayed: 0, fantasyPoints: 0, scoringBasis: HP, stats: {} } } }
      renderMarket(props({ playerRows: [zRow], careerStats: zCareer, playerMap: zMap, currentSeasonTotals: zTotals, scoringPosteriors: null }))
      openTab()
      expect(cells('Zero Games Back')[9].textContent.trim()).toBe('—')
    })

    it('the note: season line, frozen-prior sentence, the optimism sentence and the basis sentence', () => {
      const optimism = /Early-season drift below the prior mostly reflects the projection's known optimism — it runs roughly 15–20% high — not player performance\./
      const { unmount } = renderMarket(props())
      openTab()
      const note = document.body.textContent
      expect(note).toMatch(/2026 season to date — up to 2 games played\./)
      expect(note).toMatch(/Priors frozen from the 2026-09-08 preseason capture\./)
      expect(note).toMatch(optimism)
      expect(note).toContain('without its market-value and college adjustments')
      expect(note).toMatch(/Half-PPR basis \(Sleeper's own scoring, not necessarily this league's\)\./)
      unmount()

      renderMarket(props({ frozenPriorStatus: { status: 'model-changed-status', reason: 'model-changed', dateKey: '2026-09-08' } }))
      openTab()
      expect(document.body.textContent).toMatch(/Priors are not frozen this season: the projection model changed after the preseason capture\./)
      expect(document.body.textContent).not.toMatch(/Priors frozen from/)
    })

    it("any other frozen-prior state reads today's projection; the optimism sentence is present in the no-data state too", () => {
      const { unmount } = renderMarket(props({ frozenPriorStatus: { status: 'none', reason: 'no-snapshot', dateKey: null } }))
      openTab()
      expect(document.body.textContent).toMatch(/Priors are today's projection \(no usable preseason capture\)\./)
      unmount()
      renderMarket(props({ frozenPriorStatus: null, currentSeasonTotals: { players: {}, season: 2026, complete: false }, scoringPosteriors: null }))
      openTab()
      expect(screen.getByText(/No in-progress season data is loaded — the in-season columns read —\./)).toBeInTheDocument()
      expect(document.body.textContent).toMatch(/known optimism — it runs roughly 15–20% high/)
      expect(rowOf('Vet Wideout').textContent).not.toMatch(/\d\d%/)
      expect(document.body.textContent).not.toMatch(/\bnull\b|undefined|NaN/)
    })

    // season-rescore.md §3.7/§4.8 — the note is true only when BOTH the prior season and the live rows
    // went through the rescoring seam (scoringBasis 'league'); mixed/served labels keep the half-PPR copy.
    it("the note reads \"Scored on this league's settings.\" when prior and live rows are both league-scored, and not otherwise", () => {
      const league = (r) => ({ ...r, scoringBasis: 'league' })
      const leagueCareer = { 2025: Object.fromEntries(Object.entries(isCareer[2025]).map(([k, v]) => [k, league(v)])) }
      const leagueLive = { ...usable, players: Object.fromEntries(Object.entries(usable.players).map(([k, v]) => [k, league(v)])) }
      const leagueNote = /Scored on this league's settings\./
      const halfNote = /Half-PPR basis \(Sleeper's own scoring, not necessarily this league's\)\./

      const { unmount } = renderMarket(props({ careerStats: leagueCareer, currentSeasonTotals: leagueLive }))
      openTab()
      expect(screen.getByText(leagueNote, { exact: false })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(halfNote)
      unmount()

      // live rows league-scored but the prior season still served → half-PPR copy
      renderMarket(props({ currentSeasonTotals: leagueLive }))
      openTab()
      expect(document.body.textContent).toMatch(halfNote)
      expect(document.body.textContent).not.toMatch(leagueNote)
    })

    it('sorting by Δ (the default) puts the biggest drops first; a null Δ sorts last both ways', () => {
      renderMarket(props())
      openTab()
      const order = () => [...document.querySelectorAll('tbody tr')].map(r => r.textContent)
        .map(t => ['Vet Wideout', 'Rookie Wideout', 'Backup Back', 'Mismatch Wideout', 'Rookie NoProj'].filter(n => t.includes(n))[0])
      // Δ: Rookie −1.6, Backup Back 0.0, Vet +0.86; the two record-less rows are null.
      expect(order().slice(0, 3)).toEqual(['Rookie Wideout', 'Backup Back', 'Vet Wideout'])
      fireEvent.click(screen.getByRole('columnheader', { name: /^Δ/ }))
      expect(order().slice(0, 3)).toEqual(['Vet Wideout', 'Backup Back', 'Rookie Wideout'])
    })

    it('the relative Opp-shift sort puts +50% above +20% above −10%, with the new role last (nulls last both ways)', () => {
      const wr = (id, name) => mk(id, 'WR', name, 10)
      const rows = [wr('a', 'Plus Fifty'), wr('b', 'Plus Twenty'), wr('c', 'Minus Ten'), wr('d', 'New Role')]
      const career = { 2025: Object.fromEntries(['a', 'b', 'c'].map(id => [id,
        { gamesPlayed: 10, fantasyPoints: 100, scoringBasis: HP, stats: { rec_tgt: 100 }, weeklyPoints: makeWeekly(10, 10) }])) }
      const map = { a: { position: 'WR' }, b: { position: 'WR' }, c: { position: 'WR' }, d: { position: 'WR' } }
      // prior 10 opp/g, n 3, WR k 3 → w 0.5: rel = 0.5·(now − 10)/10. now 20 / 14 / 8 → +50% / +20% / −10%.
      const totals = { season: 2026, complete: true, players: {
        a: live(3, 30, { rec_tgt: 60 }), b: live(3, 30, { rec_tgt: 42 }), c: live(3, 30, { rec_tgt: 24 }), d: live(3, 30, { rec_tgt: 24 }),
      } }
      renderMarket(props({ playerRows: rows, careerStats: career, playerMap: map, currentSeasonTotals: totals, scoringPosteriors: null }))
      openTab()
      const th = () => screen.getByRole('columnheader', { name: /^Opp shift/ })
      const order = () => [...document.querySelectorAll('tbody tr')].map(r => r.textContent)
        .map(t => ['Plus Fifty', 'Plus Twenty', 'Minus Ten', 'New Role'].filter(n => t.includes(n))[0])
      fireEvent.click(th())
      expect(order()).toEqual(['Plus Fifty', 'Plus Twenty', 'Minus Ten', 'New Role'])
      expect(cells('Plus Fifty')[9].textContent.trim()).toBe('+50%')
      expect(cells('Minus Ten')[9].textContent.trim()).toBe('-10%')
      fireEvent.click(th())
      expect(order()).toEqual(['Minus Ten', 'Plus Twenty', 'Plus Fifty', 'New Role'])
    })

    it('a stored In-season column set is restored on mount (5)', () => {
      localStorage.setItem('market-column-set', 'inseason')
      renderMarket(props())
      expect(screen.getByRole('columnheader', { name: /^Opp shift/ })).toBeInTheDocument()
    })

    it('a stored sort key that is not an In-season column falls back to the new default, Δ ascending (6)', () => {
      // 2b-2: the default moved from ROS desc to Δ asc (biggest drops first), and the retired keys
      // (games, proj, rosPpg, rosWeight) are no longer sortable — they fall back through the stale-key path.
      for (const stale of ['_deltaVsNow', 'rosPpg', 'proj', 'games']) {
        localStorage.setItem('market-column-set', 'inseason')
        localStorage.setItem('market-sort', JSON.stringify({ column: stale, direction: 'asc' }))
        const { unmount } = renderMarket(props())
        expect(JSON.parse(localStorage.getItem('market-sort'))).toEqual({ column: 'delta', direction: 'asc' })
        unmount()
      }
    })

    it('fall-through guard: Opp shift renders and Volume\'s ALL-only Yds/G and FP/G do not (7)', () => {
      renderMarket(props())
      openTab()
      expect(screen.getByRole('columnheader', { name: /^Opp shift/ })).toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /Yds\/G/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: /FP\/G/ })).not.toBeInTheDocument()
    })
  })
})

describe('Value set — two-year-average rank and age caution', () => {
  it('shows the rank sub-line and the age marker for a 32-year-old veteran, score unchanged', () => {
    const comps = { ageAdjusted: { value: 1 } }
    const rows = playerRows.map(r => r.player_id === 'p1'
      ? { ...r, dynastyScore: { ...r.dynastyScore, components: comps } } : r)
    const pm = { ...playerMap, p1: { ...playerMap.p1, birth_date: '1993-03-01' } }
    renderMarket({ playerRows: rows, playerMap: pm })
    // p1: 2023 14.0 PPG, 2024 16.0 PPG → average ranks WR1 in a pool of one.
    expect(screen.getByText('2-yr avg WR1')).toBeInTheDocument()
    expect(screen.getByLabelText('The score has historically rated this age group too high.')).toBeInTheDocument()
    const row = screen.getByText('Wide Receiver One').closest('tr')
    expect(within(row).getByText('85')).toBeInTheDocument()
    expect(within(row).getByText('Elite')).toBeInTheDocument()
  })
  it('a click on the rank sub-line does not open the player', () => {
    const rows = playerRows.map(r => r.player_id === 'p1'
      ? { ...r, dynastyScore: { ...r.dynastyScore, components: {} } } : r)
    const { onOpenPlayerDetail } = renderMarket({ playerRows: rows })
    fireEvent.click(screen.getByText('2-yr avg WR1'))
    expect(onOpenPlayerDetail).not.toHaveBeenCalled()
  })
})
