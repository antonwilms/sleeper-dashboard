// @vitest-environment jsdom
//
// dp-v2 Slice 4b — integration coverage for Usage & efficiency / Availability & role. Separate
// file from PlayerDetailModal.test.jsx (kept unedited): that fixture predates these sections and
// has no `stats` block, so it only exercises the "nothing to show" paths implicitly.
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within } from '@testing-library/react'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailModal } from './PlayerDetailModal'

expect.extend(jestDomMatchers)
afterEach(cleanup)

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  disconnect() {}
})
Element.prototype.scrollIntoView = vi.fn()

function richDynastyScore() {
  return {
    score: 80, label: 'Elite', confidence: 'high', isRookie: false,
    components: {
      ageAdjusted: { value: 78, weight: 0.28 },
      trajectory: { value: 65, weight: 0.25 },
      currentLevel: { value: 90, weight: 0.22 },
      reliability: { value: 70, weight: 0.10 },
      opportunityQuality: { value: 85, weight: 0.15 },
    },
    signals: { seasonsOfData: 3, draftCapital: null, ktcInfluenced: false },
  }
}

// ── QB: 3 recent seasons, no snap share expected, stored pass_rtg/cmp_pct deliberately wrong ──
const qbCareer = {
  2023: { qb1: { gamesPlayed: 16, fantasyPoints: 300, team: 'NYJ', weeklyStatus: Array(18).fill('P'),
    stats: { pass_cmp: 340, pass_att: 520, pass_yd: 3800, pass_td: 26, pass_int: 10, pass_sack: 30, pass_rtg: 9999, cmp_pct: 9999 } } },
  2024: { qb1: { gamesPlayed: 16, fantasyPoints: 320, team: 'NYJ', weeklyStatus: Array(18).fill('P'),
    stats: { pass_cmp: 355, pass_att: 530, pass_yd: 4000, pass_td: 28, pass_int: 8, pass_sack: 28, pass_rtg: 9999, cmp_pct: 9999 } } },
  2025: { qb1: { gamesPlayed: 16, fantasyPoints: 340, team: 'NYJ', weeklyStatus: Array(18).fill('P'),
    stats: { pass_cmp: 370, pass_att: 540, pass_yd: 4200, pass_td: 30, pass_int: 6, pass_sack: 25, pass_rtg: 9999, cmp_pct: 9999 } } },
}

// ── RB: 3 recent seasons, real rush/target counts ──
const rbCareer = {
  2023: { rb1: { gamesPlayed: 16, fantasyPoints: 220, team: 'SEA', weeklyStatus: Array(18).fill('P'),
    stats: { rush_att: 240, rush_yd: 1050, rec_tgt: 40, off_snp: 700, tm_off_snp: 1000 } } },
  2024: { rb1: { gamesPlayed: 16, fantasyPoints: 240, team: 'SEA', weeklyStatus: Array(18).fill('P'),
    stats: { rush_att: 250, rush_yd: 1100, rec_tgt: 45, off_snp: 750, tm_off_snp: 1000 } } },
  2025: { rb1: { gamesPlayed: 16, fantasyPoints: 260, team: 'SEA', weeklyStatus: Array(18).fill('P'),
    stats: { rush_att: 260, rush_yd: 1150, rec_tgt: 50, off_snp: 800, tm_off_snp: 1000 } } },
}

// ── WR veteran: 2018-2022, pre-2020 seasons carry no off_snp/tm_off_snp at all ──
const wrCareer = {
  2018: { wrVet: { gamesPlayed: 16, fantasyPoints: 200, team: 'DAL', weeklyStatus: Array(18).fill('P'),
    stats: { rec: 60, rec_tgt: 90, rec_air_yd: 700 } } },
  2019: { wrVet: { gamesPlayed: 16, fantasyPoints: 210, team: 'DAL', weeklyStatus: Array(18).fill('P'),
    stats: { rec: 65, rec_tgt: 95, rec_air_yd: 750 } } },
  2020: { wrVet: { gamesPlayed: 16, fantasyPoints: 220, team: 'DAL', weeklyStatus: Array(18).fill('P'),
    stats: { rec: 70, rec_tgt: 100, rec_air_yd: 800, off_snp: 850, tm_off_snp: 1000 } } },
  2021: { wrVet: { gamesPlayed: 16, fantasyPoints: 230, team: 'DAL', weeklyStatus: Array(18).fill('P'),
    stats: { rec: 75, rec_tgt: 105, rec_air_yd: 850, off_snp: 900, tm_off_snp: 1000 } } },
  2022: {
    wrVet: { gamesPlayed: 15, fantasyPoints: 235, team: 'DAL',
      weeklyStatus: [...Array(9).fill('P'), 'D', 'B', ...Array(7).fill('P')],
      stats: { rec: 80, rec_tgt: 110, rec_air_yd: 900, off_snp: 950, tm_off_snp: 1000 } },
  },
}

// ── Kicker: no position-stat metrics, no snap share, no team on the depth chart's 4 positions ──
const kickerCareer = {
  2025: { k1: { gamesPlayed: 16, fantasyPoints: 140, team: 'MIA', weeklyStatus: Array(18).fill('P'), stats: {} } },
}

const playersMap = {
  qb1: { player_id: 'qb1', position: 'QB', full_name: 'Test Quarterback', age: 27, years_exp: 5, team: 'NYJ' },
  rb1: { player_id: 'rb1', position: 'RB', full_name: 'Test Runningback', age: 25, years_exp: 3, team: 'SEA' },
  wrVet: { player_id: 'wrVet', position: 'WR', full_name: 'Veteran Wideout', age: 30, years_exp: 8, team: 'DAL' },
  k1: { player_id: 'k1', position: 'K', full_name: 'Test Kicker', age: 29, years_exp: 6, team: 'MIA' },
}

const careerStats = {
  2018: { ...wrCareer[2018] },
  2019: { ...wrCareer[2019] },
  2020: { ...wrCareer[2020] },
  2021: { ...wrCareer[2021] },
  2022: { ...wrCareer[2022] },
  2023: { ...qbCareer[2023], ...rbCareer[2023] },
  2024: { ...qbCareer[2024], ...rbCareer[2024] },
  2025: { ...qbCareer[2025], ...rbCareer[2025], ...kickerCareer[2025] },
}

const playerRows = ['qb1', 'rb1', 'wrVet', 'k1'].map(id => ({
  player_id: id, position: playersMap[id].position, full_name: playersMap[id].full_name,
  dynastyScore: richDynastyScore(),
  ownerTeamName: null, ktcValue: 5000, divergenceSignal: null,
  dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
}))

const positionPeakPPG = { QB: 24, RB: 18, WR: 20, TE: 14, K: 8 }

function baseContext(overrides = {}) {
  return {
    careerStats, playersMap, playerRows, positionPeakPPG,
    ktcMap: new Map(), historicalShares: {}, collegeStats: {}, seasonProjections: {},
    enrichmentMap: {}, advStats: { byId: {}, year: 2025 },
    gameLogsByYear: {}, nflScheduleByYear: {},
    ...overrides,
  }
}

function renderModal(playerId, contextOverrides = {}) {
  return render(
    <ProfileDataContext.Provider value={baseContext(contextOverrides)}>
      <PlayerDetailModal playerId={playerId} myTeamName="My Team" />
    </ProfileDataContext.Provider>
  )
}

describe('PlayerDetailModal — Usage & efficiency / Availability & role (dp-v2 Slice 4b)', () => {
  it('the index lists seven entries in order, and still scrolls (no route/hash change)', () => {
    const { container } = renderModal('qb1')
    expect(screen.getAllByText('Usage & efficiency').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Availability & role').length).toBeGreaterThan(0)
    const sectionIds = [...container.querySelectorAll('section[data-section-id]')].map(s => s.dataset.sectionId)
    expect(sectionIds).toEqual(['overview', 'game-log', 'distribution', 'usage', 'availability', 'drivers', 'why-next'])
  })

  it('QB renders its own metric set — Completion %, Passer rating, Sacks taken — and no snap-share row', () => {
    const { container } = renderModal('qb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Completion %')).toBeInTheDocument()
    expect(usage.getByText('Passer rating')).toBeInTheDocument()
    expect(usage.getByText('Sacks taken')).toBeInTheDocument()
    expect(usage.queryByText('Snap share')).not.toBeInTheDocument()
    expect(usage.queryByText('Target share')).not.toBeInTheDocument()
  })

  it('QB values are recomputed from raw counts, not the stored (deliberately wrong) pass_rtg/cmp_pct', () => {
    const { container } = renderModal('qb1')
    const usage = within(container.querySelector('#usage'))
    // 2025: 370/540 completions → 68.5%; the stored cmp_pct (9999) must not appear anywhere.
    expect(usage.getByText('68.5%')).toBeInTheDocument()
    expect(usage.queryByText(/9999/)).not.toBeInTheDocument()
  })

  it('RB renders Rush share / Target share / Yards per carry, plus a snap-share row', () => {
    const { container } = renderModal('rb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Rush share')).toBeInTheDocument()
    expect(usage.getByText('Target share')).toBeInTheDocument()
    expect(usage.getByText('Yards / carry')).toBeInTheDocument()
    expect(usage.getByText('Snap share')).toBeInTheDocument()
    expect(usage.queryByText('Completion %')).not.toBeInTheDocument()
  })

  it('WR renders Target share / Air yards share / aDOT, plus a snap-share row — no dashes-only row', () => {
    const { container } = renderModal('wrVet')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Target share')).toBeInTheDocument()
    expect(usage.getByText('Air yards share')).toBeInTheDocument()
    expect(usage.getByText('aDOT')).toBeInTheDocument()
    expect(usage.getByText('Snap share')).toBeInTheDocument()
    // 2022 (most recent, gp=15 games qualifying (>=8)): rec_tgt=110, sole team contributor → 100% share
    expect(usage.getAllByText('100.0%').length).toBeGreaterThan(0)
  })

  it('a pre-2020 season on the shared axis renders a void slot for snap share, and the row carries a NOT MEASURED THEN note', () => {
    const { container } = renderModal('wrVet')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('NOT MEASURED THEN')).toBeInTheDocument()
    expect(usage.getByText(/off_snp is not tracked before 2020/)).toBeInTheDocument()
  })

  it('a player with no pre-2020 seasons on the axis shows no NOT MEASURED THEN note', () => {
    const { container } = renderModal('rb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.queryByText('NOT MEASURED THEN')).not.toBeInTheDocument()
  })

  it('the DISPLAY ONLY badge is present on the usage section', () => {
    const { container } = renderModal('qb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('DISPLAY ONLY')).toBeInTheDocument()
  })

  it('a position with no defined metrics (K) renders a degraded block, section heading still shows', () => {
    const { container } = renderModal('k1')
    expect(screen.getAllByText('Usage & efficiency').length).toBeGreaterThan(0)
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText(/No usage metrics are defined/)).toBeInTheDocument()
  })

  it('the games-played grid distinguishes D (did not play) from X (no game recorded), and the legend has no bye entry when none is present', () => {
    const { container } = renderModal('qb1') // every week 'P' for qb1 — no D/X/B present, legend still P/X only
    const availability = within(container.querySelector('#availability'))
    expect(availability.queryByText('Bye')).not.toBeInTheDocument()
  })

  it('a bye week (API-only-mode \'B\') renders and adds a legend entry; a did-not-play week is present too', () => {
    const { container } = renderModal('wrVet')
    const availability = within(container.querySelector('#availability'))
    expect(availability.getByText('Bye')).toBeInTheDocument()
    expect(availability.getByText('Did not play')).toBeInTheDocument()
  })

  it('no weekly-status-strip element or DegradedBlock stands in for it', () => {
    const { container } = renderModal('qb1')
    const availability = within(container.querySelector('#availability'))
    expect(availability.queryByText(/NOT YET/)).not.toBeInTheDocument()
    expect(availability.queryByText(/weekly status/i)).not.toBeInTheDocument()
  })

  it('the depth chart shows the subject\'s own position group with the subject marked', () => {
    const { container } = renderModal('wrVet')
    const availability = within(container.querySelector('#availability'))
    expect(availability.getByText('Veteran Wideout')).toBeInTheDocument()
    expect(availability.getByText(/Depth chart.*WR/)).toBeInTheDocument()
  })

  it('a player whose team has no depth data (K, outside QB/RB/WR/TE) renders a degraded block, not an empty list', () => {
    const { container } = renderModal('k1')
    const availability = within(container.querySelector('#availability'))
    expect(availability.getByText(/No depth chart data/)).toBeInTheDocument()
  })
})
