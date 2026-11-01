// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Market } from './Market'
import * as environmentModule from '../../utils/environment'

expect.extend(jestDomMatchers)
// The shared cases run on Model, the view-level successor of Value.
beforeEach(() => localStorage.setItem('market-column-set', 'model'))
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


// Model-view fixtures (lifted from the retired In-season describe). Own career: the base fixtures stop at 2024
// and carry no scoringBasis, so no live row would be eligible for the opportunity blend there. The points
// columns read `scoringPosteriors` records (built here by hand — Market does not import the seam).
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
const isProps = (over = {}) => ({
  playerRows: isRows, careerStats: isCareer, playerMap: isMap, seasonProjections: {}, currentSeasonTotals: usable,
  scoringPosteriors: posteriors(), frozenPriorStatus: { status: 'ok', reason: null, dateKey: '2026-09-08' }, ...over,
})
const rowOf = name => screen.getByText(name).closest('tr')
const cells = name => [...rowOf(name).querySelectorAll('td')]
// Model's column order: 0 Player, 1 Dynasty, 2 Vs market, 3 KTC, 4 KTC trend, 5 Next/ROS, 6 Δ preseason, 7 Opp shift, 8 Signals, 9 Owner.
const MODEL_HEADERS = ['Player', 'Dynasty score ↓', 'Vs market', 'KTC', 'KTC trend', 'Next', 'Δ preseason', 'Opp shift', 'Signals', 'Owner']
const headerTexts = () => screen.getAllByRole('columnheader').map(h => h.textContent.trim())

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

  it('Model opens with its nine columns and no old Value / Outlook / In-season / Volume buttons', () => {
    renderMarket()
    expect(headerTexts()).toEqual(MODEL_HEADERS)
    for (const gone of ['Value', 'Outlook', 'In-season', 'Volume']) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument()
    }
  })

  it('position pills filter rows by position', () => {
    renderMarket()
    expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
    expect(screen.getByText('Running Back Two')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.queryByText('Wide Receiver One')).not.toBeInTheDocument()
    expect(screen.getByText('Quarterback Three')).toBeInTheDocument()
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
  it('the raw KTC column renders the locale-formatted value, distinct from the derived "Vs market" chip', () => {
    renderMarket()
    const p1Row = screen.getByText('Wide Receiver One').closest('tr')
    expect(within(p1Row).getByText('8,000')).toBeInTheDocument()
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

  // ── KTC trend column (dp-v2 Slice 5a §4; ported from the TREND gutter describe — the same cell, now Model's column 4) ──
  describe('KTC trend column (dp-v2 5a §4)', () => {
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

    it('a healthy series shows a sparkline + signed delta + window; a short/low-band series shows delta+window with no sparkline; no signal at all shows "—"', () => {
      renderMarket({ ktcHistory, seasonProjections: seasonProjectionsWithTrend })

      // p1 — high band: real bars (mapped from the object-shaped series) + delta + a week-labelled window.
      const p1TrendCell = cells('Wide Receiver One')[4]
      expect(within(p1TrendCell).getByText('▲ 500')).toBeInTheDocument()
      expect(within(p1TrendCell).getByText('13w')).toBeInTheDocument()
      expect(p1TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(5)

      // p2 — low band: delta + window render, but the series is suppressed (no sparkline bars).
      const p2TrendCell = cells('Running Back Two')[4]
      expect(within(p2TrendCell).getByText('▼ 100')).toBeInTheDocument()
      expect(within(p2TrendCell).getByText('2w')).toBeInTheDocument()
      expect(p2TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(0)

      // p3 — no ktcHist* factors at all: band 'none', renders only "—".
      const p3TrendCell = cells('Quarterback Three')[4]
      expect(within(p3TrendCell).getByText('—')).toBeInTheDocument()
      expect(p3TrendCell.querySelectorAll('.bg-dp-slate-2').length).toBe(0)
    })

    it('ktcHistory === null renders "—" without throwing', () => {
      renderMarket({ ktcHistory: null })
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(within(cells('Wide Receiver One')[4]).getByText('—')).toBeInTheDocument()
    })

    it('ktcHistory resolving to an empty series ({series: {}}) renders "—" without throwing', () => {
      renderMarket({ ktcHistory: { series: {} } })
      expect(screen.getByText('Wide Receiver One')).toBeInTheDocument()
      expect(within(cells('Wide Receiver One')[4]).getByText('—')).toBeInTheDocument()
    })

    it('clicking KTC trend orders on the delta scalar (not the cell object) with nulls last', () => {
      // Deltas deliberately out of fixture order: p2 +500, p5 +50, p1 -100; p3/p4 carry none.
      const sp = {
        ...seasonProjections,
        p1: { ...seasonProjections.p1, factors: { ktcHistDelta: -100, ktcHistWindowSpanDays: 91, ktcHistConfidence: 'high' } },
        p2: { ...seasonProjections.p2, factors: { ktcHistDelta: 500, ktcHistWindowSpanDays: 91, ktcHistConfidence: 'high' } },
        p5: { ...seasonProjections.p5, factors: { ktcHistDelta: 50, ktcHistWindowSpanDays: 91, ktcHistConfidence: 'high' } },
      }
      const { container } = renderMarket({ ktcHistory, seasonProjections: sp })
      fireEvent.click(screen.getByRole('columnheader', { name: /^KTC trend/ }))
      const names = [...container.querySelectorAll('tbody tr')].map(r => within(r).getAllByText(/Wide|Running|Quarter|Tight/)[0].textContent)
      expect(names.slice(0, 3)).toEqual(['Running Back Two', 'Wide Receiver Five', 'Wide Receiver One'])
      expect(names.slice(3).sort()).toEqual(['Quarterback Three', 'Tight End Four'])
    })
  })

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

  // ── Model view (market-model-view.md §8.1) ──────────────────────────────────────────────
  describe('Model view', () => {
    const openMarket = (over = {}) => renderMarket(isProps(over))
    const names = rows => rows.map(r => r.textContent)
    const orderOf = list => () => names([...document.querySelectorAll('tbody tr')]).map(t => list.filter(n => t.includes(n))[0])

    it('1. nine columns on every pill, default dynasty score, highest score first', () => {
      const { container } = renderMarket()
      expect(headerTexts()).toEqual(MODEL_HEADERS)
      expect(within([...container.querySelectorAll('tbody tr')][0]).getByText('Wide Receiver One')).toBeInTheDocument()
      for (const pill of ['QB', 'RB', 'WR', 'TE']) {
        fireEvent.click(screen.getByRole('button', { name: pill }))
        expect(headerTexts()).toEqual(MODEL_HEADERS)
      }
    })

    it('2. the projection header follows the scoringPosteriors seam: Next with no title, ROS with the tooltip', () => {
      renderMarket()
      expect(screen.getByRole('columnheader', { name: 'Next' }).getAttribute('title')).toBeNull()
      cleanup()
      localStorage.setItem('market-column-set', 'model')
      renderMarket({ scoringPosteriors: new Map() })
      expect(screen.getByRole('columnheader', { name: /^ROS/ }).getAttribute('title')).toBe(
        "Rest-of-season rate: the preseason projection updated with this season's games."
      )
      expect(screen.queryByRole('columnheader', { name: 'Next' })).not.toBeInTheDocument()
    })

    it('3. no live season: every Δ preseason and Opp shift cell reads —, no NaN/null text, caption reads the no-data sentence', () => {
      openMarket({ currentSeasonTotals: null, scoringPosteriors: null, frozenPriorStatus: null })
      for (const name of ['Vet Wideout', 'Rookie Wideout', 'Backup Back', 'Mismatch Wideout']) {
        const c = cells(name)
        expect(c[6].textContent.trim()).toBe('—')
        expect(c[7].textContent.trim()).toBe('—')
      }
      expect(screen.getByText(/No in-progress season data is loaded — the in-season columns read —\./)).toBeInTheDocument()
      // In-season caption copy must not render with no in-season data.
      expect(document.body.textContent).not.toMatch(/Early-season/)
      expect(document.body.querySelector('[title*="2026-10-02"]')).toBeNull()
      expect(document.body.textContent).not.toMatch(/Half-PPR|Scored on this league/)
      expect(document.body.textContent).not.toMatch(/\bnull\b|undefined|NaN/)
    })

    it('4. live season: Δ preseason value, hover, chips; Opp shift value, hover, new role and the basis-mismatch row', () => {
      openMarket()
      // frozen record: signed, coloured, hover carries prior → ROS · weight, no chip.
      const v1 = cells('Vet Wideout')[6]
      expect(v1.textContent.trim()).toBe('+0.9')
      expect(v1.querySelector('span[title]').className).toContain('text-dp-up-text')
      expect(v1.querySelector('span[title]').getAttribute('title')).toBe('Prior 12.0 → ROS 12.9 · 29% this season')
      expect(v1.querySelectorAll('span[title]').length).toBe(1)
      // model-changed record: live chip with the reason, plus the rookie chip.
      const rk = cells('Rookie Wideout')[6]
      expect(rk.textContent).toMatch(/^-1\.6liverookie$/)
      expect(rk.querySelector('span[title]').className).toContain('text-dp-down-text')
      const chips = [...rk.querySelectorAll('span[title]')]
      expect(chips.find(s => s.textContent === 'live').getAttribute('title'))
        .toBe('Not frozen: the projection model changed after the preseason capture, so this is today\'s projection')
      expect(chips.find(s => s.textContent === 'rookie').getAttribute('title')).toBe('Own measured update weight for this group')
      // SHORT group chip.
      expect(cells('Backup Back')[6].textContent).toMatch(/short/)
      // start-chain record: QB chip, starts in the hover.
      cleanup()
      localStorage.setItem('market-column-set', 'model')
      const start = { kind: 'backup', fraction: 0.6, expected: 4, remaining: 10, pNext: 0.3, starts: 3, seasonPoints: 55.5, starterPrior: 15, starterValue: 16.5, priorSource: 'live' }
      openMarket({ scoringPosteriors: new Map([['v1', { ...rec(7, 'standard', 6, 6.6, 0.4), start }]]) })
      const qb = cells('Vet Wideout')[6]
      expect(qb.textContent).toMatch(/\+0\.6QB 60%/)
      expect(qb.querySelector('span[title]').getAttribute('title')).toBe('Prior 6.0 → ROS 6.6 · 40% this season · 3 starts')
      expect([...qb.querySelectorAll('span[title]')].find(s => s.textContent === 'QB 60%').getAttribute('title')).toMatch(/^Not his team's week-1 starter/)
      cleanup()
      localStorage.setItem('market-column-set', 'model')
      // Opp shift.
      openMarket()
      const vet = cells('Vet Wideout')[7]
      expect(vet.textContent.trim()).toBe('+10%')
      // baseline 96/12 = 8.0 (2025), 20/2 = 10 now
      expect(vet.querySelector('span[title]').getAttribute('title')).toBe('Opp/G 8.0 (2025 season) → 10.0 this season')
      expect(cells('Backup Back')[7].textContent).toMatch(/6\.0new role/)
      const mm = cells('Mismatch Wideout')[7]
      expect(mm.textContent.trim()).toBe('—')
      expect(mm.querySelector('[title]')).toBeNull()
      expect(document.body.textContent).not.toMatch(/\bnull\b|undefined|NaN/)
    })

    it('5. sorts: Vs market descending by divergencePct with null last; Δ preseason first click is ascending', () => {
      const { unmount } = renderMarket()
      fireEvent.click(screen.getByRole('columnheader', { name: /^Vs market/ }))
      const order = orderOf(['Wide Receiver One', 'Wide Receiver Five', 'Tight End Four', 'Running Back Two', 'Quarterback Three'])
      // p1 30, p5 8, p4 5, p2 −30, p3 null
      expect(order()).toEqual(['Wide Receiver One', 'Wide Receiver Five', 'Tight End Four', 'Running Back Two', 'Quarterback Three'])
      unmount()
      localStorage.removeItem('market-sort')
      localStorage.setItem('market-column-set', 'model')

      openMarket()
      fireEvent.click(screen.getByRole('columnheader', { name: /^Δ preseason/ }))
      expect(screen.getByRole('columnheader', { name: 'Δ preseason ↑' })).toBeInTheDocument()
      const o = orderOf(['Vet Wideout', 'Rookie Wideout', 'Backup Back', 'Mismatch Wideout', 'Rookie NoProj'])
      // Δ: Rookie −1.6, Backup Back 0.0, Vet +0.86; the two record-less rows are null.
      expect(o().slice(0, 3)).toEqual(['Rookie Wideout', 'Backup Back', 'Vet Wideout'])
      fireEvent.click(screen.getByRole('columnheader', { name: /^Δ preseason/ }))
      expect(o().slice(0, 3)).toEqual(['Vet Wideout', 'Backup Back', 'Rookie Wideout'])
    })

    it('6. signals gate: age curve 1.02 shows nothing and sorts as null; 1.08 shows; breakout with 1.0 counts one', () => {
      const withSignals = (id, signals) => playerRows.map(r => (r.player_id === id ? { ...r, dynastyScore: { ...r.dynastyScore, signals } } : r))
      let rows = withSignals('p1', { ageCurveFactor: 1.08 })
      rows = rows.map(r => (r.player_id === 'p2' ? { ...r, dynastyScore: { ...r.dynastyScore, signals: { ageCurveFactor: 1.02 } } } : r))
      rows = rows.map(r => (r.player_id === 'p3' ? { ...r, dynastyScore: { ...r.dynastyScore, signals: { isBreakout: true, ageCurveFactor: 1.0 } } } : r))
      renderMarket({ playerRows: rows })
      expect(within(cells('Wide Receiver One')[8]).getByText('Age curve ×1.08')).toBeInTheDocument()
      expect(cells('Running Back Two')[8].textContent).not.toMatch(/Age curve/)
      expect(cells('Running Back Two')[8].textContent.trim()).toBe('—')
      const p3 = cells('Quarterback Three')[8]
      expect(p3.textContent).toContain('Breakout')
      expect(p3.textContent).not.toMatch(/Age curve/)
      fireEvent.click(screen.getByRole('columnheader', { name: /^Signals/ }))
      const top2 = orderOf(['Wide Receiver One', 'Running Back Two', 'Quarterback Three'])().slice(0, 2)
      expect(top2.sort()).toEqual(['Quarterback Three', 'Wide Receiver One'])
    })

    it('7. dynasty cell: the 2-yr avg rank sub-line and the age marker survive on the shared table; clicking the sub-line does not open the player', () => {
      const comps = { ageAdjusted: { value: 1 } }
      const rows = playerRows.map(r => r.player_id === 'p1'
        ? { ...r, dynastyScore: { ...r.dynastyScore, components: comps } } : r)
      const pm = { ...playerMap, p1: { ...playerMap.p1, birth_date: '1993-03-01' } }
      const { onOpenPlayerDetail } = renderMarket({ playerRows: rows, playerMap: pm })
      // p1: 2023 14.0 PPG, 2024 16.0 PPG → average ranks WR1 in a pool of one.
      expect(screen.getByText('2-yr avg WR1')).toBeInTheDocument()
      expect(screen.getByLabelText('The score has historically rated this age group too high.')).toBeInTheDocument()
      const row = screen.getByText('Wide Receiver One').closest('tr')
      expect(within(row).getByText('85')).toBeInTheDocument()
      expect(within(row).getByText('Elite')).toBeInTheDocument()
      fireEvent.click(screen.getByText('2-yr avg WR1'))
      expect(onOpenPlayerDetail).not.toHaveBeenCalled()
    })

    it('8. a stored sort naming a retired key opens Model on Dynasty score ↓', () => {
      for (const column of ['dynastyScoreValue', '_trend', 'delta']) {
        localStorage.setItem('market-column-set', 'model')
        localStorage.setItem('market-sort', JSON.stringify({ column, direction: 'asc' }))
        const { unmount } = renderMarket()
        expect(screen.getByRole('columnheader', { name: 'Dynasty score ↓' })).toBeInTheDocument()
        expect(JSON.parse(localStorage.getItem('market-sort'))).toEqual({ column: 'dynastyScore', direction: 'desc' })
        unmount()
      }
    })

    it('9. caption: season line, frozen-prior sentence, one early-season sentence with the detail on hover, basis sentence', () => {
      openMarket()
      const note = document.body.textContent
      expect(note).toMatch(/2026 season to date — up to 2 games played\./)
      expect(note).toMatch(/Priors frozen from the 2026-09-08 preseason capture\./)
      const early = screen.getByText('Early-season drops below the prior mostly reflect the projection running about 15–20% high.')
      expect(early.getAttribute('title')).toContain('2026-10-02')
      expect(note).not.toContain('without its market-value and college adjustments')
      expect(note).toMatch(/Half-PPR basis \(Sleeper's own scoring, not necessarily this league's\)\./)
    })

    it('9b. caption variants: model-changed, no capture, and the league-scored basis sentence only when both prior and live are league-scored', () => {
      const { unmount } = openMarket({ frozenPriorStatus: { status: 'model-changed-status', reason: 'model-changed', dateKey: '2026-09-08' } })
      expect(document.body.textContent).toMatch(/Priors are not frozen this season: the projection model changed after the preseason capture\./)
      expect(document.body.textContent).not.toMatch(/Priors frozen from/)
      unmount()
      const u2 = openMarket({ frozenPriorStatus: { status: 'none', reason: 'no-snapshot', dateKey: null } })
      expect(document.body.textContent).toMatch(/Priors are today's projection \(no usable preseason capture\)\./)
      u2.unmount()

      // port of the old "Scored on this league's settings" test (In-season :1047)
      const league = r => ({ ...r, scoringBasis: 'league' })
      const leagueCareer = { 2025: Object.fromEntries(Object.entries(isCareer[2025]).map(([k, v]) => [k, league(v)])) }
      const leagueLive = { ...usable, players: Object.fromEntries(Object.entries(usable.players).map(([k, v]) => [k, league(v)])) }
      const leagueNote = /Scored on this league's settings\./
      const halfNote = /Half-PPR basis \(Sleeper's own scoring, not necessarily this league's\)\./
      const u3 = openMarket({ careerStats: leagueCareer, currentSeasonTotals: leagueLive })
      expect(screen.getByText(leagueNote, { exact: false })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(halfNote)
      u3.unmount()
      openMarket({ currentSeasonTotals: leagueLive })
      expect(document.body.textContent).toMatch(halfNote)
      expect(document.body.textContent).not.toMatch(leagueNote)
    })

    it('10. switching away and back: a Model sort does not leak into Overview, and Model reopens on Dynasty score ↓', () => {
      renderMarket()
      // KTC is a column id Model and Overview share, so a leaked Model sort would stay valid on Overview.
      fireEvent.click(screen.getByRole('columnheader', { name: 'KTC' }))
      expect(screen.getByRole('columnheader', { name: 'KTC ↓' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
      expect(JSON.parse(localStorage.getItem('market-sort'))).toEqual({ column: 'fp', direction: 'desc' })
      expect(screen.getByRole('columnheader', { name: 'FP ↓' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Model' }))
      expect(screen.getByRole('columnheader', { name: 'Dynasty score ↓' })).toBeInTheDocument()
    })

    // ── ported from the retired In-season describe ──
    it('every not-frozen reason maps to its own chip title (port of In-season :952)', () => {
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
        const { unmount } = openMarket({ scoringPosteriors: map })
        const live = [...cells('Rookie Wideout')[6].querySelectorAll('span[title]')].find(s => s.textContent === 'live')
        expect(live.getAttribute('title')).toBe(title)
        unmount()
        localStorage.setItem('market-column-set', 'model')
      }
    })

    it('a baselined player with 0 games this season renders — in Opp shift, not a 0.0 shift (port of In-season :1004)', () => {
      const zRow = mk('z0', 'RB', 'Zero Games Back', 10)
      const zCareer = { 2025: { z0: { gamesPlayed: 10, fantasyPoints: 100, scoringBasis: HP, stats: { rush_att: 40 } } } } // oppPrior 4.0 — a baseline
      const zMap = { z0: { position: 'RB' } }
      const zTotals = { season: 2026, complete: true, players: { z0: { gamesPlayed: 0, fantasyPoints: 0, scoringBasis: HP, stats: {} } } }
      openMarket({ playerRows: [zRow], careerStats: zCareer, playerMap: zMap, currentSeasonTotals: zTotals, scoringPosteriors: null })
      expect(cells('Zero Games Back')[7].textContent.trim()).toBe('—')
    })

    it('the relative Opp-shift sort puts +50% above +20% above −10%, with the new role last (port of In-season :1078)', () => {
      const wr = (id, name) => mk(id, 'WR', name, 10)
      const rows = [wr('a', 'Plus Fifty'), wr('b', 'Plus Twenty'), wr('c', 'Minus Ten'), wr('d', 'New Role')]
      const career = { 2025: Object.fromEntries(['a', 'b', 'c'].map(id => [id,
        { gamesPlayed: 10, fantasyPoints: 100, scoringBasis: HP, stats: { rec_tgt: 100 }, weeklyPoints: makeWeekly(10, 10) }])) }
      const map = { a: { position: 'WR' }, b: { position: 'WR' }, c: { position: 'WR' }, d: { position: 'WR' } }
      // prior 10 opp/g, n 3, WR k 3 → w 0.5: rel = 0.5·(now − 10)/10. now 20 / 14 / 8 → +50% / +20% / −10%.
      const totals = { season: 2026, complete: true, players: {
        a: live(3, 30, { rec_tgt: 60 }), b: live(3, 30, { rec_tgt: 42 }), c: live(3, 30, { rec_tgt: 24 }), d: live(3, 30, { rec_tgt: 24 }),
      } }
      openMarket({ playerRows: rows, careerStats: career, playerMap: map, currentSeasonTotals: totals, scoringPosteriors: null })
      const th = () => screen.getByRole('columnheader', { name: /^Opp shift/ })
      const order = orderOf(['Plus Fifty', 'Plus Twenty', 'Minus Ten', 'New Role'])
      fireEvent.click(th())
      expect(order()).toEqual(['Plus Fifty', 'Plus Twenty', 'Minus Ten', 'New Role'])
      expect(cells('Plus Fifty')[7].textContent.trim()).toBe('+50%')
      expect(cells('Minus Ten')[7].textContent.trim()).toBe('-10%')
      fireEvent.click(th())
      expect(order()).toEqual(['Minus Ten', 'Plus Twenty', 'Plus Fifty', 'New Role'])
    })
  })
})
