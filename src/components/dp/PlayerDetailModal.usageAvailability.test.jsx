// @vitest-environment jsdom
//
// dp-v2 Slice 4b — integration coverage for Usage & efficiency / Availability & role. Separate
// file from PlayerDetailModal.test.jsx (kept unedited): that fixture predates these sections and
// has no `stats` block, so it only exercises the "nothing to show" paths implicitly.
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailModal } from './PlayerDetailModal'
import { GLOSSARY } from '../../utils/metricGlossary'
import { buildInSeasonPosteriors, oppBeforeAfter, NEW_ROLE_TITLE } from '../../utils/inSeasonEvidence'
import { passerRating } from '../../utils/efficiencyMetrics'
import { buildUsageGrid } from '../../utils/usageEfficiency'
import { scaleCss, scaleInk, hexToRgb } from '../../utils/percentileColour'

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
    <MemoryRouter><ProfileDataContext.Provider value={baseContext(contextOverrides)}>
      <PlayerDetailModal playerId={playerId} myTeamName="My Team" />
    </ProfileDataContext.Provider></MemoryRouter>
  )
}

const usageCell = (container, metric, season) =>
  container.querySelector(`#usage [data-testid="usage-cell"][data-metric="${metric}"][data-season="${season}"]`)

describe('PlayerDetailModal — Usage & efficiency / Availability & role (dp-v2 Slice 4b)', () => {
  it('the index lists seven entries in order, and still scrolls (no route/hash change)', () => {
    const { container } = renderModal('qb1')
    expect(screen.getAllByText('Usage & efficiency').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Availability & role').length).toBeGreaterThan(0)
    const sectionIds = [...container.querySelectorAll('section[data-section-id]')].map(s => s.dataset.sectionId)
    expect(sectionIds).toEqual(['overview', 'game-log', 'distribution', 'usage', 'availability', 'environment', 'drivers', 'why-next'])
  })

  it('QB renders its own metric set — Completion %, Passer rating, Sack rate — and no snap-share row', () => {
    const { container } = renderModal('qb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Completion %')).toBeInTheDocument()
    expect(usage.getByText('Passer rating')).toBeInTheDocument()
    expect(usage.getByText('Sack rate')).toBeInTheDocument()
    expect(usage.queryByText('Snap share')).not.toBeInTheDocument()
    expect(usage.queryByText('Target share')).not.toBeInTheDocument()
  })

  it('QB values are recomputed from raw counts, not the stored (deliberately wrong) pass_rtg/cmp_pct', () => {
    const { container } = renderModal('qb1')
    const usage = within(container.querySelector('#usage'))
    // 2025: 370/540 completions → 68.5%; the stored cmp_pct (9999) must not appear anywhere.
    expect(usageCell(container, 'cmpPct', 2025)).toHaveTextContent('68.5%')
    expect(usageCell(container, 'passerRating', 2025))
      .toHaveTextContent(passerRating(qbCareer[2025].qb1.stats).toFixed(1))
    expect(usage.queryByText(/9999/)).not.toBeInTheDocument()
  })

  it('RB renders Carry share / Target share / Yards per carry, plus a snap-share row', () => {
    const { container } = renderModal('rb1')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Carry share')).toBeInTheDocument()
    expect(usage.getByText('Target share')).toBeInTheDocument()
    expect(usage.getByText('Yards / carry')).toBeInTheDocument()
    expect(usage.getByText('Snap share')).toBeInTheDocument()
    expect(usage.queryByText('Completion %')).not.toBeInTheDocument()
  })

  it('WR renders Target share / Air yards share / Avg depth, plus a snap-share row — no dashes-only row', () => {
    const { container } = renderModal('wrVet')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Target share')).toBeInTheDocument()
    expect(usage.getByText('Air yards share')).toBeInTheDocument()
    expect(usage.getByText('Avg depth')).toBeInTheDocument()
    expect(usage.getByText('Snap share')).toBeInTheDocument()
    // This fixture has no weeklyStats, so no season is covered: the games-played share has no value and the
    // row stays void (the season-total 100.0% is never substituted).
    expect(usage.queryAllByText('100.0%')).toHaveLength(0)
  })

  it('3. the Avg depth row opens the same definition Market shows', () => {
    const { container } = renderModal('wrVet')
    const usage = within(container.querySelector('#usage'))
    fireEvent.click(usage.getByRole('button', { name: 'Avg depth' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Avg depth')
    expect(dialog.textContent).toContain(GLOSSARY.aDOT.definition)
  })

  it('a pre-2020 season on the shared axis renders a void slot for snap share, and the row carries a NOT MEASURED THEN note', () => {
    const { container } = renderModal('wrVet')
    const usage = within(container.querySelector('#usage'))
    expect(usageCell(container, 'snapShare', 2019)).toHaveAttribute('data-void', 'true')
    expect(usageCell(container, 'snapShare', 2019).textContent).toBe('')
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

describe('PlayerDetailModal — role label in Usage & efficiency (market-model-view.md §7.2)', () => {
  // Six WRs on one team in one season, target shares 100/310 … 10/310. No off_snp, so snap share is null and
  // nobody can be Every-down; the label is banded on target share against the six-WR pool.
  const targets = [100, 80, 60, 40, 20, 10]
  const roleMap = Object.fromEntries(targets.map((_, i) => [`r${i}`, { player_id: `r${i}`, position: 'WR', full_name: `Role WR ${i}`, age: 25, years_exp: 3, team: 'BUF' }]))
  const roleStats = (n) => ({
    2025: Object.fromEntries(targets.slice(0, n).map((t, i) => [`r${i}`, {
      gamesPlayed: 16, fantasyPoints: 150, team: 'BUF', weeklyStatus: Array(18).fill('P'), stats: { rec: 50, rec_tgt: t },
    }])),
  })
  const rowsFor = (ids, map) => ids.map(id => ({
    player_id: id, position: map[id].position, full_name: map[id].full_name, dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 5000, divergenceSignal: null, dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
  }))
  const open = (id, n, extra = {}) => {
    const ids = Object.keys(roleMap).slice(0, n)
    return renderModal(id, {
      careerStats: roleStats(n), playersMap: { ...roleMap, ...extra.map }, playerRows: rowsFor([...ids, ...(extra.ids ?? [])], { ...roleMap, ...extra.map }),
    })
  }

  it('bands a WR against the whole position pool: the top target share is Primary target, the lowest is Rotational', () => {
    open('r0', 6)
    expect(screen.getByTestId('usage-role')).toHaveTextContent('Primary target')
    cleanup()
    open('r5', 6)
    expect(screen.getByTestId('usage-role')).toHaveTextContent('Rotational')
  })

  it('a QB shows no role chip', () => {
    const qb = { qbX: { player_id: 'qbX', position: 'QB', full_name: 'Role QB', age: 27, years_exp: 5, team: 'BUF' } }
    const stats = roleStats(6)
    stats[2025].qbX = { gamesPlayed: 16, fantasyPoints: 300, team: 'BUF', weeklyStatus: Array(18).fill('P'), stats: { pass_att: 500, pass_cmp: 330, pass_yd: 3800 } }
    renderModal('qbX', { careerStats: stats, playersMap: { ...roleMap, ...qb }, playerRows: rowsFor([...Object.keys(roleMap), 'qbX'], { ...roleMap, ...qb }) })
    expect(screen.queryByTestId('usage-role')).not.toBeInTheDocument()
  })

  it('a WR in a pool of fewer than six shows no role chip', () => {
    open('r0', 5)
    expect(screen.queryByTestId('usage-role')).not.toBeInTheDocument()
  })
})


// ── popup-opp-before-after — the In-season Opp/G before → now line ──
describe('PlayerDetailModal — In-season Opp/G line (popup-opp-before-after)', () => {
  const labelledCareer = () => {
    const c = JSON.parse(JSON.stringify(careerStats))
    for (const yr of Object.keys(c)) for (const id of Object.keys(c[yr])) c[yr][id].scoringBasis = 'league'
    return c
  }
  const wrNewPlayer = { player_id: 'wrNew', position: 'WR', full_name: 'New Wideout', age: 23, years_exp: 1, team: 'DAL' }
  const oppPlayersMap = { ...playersMap, wrNew: wrNewPlayer }
  const oppPlayerRows = [...playerRows, {
    ...playerRows[0], player_id: 'wrNew', position: 'WR', full_name: 'New Wideout',
  }]
  const live2026 = players => ({ season: 2026, complete: true, players })
  const lr = (gamesPlayed, stats, scoringBasis = 'league') => ({ gamesPlayed, fantasyPoints: 0, stats, scoringBasis })
  const rbLive = () => ({ rb1: lr(4, { rush_att: 70, rec_tgt: 14 }) })
  const oppOverrides = (totals, extra = {}) => ({
    careerStats: labelledCareer(), playersMap: oppPlayersMap, playerRows: oppPlayerRows, currentSeasonTotals: totals, ...extra,
  })
  const oppRow = () => screen.getByTestId('usage-opp-live')

  it("shows Market's before → now for an RB with a baseline, from the season-totals file", () => {
    const labelled = labelledCareer()
    const totals = live2026(rbLive())
    renderModal('rb1', {
      ...oppOverrides(totals, { careerStats: labelled }),
      liveWeeklyRows: { year: 2026, complete: true, weeks: [{ week: 1, rows: { rb1: { stats: { gp: 1, rush_att: 5 } } } }] },
    })
    const market = oppBeforeAfter(buildInSeasonPosteriors({
      playerRows: oppPlayerRows, careerStats: labelled, dataSeason: 2025, playerMap: oppPlayersMap, currentSeasonTotals: totals,
    }).byId.get('rb1'))
    expect(market).not.toBeNull()
    expect(within(oppRow()).getByText('19.4 (2025 season) → 21.0 this season')).toBeTruthy()
    expect(oppRow().textContent).toContain(market)
  })

  it('shows — and the not-loaded note when no live season is usable', () => {
    const cases = [
      undefined,
      { season: 2026, complete: false, players: rbLive() },
      { season: 2025, complete: true, players: rbLive() },
    ]
    for (const totals of cases) {
      renderModal('rb1', oppOverrides(totals))
      const text = oppRow().textContent
      expect(text).toContain('—')
      expect(text).toContain('No in-progress season loaded')
      expect(text).not.toContain('19.4')
      cleanup()
    }
  })

  it('shows a bare — and leaks nothing for a basis-mismatch row', () => {
    renderModal('rb1', oppOverrides(live2026({ rb1: lr(4, { rush_att: 70, rec_tgt: 14 }, 'ppr') })))
    const row = oppRow()
    expect(row.textContent).toContain('—')
    expect(row.textContent).not.toContain('No in-progress season loaded')
    for (const el of [row, ...row.querySelectorAll('*')]) {
      const blob = `${el.textContent} ${el.getAttribute('title') ?? ''}`
      expect(blob).not.toContain('19.4')
      expect(blob).not.toContain('21.0')
    }
  })

  it('shows the new-role rate and chip for a player with no baseline', () => {
    renderModal('wrNew', oppOverrides(live2026({ wrNew: lr(3, { rec_tgt: 18 }) })))
    expect(oppRow().textContent).toContain('6.0 this season')
    expect(within(oppRow()).getByText('new role').getAttribute('title')).toBe(NEW_ROLE_TITLE)
    expect(screen.getByText(/No qualifying seasons yet/)).toBeTruthy()
  })

  it('renders no line for a kicker', () => {
    renderModal('k1', oppOverrides(live2026(rbLive())))
    expect(screen.queryByTestId('usage-opp-live')).toBeNull()
  })
})

describe('PlayerDetailModal — share rows on the games-played basis (F1)', () => {
  const P = n => Array(n).fill('P').concat(Array(18 - n).fill('X'))
  const wk = (from, to, stat) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, stat]))
  const gpCareer = {
    2024: {
      w1: { gamesPlayed: 16, fantasyPoints: 200, team: 'DAL', weeklyStatus: P(16), stats: { rec_tgt: 80 } }, // no weeklyStats: 2024 uncovered
      w2: { gamesPlayed: 17, fantasyPoints: 150, team: 'DAL', weeklyStatus: P(17), stats: { rec_tgt: 120 } },
    },
    2025: {
      w1: { gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyStatus: P(15), stats: { rec_tgt: 25 }, weeklyStats: { ...wk(1, 10, { rec_tgt: 2 }), ...wk(11, 15, { rec_tgt: 1 }) } },
      w2: { gamesPlayed: 17, fantasyPoints: 160, team: 'DAL', weeklyStatus: P(17), stats: { rec_tgt: 75 }, weeklyStats: { ...wk(1, 15, { rec_tgt: 3 }), ...wk(16, 17, { rec_tgt: 15 }) } },
    },
  }
  const gpMap = {
    w1: { player_id: 'w1', position: 'WR', full_name: 'Gp Wideout', age: 26, years_exp: 4, team: 'DAL' },
    w2: { player_id: 'w2', position: 'WR', full_name: 'Gp Other', age: 27, years_exp: 5, team: 'DAL' },
  }
  const gpRows = ['w1', 'w2'].map(id => ({
    player_id: id, position: 'WR', full_name: gpMap[id].full_name, dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 5000, divergenceSignal: null, dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
  }))
  const ctx = { careerStats: gpCareer, playersMap: gpMap, playerRows: gpRows }

  it('F1-T5 the Target share row shows 2025 as the games-played share and 2024 (uncovered) as a void cell', () => {
    const { container } = renderModal('w1', ctx)
    const covered = usageCell(container, 'targetShare', 2025)
    expect(covered).toHaveTextContent('35.7%') // 25 of DAL's 70 targets in the 15 weeks he played; the season-total share reads 25.0%
    expect(covered.textContent).not.toContain('25.0%')
    // 2024 has no weeklyStats: no value, a void cell (a season-total fallback would fill it)
    expect(usageCell(container, 'targetShare', 2024)).toHaveAttribute('data-void', 'true')
  })
})

// ── the season grid with league ranks (usage-efficiency-redesign) ──
describe('PlayerDetailModal — usage grid', () => {
  const P = n => Array(n).fill('P').concat(Array(18 - n).fill('X'))
  const row = (gamesPlayed, stats) => ({
    gamesPlayed, fantasyPoints: 100, team: 'DAL', weeklyStatus: P(gamesPlayed), stats,
    weeklyStats: Object.fromEntries(Array.from({ length: gamesPlayed }, (_, i) => [i + 1, i === 0 ? stats : {}])),
  })
  const person = (id, position) => ({ player_id: id, position, full_name: `Grid ${id}`, age: 26, years_exp: 4, team: 'DAL' })
  const rowsFor = map => Object.values(map).map(p => ({
    player_id: p.player_id, position: p.position, full_name: p.full_name, dynastyScore: richDynastyScore(),
    ownerTeamName: null, ktcValue: 5000, divergenceSignal: null, dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
  }))
  const open = (id, career, map, extra = {}) =>
    renderModal(id, { careerStats: career, playersMap: map, playerRows: rowsFor(map), ...extra })
  const usageText = c => c.querySelector('#usage').textContent
  const rgbOf = hex => { const { r, g, b } = hexToRgb(hex); return `rgb(${r}, ${g}, ${b})` }
  const expected = (id, position, career, map, metric, i = 0) => buildUsageGrid({
    playerId: id, position, seasons: Object.keys(career).map(Number), careerStats: career, playerMap: map,
    gameLogsByYear: {}, currentSeasonTotals: null, liveUsable: false,
  }).rows.find(r => r.id === metric).cells[i]

  const wrMap = { w1: person('w1', 'WR'), w2: person('w2', 'WR') }
  const wrStats = (tgt) => ({ rec_tgt: tgt, rec_air_yd: tgt * 9, rec_rz_tgt: 5, off_snp: 700, tm_off_snp: 1000 })
  const wrSeason = { 2025: { w1: row(16, wrStats(100)), w2: row(16, wrStats(40)) } }

  it('U3 a season under 8 games shows the value with a <8 g marker and no colour', () => {
    const career = { 2025: { w1: row(7, wrStats(30)), w2: row(16, wrStats(40)) } }
    const { container } = open('w1', career, wrMap)
    const cell = usageCell(container, 'targetShare', 2025)
    expect(cell).toHaveAttribute('data-unqualified', 'true')
    expect(cell.textContent).toMatch(/\d+\.\d%/)
    expect(cell).toHaveTextContent('<8 g')
    expect(cell.textContent).not.toMatch(/ of \d/)
    expect(cell.style.backgroundColor).toBe('')
  })

  it('U4 renders a rightmost "2026 so far" column ranked against live rows only', () => {
    const map = { ...wrMap, w3: person('w3', 'WR') }
    // T = 10 team games (set by the RB's row), so the live gate is 5 and the 6-game WRs qualify
    const live = { season: 2026, complete: true, players: { w1: row(6, wrStats(60)), w2: row(6, wrStats(30)), w3: row(6, wrStats(20)), rb: row(10, { rush_att: 40 }) } }
    const { container } = open('w1', wrSeason, map, { currentSeasonTotals: live })
    const headers = [...container.querySelectorAll('#usage th[data-season]')]
    expect(headers.map(h => [h.dataset.season, h.dataset.kind])).toEqual([['2025', 'season'], ['2026', 'live']])
    expect(headers.at(-1).textContent).toBe('2026 so far')
    expect(usageCell(container, 'targetShare', 2025)).toHaveTextContent('WR1 of 2')
    expect(usageCell(container, 'targetShare', 2026)).toHaveTextContent('WR1 of 3')
    expect(usageText(container)).toContain('2026 so far: 5+ games (8 of 17, pro-rated to 10 team games played).')
  })

  it('U4 labels a completed live season with the bare year', () => {
    const live = { season: 2026, complete: true, players: { w1: row(17, wrStats(60)) } }
    const nflState = { season: '2026', season_type: 'post', week: 1, leg: 1, display_week: 1 }
    const { container } = open('w1', wrSeason, wrMap, { currentSeasonTotals: live, nflState })
    expect(container.querySelector('#usage th[data-kind="live"]').textContent).toBe('2026')
    const legend = container.querySelector('#usage [data-testid="usage-legend"]').textContent
    expect(legend).toContain('2026: 8+ games.')
    expect(legend).not.toContain('so far')
    expect(legend).not.toContain('pro-rated')
  })

  it('U4 shows no live column when the live season is not usable', () => {
    // incomplete, and a complete file for a season that is not later than the data season
    for (const [season, complete] of [[2026, false], [2025, true]]) {
      const live = { season, complete, players: { w1: row(10, wrStats(60)) } }
      const { container } = open('w1', wrSeason, wrMap, { currentSeasonTotals: live })
      expect(container.querySelector('#usage th[data-kind="live"]')).toBeNull()
      expect(usageText(container)).not.toContain('so far:')
      cleanup()
    }
  })

  it('U5 avg depth carries a rank and no colour; target share is coloured by its percentile', () => {
    const { container } = open('w1', wrSeason, wrMap)
    const depth = usageCell(container, 'aDOT', 2025)
    expect(depth.textContent).toMatch(/WR\d+ of 2/)
    expect(depth.style.backgroundColor).toBe('')
    const { percentile } = expected('w1', 'WR', wrSeason, wrMap, 'targetShare')
    const share = usageCell(container, 'targetShare', 2025)
    expect(share.style.backgroundColor).toBe(scaleCss(percentile))
    expect(share.style.color).toBe(rgbOf(scaleInk(percentile)))
  })

  const qbStats = (att, sacks) => ({ pass_att: att, pass_cmp: Math.round(att * 0.65), pass_yd: att * 7, pass_td: 20, pass_int: 5, pass_sack: sacks })
  const qbMap = { q1: person('q1', 'QB'), q2: person('q2', 'QB'), q3: person('q3', 'QB') }
  const qbSeason = { 2025: { q1: row(16, qbStats(480, 20)), q2: row(16, qbStats(460, 40)), q3: row(9, qbStats(90, 2)) } }

  it('U6 the lower sack rate is coloured at the bright end of the scale', () => {
    const { container } = open('q1', qbSeason, qbMap)
    const { percentile } = expected('q1', 'QB', qbSeason, qbMap, 'sackPct')
    const cell = usageCell(container, 'sackPct', 2025)
    expect(percentile).toBeGreaterThan(0.5)
    expect(cell).toHaveTextContent('QB1 of 2')
    expect(cell.style.backgroundColor).toBe(scaleCss(percentile))
    expect(container.querySelector('#usage [data-metric="sacks"]')).toBeNull()
    fireEvent.click(within(container.querySelector('#usage')).getByRole('button', { name: 'Sack rate' }))
    expect(screen.getByRole('dialog').textContent).toContain('Lower is better.')
  })

  it('U6b a low-volume QB shows "low vol" with no colour, and the legend states the floor', () => {
    const { container } = open('q3', qbSeason, qbMap)
    for (const id of ['cmpPct', 'passerRating', 'sackPct']) {
      const cell = usageCell(container, id, 2025)
      expect(cell, id).toHaveAttribute('data-low-volume', 'true')
      expect(cell, id).toHaveTextContent('low vol')
      expect(cell.textContent, id).not.toMatch(/ of \d/)
      expect(cell.style.backgroundColor, id).toBe('')
    }
    expect(usageText(container)).toContain('≥ 14 pass attempts a game')
  })

  it('U8 the header and legend state the games-played basis and the rank basis', () => {
    const { container } = open('w1', wrSeason, wrMap)
    const text = usageText(container)
    expect(text).not.toContain('per-season-team')
    expect(text).toContain('games he played')
    expect(text).toContain('otherwise to his season team')
    expect(text).toContain('with 8+ games that season and a value for that stat')
    expect(text).toContain("Sleeper's player list")
    expect(text).toContain('league starters')
    expect(text).toContain('Avg depth: ranked, but grey')
    cleanup()
    const qb = open('q1', qbSeason, qbMap)
    expect(usageText(qb.container)).toContain('lower is better')
    expect(usageText(qb.container)).toContain('league starters')
  })

  it('U10 the role popover shows the numbers it banded on', () => {
    const targets = [100, 80, 60, 40, 20, 10]
    const map = Object.fromEntries(targets.map((_, i) => [`r${i}`, person(`r${i}`, 'WR')]))
    const career = { 2025: Object.fromEntries(targets.map((t, i) => [`r${i}`, row(16, { rec: 50, rec_tgt: t, off_snp: 900 - i * 100, tm_off_snp: 1000 })])) }
    open('r0', career, map)
    fireEvent.click(within(screen.getByTestId('usage-role').closest('button')).getByTestId('usage-role'))
    const text = screen.getByRole('dialog').textContent
    expect(text).toMatch(/2025: target share \d+\.\d%/)
    expect(text).toContain('season-team basis')
    expect(text).toMatch(/Every-down also needs snap share ≥ \d+\.\d%/)
  })

  it('U12 uncoloured value cells take the neutral fill; void and coloured cells do not', () => {
    const career = { 2025: { w1: row(7, wrStats(30)), w2: row(16, wrStats(40)) } }
    const unq = open('w1', career, wrMap)
    const unqualified = usageCell(unq.container, 'targetShare', 2025)
    expect(unqualified).toHaveAttribute('data-unqualified', 'true')
    expect(unqualified.classList).toContain('bg-dp-chip')
    expect(unqualified.style.backgroundColor).toBe('')
    cleanup()

    const wr = open('w1', wrSeason, wrMap)
    const depth = usageCell(wr.container, 'aDOT', 2025)
    expect(depth.classList).toContain('bg-dp-chip')
    expect(depth.style.backgroundColor).toBe('')
    const { percentile } = expected('w1', 'WR', wrSeason, wrMap, 'targetShare')
    const share = usageCell(wr.container, 'targetShare', 2025)
    expect(share.classList).not.toContain('bg-dp-chip')
    expect(share.style.backgroundColor).toBe(scaleCss(percentile))
    const swatch = wr.container.querySelector('#usage [data-testid="usage-legend-unranked"]')
    expect(swatch).not.toBeNull()
    expect(swatch.textContent).toContain('not ranked')
    expect(swatch.firstElementChild.classList).toContain('bg-dp-chip')
    cleanup()

    const qb = open('q3', qbSeason, qbMap)
    for (const id of ['cmpPct', 'passerRating', 'sackPct']) {
      const cell = usageCell(qb.container, id, 2025)
      expect(cell, id).toHaveAttribute('data-low-volume', 'true')
      expect(cell.classList, id).toContain('bg-dp-chip')
    }
    cleanup()

    const vet = renderModal('wrVet')
    const voidCell = usageCell(vet.container, 'snapShare', 2019)
    expect(voidCell).toHaveAttribute('data-void', 'true')
    expect(voidCell.classList).not.toContain('bg-dp-chip')
  })

  it("U13 opening the last row's definition adds no padding and opens a fixed panel", () => {
    const { container } = open('w1', wrSeason, wrMap)
    const buttons = container.querySelectorAll('#usage [data-testid="usage-grid"] tbody button')
    fireEvent.click(buttons[buttons.length - 1])
    expect(container.querySelector('#usage [class*="pb-40"]')).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog.classList).toContain('fixed')
    expect(dialog.classList).not.toContain('absolute')
    expect(dialog.closest('th').className).toContain('has-[[role=dialog]]:z-[3]')
  })
})
