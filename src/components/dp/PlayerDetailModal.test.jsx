// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailModal } from './PlayerDetailModal'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWeekly(n, val) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), val]))
}

function richDynastyScore(overrides = {}) {
  return {
    score: 82,
    label: 'Elite',
    confidence: 'high',
    isRookie: false,
    components: {
      ageAdjusted: { value: 78, weight: 0.28 },
      trajectory: { value: 65, weight: 0.25, slope: 0.05 },
      currentLevel: { value: 90, weight: 0.22, percentile: 90 },
      reliability: { value: 70, weight: 0.10, consistencyScore: 72, durabilityScore: 68 },
      opportunityQuality: { value: 85, weight: 0.15, efficiencyPercentile: 80, volumePercentile: 88, shareScore: 75 },
    },
    signals: {
      isBreakout: true,
      isBounceBack: false,
      momentumLabel: 'accelerating',
      isTdReliant: true,
      tdDependency: 0.32,
      injurySeasonCount: 2,
      ageCurveFactor: 1.12,
      seasonsOfData: 3,
      peakSeason: { season: 2024, ppg: 19.8 },
      draftCapital: null,
      ktcInfluenced: false,
    },
    ...overrides,
  }
}

// 3 seasons of identical-shaped data for the "happy path" and null-isolation players — each at
// a distinct position so none becomes a career-comp candidate for another (keeps assertions
// simple; comps behavior itself is covered by the "comps empty" assertion below).
const careerStats = {
  2022: {
    p1: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) },
    p2: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) },
    p4: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) },
    p5: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) },
  },
  2023: {
    p1: { gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', weeklyPoints: makeWeekly(16, 16.0) },
    p2: { gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', weeklyPoints: makeWeekly(16, 16.0) },
    p4: { gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', weeklyPoints: makeWeekly(16, 16.0) },
    p5: { gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', weeklyPoints: makeWeekly(16, 16.0) },
  },
  2024: {
    p1: { gamesPlayed: 17, fantasyPoints: 306, team: 'DAL', weeklyPoints: makeWeekly(17, 18.0) },
    p2: { gamesPlayed: 17, fantasyPoints: 306, team: 'DAL', weeklyPoints: makeWeekly(17, 18.0) },
    p4: { gamesPlayed: 17, fantasyPoints: 306, team: 'DAL', weeklyPoints: makeWeekly(17, 18.0) },
    p5: { gamesPlayed: 17, fantasyPoints: 306, team: 'DAL', weeklyPoints: makeWeekly(17, 18.0) },
    // p7: one qualifying season (gp=8 >= QUALIFYING_GP) but only 5 recorded weeklyPoints entries
    // — pooledGames(5) < MIN_POOLED_GAMES(10), so computeConsistency returns a non-null object
    // whose sd is null. A null-object check alone would miss this.
    p7: { gamesPlayed: 8, fantasyPoints: 96, team: 'DAL', weeklyPoints: makeWeekly(5, 12.0) },
  },
  // p6 and p3 deliberately absent from careerStats entirely (p6: computeConsistency === null;
  // p3: non-skill-position path doesn't need career data for this test).
}

const playersMap = {
  p1: { player_id: 'p1', position: 'WR', full_name: 'Wide Receiver One', age: 26, years_exp: 5, team: 'DAL', status: 'Active' },
  p2: { player_id: 'p2', position: 'RB', full_name: 'Running Back Two', age: 27, years_exp: 6, team: 'DAL', status: 'Active' },
  p3: { player_id: 'p3', position: 'K',  full_name: 'Kicker Three',     age: 29, years_exp: 7, team: 'DAL', status: 'Active' },
  p4: { player_id: 'p4', position: 'TE', full_name: 'Tight End Four',   age: 25, years_exp: 3, team: 'DAL', status: 'Active' },
  p5: { player_id: 'p5', position: 'QB', full_name: 'Quarterback Five', age: 28, years_exp: 6, team: 'DAL', status: 'Active' },
  p6: { player_id: 'p6', position: 'RB', full_name: 'Running Back Six', age: 24, years_exp: 2, team: 'DAL', status: 'Active' },
  p7: { player_id: 'p7', position: 'WR', full_name: 'Wide Receiver Seven', age: 23, years_exp: 1, team: 'DAL', status: 'Active' },
  ghost: { player_id: 'ghost', position: 'WR', full_name: 'Ghost Player', age: 23, years_exp: 1, team: 'NYJ', status: 'Active' },
}

const playerRows = [
  {
    player_id: 'p1', position: 'WR', full_name: 'Wide Receiver One',
    dynastyScore: richDynastyScore(),
    ownerTeamName: 'My Team', ktcValue: 7200, divergenceSignal: 'undervalued',
    dynRank: 3, ktcRank: 8, positionRank: 1, currentSeasonPPG: 18.0,
  },
  {
    // components null (one of the six paths), signals present — the common "Limited Data" case.
    player_id: 'p2', position: 'RB', full_name: 'Running Back Two',
    dynastyScore: {
      score: 20, label: 'Limited Data', confidence: 'none', isRookie: false,
      components: null,
      signals: {
        isBreakout: false, isBounceBack: false, isProspect: false, isStaleData: true,
        seasonsOfData: 2, draftCapital: null, gamesPlayed: 5,
        ageCurveFactor: null, peakSeason: null, ktcInfluenced: false,
      },
    },
    ownerTeamName: null, ktcValue: 3000, divergenceSignal: null,
    dynRank: null, ktcRank: null, positionRank: 1, currentSeasonPPG: 16.0,
  },
  {
    // signals null too — the non-skill-position path (dynastyScore.js:631).
    player_id: 'p3', position: 'K', full_name: 'Kicker Three',
    dynastyScore: { score: null, label: 'N/A', confidence: 'none', isRookie: false, components: null, signals: null },
    ownerTeamName: null, ktcValue: null, divergenceSignal: null,
    dynRank: null, ktcRank: null, positionRank: null, currentSeasonPPG: 0,
  },
  {
    // projection deliberately absent from seasonProjections below.
    player_id: 'p4', position: 'TE', full_name: 'Tight End Four',
    dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 4500, divergenceSignal: 'overvalued',
    dynRank: 5, ktcRank: 2, positionRank: 1, currentSeasonPPG: 18.0,
  },
  {
    // ktcValue deliberately absent from ktcMap below.
    player_id: 'p5', position: 'QB', full_name: 'Quarterback Five',
    dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: null, divergenceSignal: null,
    dynRank: null, ktcRank: null, positionRank: 1, currentSeasonPPG: 18.0,
  },
  {
    // computeConsistency(...) === null (no careerStats entries at all).
    player_id: 'p6', position: 'RB', full_name: 'Running Back Six',
    dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 5000, divergenceSignal: null,
    dynRank: null, ktcRank: null, positionRank: 2, currentSeasonPPG: 0,
  },
  {
    // computeConsistency(...) is non-null but .sd === null (pooled games < MIN_POOLED_GAMES).
    player_id: 'p7', position: 'WR', full_name: 'Wide Receiver Seven',
    dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 6000, divergenceSignal: null,
    dynRank: null, ktcRank: null, positionRank: 2, currentSeasonPPG: 12.0,
  },
  // Deliberately no row for 'ghost' — dynastyScore itself resolves to null.
]

const ktcMap = new Map([
  ['p1', { value: 7200 }],
  ['p2', { value: 3000 }],
  ['p4', { value: 4500 }],
  ['p6', { value: 5000 }],
  ['p7', { value: 6000 }],
  // p5 and p3 intentionally absent.
])

const seasonProjections = {
  p1: { projectedPPG: 20.5, projectedGames: 16, confidence: 'high', factors: {}, adjustmentSummary: ['Age curve: entering prime', 'Efficiency trending up'] },
  p5: { projectedPPG: 19.0, projectedGames: 16, confidence: 'high', factors: {}, adjustmentSummary: [] },
  p6: { projectedPPG: 12.0, projectedGames: 16, confidence: 'low', factors: {}, adjustmentSummary: [] },
  p7: { projectedPPG: 15.0, projectedGames: 16, confidence: 'low', factors: {}, adjustmentSummary: [] },
  // p4 intentionally absent — projection === null case.
}

const positionPeakPPG = { WR: 20, RB: 18, TE: 14, QB: 24, K: 5 }

const baseContextValue = {
  careerStats,
  playersMap,
  playerRows,
  positionPeakPPG,
  ktcMap,
  historicalShares: {},
  collegeStats: {},
  seasonProjections,
  enrichmentMap: {},
  advStats: { byId: {}, year: 2025 },
}

function renderModal(playerId, { myTeamName = 'My Team' } = {}) {
  return render(
    <ProfileDataContext.Provider value={baseContextValue}>
      <PlayerDetailModal playerId={playerId} myTeamName={myTeamName} />
    </ProfileDataContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PlayerDetailModal', () => {
  it('renders the identity row: name, position, meta', () => {
    renderModal('p1')
    // "Wide Receiver One" also appears in the RANK THIS SEASON rail (p1 is its own peer).
    expect(screen.getAllByText('Wide Receiver One').length).toBeGreaterThan(0)
    expect(screen.getAllByText('WR').length).toBeGreaterThan(0)
    expect(screen.getByText(/26.*DAL.*Year 6.*Owned by you/)).toBeInTheDocument()
  })

  it('renders the four tiles with real values', () => {
    renderModal('p1')
    expect(screen.getByTestId('tile-dynasty').textContent).toContain('82')
    expect(screen.getByTestId('tile-dynasty').textContent).toContain('Elite')
    expect(screen.getByTestId('tile-market').textContent).toContain('7,200')
    expect(screen.getByTestId('tile-next').textContent).toContain('20.5')
    expect(screen.getByTestId('tile-floor').textContent).toMatch(/±\d/)
  })

  it('Floor-risk tile shows only ±sd — no Low/Med/High word', () => {
    renderModal('p1')
    expect(screen.queryByText(/^(Low|Med|High)$/)).not.toBeInTheDocument()
  })

  it('omits the comps block when comps is empty (no candidates at p1\'s position)', () => {
    renderModal('p1')
    expect(screen.queryByText('Closest career comps')).not.toBeInTheDocument()
  })

  // "onClose fires on scrim click" / "onClose fires on Escape" moved to
  // PlayerDetailTabs.test.jsx (1b Slice v) — the scrim, panel and Escape handling now live in
  // the shell, not this body-only component. See PlayerDetailModal.jsx's header comment.

  // ── Empty states (§4.3) ────────────────────────────────────────────────────

  it('null dynastyScore (id absent from playerRows): identity + short body, never crashes', () => {
    renderModal('ghost')
    expect(screen.getByText('Ghost Player')).toBeInTheDocument()
    expect(screen.getByText('No dynasty data available for this player.')).toBeInTheDocument()
    expect(screen.queryByText('DYNASTY SCORE')).not.toBeInTheDocument()
  })

  it('null dynastyScore.components: one explanatory line, not five bars', () => {
    renderModal('p2')
    expect(screen.getByText('Component breakdown not available for this player.')).toBeInTheDocument()
    expect(screen.queryByText('Age-adjusted')).not.toBeInTheDocument()
  })

  it('null dynastyScore.signals: SIGNALS rail section omitted', () => {
    renderModal('p3')
    expect(screen.queryByText('SIGNALS')).not.toBeInTheDocument()
  })

  it('null projection: Next-season tile shows "—", no projection bar, chips omitted', () => {
    renderModal('p4')
    expect(screen.getByTestId('tile-next').textContent).toContain('—')
    expect(screen.queryByText(/'\d\d proj/)).not.toBeInTheDocument()
  })

  it('null ktcValue: Market value tile shows "—"', () => {
    renderModal('p5')
    expect(screen.getByTestId('tile-market').textContent).toContain('—')
  })

  it('computeConsistency === null: Floor risk shows "—"', () => {
    renderModal('p6')
    expect(screen.getByTestId('tile-floor').textContent).toContain('—')
  })

  it('computeConsistency non-null but sd === null: Floor risk shows "—" (null-object check alone would miss this)', () => {
    renderModal('p7')
    expect(screen.getByTestId('tile-floor').textContent).toContain('—')
  })

  it('POSITION IN PORTFOLIO reads "—" with a not-yours note when the player is not the user\'s', () => {
    renderModal('p4')
    expect(screen.getByText('Not on your roster.')).toBeInTheDocument()
  })

  it('POSITION IN PORTFOLIO computes a real share when the player is the user\'s', () => {
    renderModal('p1')
    expect(screen.getByText("Share of your roster's total market value.")).toBeInTheDocument()
  })
})
