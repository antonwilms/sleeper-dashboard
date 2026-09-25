// @vitest-environment jsdom
//
// dp-v2 Slice 4a — integration coverage for the Game log / Distribution sections. A separate
// file from PlayerDetailModal.test.jsx (kept unedited, per the task file): that file's context
// fixture predates gameLogsByYear/nflScheduleByYear and exercises the "family not wired at all"
// degraded path implicitly. This file wires real fixtures for both keys.
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

function makeWeekly(n, val) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), val]))
}

// A rescored live-API-shaped row (weekly-points-display-basis.md §2.1): the served weeks are the
// display series (basis 'league'), so Game log / Distribution render exactly `weeklyPoints`.
function liveApiRow(row) {
  return { ...row, scoringBasis: 'league', sourceScoringBasis: null, sourceWeeklyPoints: row.weeklyPoints ?? null }
}

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

// Three qualifying seasons (gp >= 8) per player so computeConsistency pools a real SD —
// 2023/2024 qualify for every player; 2025 (mostRecentSeason) carries the small, hand-built
// weeklyStatus/weeklyPoints the Game log section reads.
function careerStatsFor(playerId, position, { weeklyStatus, weeklyPoints, gp2025 = 2 }) {
  return {
    2023: { [playerId]: liveApiRow({ gamesPlayed: 15, fantasyPoints: 210, team: 'DAL', weeklyPoints: makeWeekly(15, 14.0) }) },
    2024: { [playerId]: liveApiRow({ gamesPlayed: 16, fantasyPoints: 256, team: 'DAL', weeklyPoints: makeWeekly(16, 16.0) }) },
    2025: { [playerId]: liveApiRow({ gamesPlayed: gp2025, fantasyPoints: 30, team: 'DAL', weeklyStatus, weeklyPoints }) },
  }
}

const qbWeeklyStatus = ['P', 'P', 'B', ...Array(15).fill(undefined)]
const qbWeeklyPoints = { 1: 24.6, 2: 18.2 }
const qbGames = [
  { week: 1, seasonType: 'REG', team: 'DAL', opponent: 'NYG', completions: 22, attempts: 34, passingYards: 290, passingTds: 2, passingInterceptions: 1, passingEpa: 6.8 },
  { week: 2, seasonType: 'REG', team: 'DAL', opponent: 'PHI', completions: 18, attempts: 27, passingYards: 210, passingTds: 1, passingInterceptions: 0, passingEpa: 2.1 },
]

const rbWeeklyStatus = ['P', ...Array(17).fill(undefined)]
const rbWeeklyPoints = { 1: 15.4 }
const rbGames = [
  { week: 1, seasonType: 'REG', team: 'DAL', opponent: 'NYG', carries: 18, rushingYards: 84, rushingTds: 1, targets: 3, receptions: 2, rushingEpa: 4.5 },
]

const wrWeeklyStatus = ['P', ...Array(17).fill(undefined)]
const wrWeeklyPoints = { 1: 19.8 }
const wrGames = [
  { week: 1, seasonType: 'REG', team: 'DAL', opponent: 'NYG', targets: 8, receptions: 5, receivingYards: 76, receivingTds: 1, receivingAirYards: 96, receivingEpa: 3.2 },
]

// Dome game for week 1 — temp/wind null, roof 'dome'.
const scheduleGames2025 = [
  { week: 1, gameType: 'REG', homeTeam: 'DAL', awayTeam: 'NYG', homeScore: 27, awayScore: 20, result: 7, spreadLine: -3, totalLine: 45, roof: 'dome', temp: null, wind: null },
  { week: 2, gameType: 'REG', homeTeam: 'PHI', awayTeam: 'DAL', homeScore: 21, awayScore: 24, result: -3, spreadLine: 2, totalLine: 44, roof: 'outdoors', temp: 58, wind: 9 },
]

const playersMap = {
  qb1: { player_id: 'qb1', position: 'QB', full_name: 'Test Quarterback', age: 27, years_exp: 5, team: 'DAL' },
  rb1: { player_id: 'rb1', position: 'RB', full_name: 'Test Runningback', age: 25, years_exp: 3, team: 'DAL' },
  wr1: { player_id: 'wr1', position: 'WR', full_name: 'Test Receiver', age: 24, years_exp: 2, team: 'DAL' },
  noGames: { player_id: 'noGames', position: 'WR', full_name: 'No Games Player', age: 23, years_exp: 1, team: 'DAL' },
}

const careerStats = {
  2023: {
    ...careerStatsFor('qb1', 'QB', {})[2023],
    ...careerStatsFor('rb1', 'RB', {})[2023],
    ...careerStatsFor('wr1', 'WR', {})[2023],
    ...careerStatsFor('noGames', 'WR', {})[2023],
  },
  2024: {
    ...careerStatsFor('qb1', 'QB', {})[2024],
    ...careerStatsFor('rb1', 'RB', {})[2024],
    ...careerStatsFor('wr1', 'WR', {})[2024],
    ...careerStatsFor('noGames', 'WR', {})[2024],
  },
  2025: {
    qb1: liveApiRow({ gamesPlayed: 2, fantasyPoints: 42.8, team: 'DAL', weeklyStatus: qbWeeklyStatus, weeklyPoints: qbWeeklyPoints }),
    rb1: liveApiRow({ gamesPlayed: 1, fantasyPoints: 15.4, team: 'DAL', weeklyStatus: rbWeeklyStatus, weeklyPoints: rbWeeklyPoints }),
    wr1: liveApiRow({ gamesPlayed: 1, fantasyPoints: 19.8, team: 'DAL', weeklyStatus: wrWeeklyStatus, weeklyPoints: wrWeeklyPoints }),
    // noGames: no 2025 entry at all — the "has a score but no games" fixture (task file §6)
  },
}

const playerRows = ['qb1', 'rb1', 'wr1', 'noGames'].map(id => ({
  player_id: id, position: playersMap[id].position, full_name: playersMap[id].full_name,
  dynastyScore: richDynastyScore(),
  ownerTeamName: null, ktcValue: 5000, divergenceSignal: null,
  dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
}))

const positionPeakPPG = { QB: 24, RB: 18, WR: 20, TE: 14 }

const gameLogsByYear = {
  2025: {
    complete: true, year: 2025, rowCount: 5000,
    players: {
      qb1: { games: qbGames },
      rb1: { games: rbGames },
      wr1: { games: wrGames },
      // noGames: absent from the family entirely
    },
  },
}
const nflScheduleByYear = {
  2025: { complete: true, year: 2025, rowCount: 285, games: scheduleGames2025 },
}

function baseContext(overrides = {}) {
  return {
    careerStats, playersMap, playerRows, positionPeakPPG,
    ktcMap: new Map(), historicalShares: {}, collegeStats: {}, seasonProjections: {},
    enrichmentMap: {}, advStats: { byId: {}, year: 2025 },
    gameLogsByYear, nflScheduleByYear,
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

describe('PlayerDetailModal — Game log / Distribution (dp-v2 Slice 4a)', () => {
  it('the index lists Overview, Game log and Distribution in order (position among 4b/4c\'s later sections is out of scope here)', () => {
    const { container } = renderModal('qb1')
    expect(screen.getAllByText('Game log').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Distribution').length).toBeGreaterThan(0)
    expect(container.querySelector('#game-log')).toBeInTheDocument()
    expect(container.querySelector('#distribution')).toBeInTheDocument()
    // dp-v2 Slice 4b inserted 'usage'/'availability' between 'distribution' and 'drivers' — this
    // array is a strict order check, not a >0 assertion, so it needs the two new ids to stay
    // green. (The 4b task file's claim that only this test's title was stale did not hold for
    // this one line; corrected here rather than left broken.)
    const sectionIds = [...container.querySelectorAll('section[data-section-id]')].map(s => s.dataset.sectionId)
    expect(sectionIds).toEqual(['overview', 'game-log', 'distribution', 'usage', 'availability', 'environment', 'drivers', 'why-next'])
  })

  it('QB gets CMP/ATT and EPA/ATT headers, not the receiver columns', () => {
    const { container } = renderModal('qb1')
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText('CMP/ATT')).toBeInTheDocument()
    expect(gameLog.getByText('EPA/ATT')).toBeInTheDocument()
    expect(gameLog.queryByText('aDOT')).not.toBeInTheDocument()
    expect(gameLog.getByText('22/34')).toBeInTheDocument() // week 1 CMP/ATT value, not a dash column
  })

  it('RB gets CAR/EPA-CAR headers and real values', () => {
    const { container } = renderModal('rb1')
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText('CAR')).toBeInTheDocument()
    expect(gameLog.getByText('EPA/CAR')).toBeInTheDocument()
    expect(gameLog.getByText('18')).toBeInTheDocument() // carries
  })

  it('WR gets aDOT/EPA-TGT headers and real values', () => {
    const { container } = renderModal('wr1')
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText('aDOT')).toBeInTheDocument()
    expect(gameLog.getByText('EPA/TGT')).toBeInTheDocument()
    expect(gameLog.getByText('76')).toBeInTheDocument() // receiving yards
  })

  it('a bye week renders the labelled BYE row, distinct from a played row', () => {
    const { container } = renderModal('qb1')
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText(/BYE — no row exists in the source/)).toBeInTheDocument()
  })

  it('a dome game renders "—" for weather, never "0"', () => {
    const { container } = renderModal('qb1')
    const gameLog = within(container.querySelector('#game-log'))
    // Week 1 is the dome game (temp/wind null) — its row's weather cell must not read "0° / 0mph"
    expect(gameLog.queryByText(/0°/)).not.toBeInTheDocument()
    expect(gameLog.queryByText(/0mph/)).not.toBeInTheDocument()
  })

  it('RESULT is derived per the player\'s team, not the raw home-margin field', () => {
    const { container } = renderModal('qb1')
    const gameLog = within(container.querySelector('#game-log'))
    // Week 1: DAL home, result=7 → DAL W 27-20. Week 2: DAL away, result=-3 → DAL W 24-21.
    expect(gameLog.getByText('W 27-20')).toBeInTheDocument()
    expect(gameLog.getByText('W 24-21')).toBeInTheDocument()
  })

  it('a player with no gamelogs entry (family loaded, player absent) renders a DegradedBlock, section still shows its heading', () => {
    renderModal('noGames')
    expect(screen.getAllByText('Game log').length).toBeGreaterThan(0)
    expect(screen.getByText(/No recorded games for No Games Player/)).toBeInTheDocument()
  })

  it('gameLogsByYear/nflScheduleByYear entirely missing for the season: DegradedBlock, not a crash', () => {
    renderModal('qb1', { gameLogsByYear: {}, nflScheduleByYear: {} })
    expect(screen.getAllByText('Game log').length).toBeGreaterThan(0)
    expect(screen.getByText(/isn.t available/)).toBeInTheDocument()
  })

  it('Distribution (league-scored weekly rows): game count matches its own shape block, and its SD matches the Overview tile\'s underlying value', () => {
    renderModal('qb1')
    // 2023 (15) + 2024 (16) qualify (gp>=8); 2025 (gp=2) does not — pooled = 31 games.
    expect(screen.getByTestId('dist-over20').textContent).toBe('0 of 31')
    expect(screen.getByTestId('dist-under10').textContent).toBe('0 of 31')

    // Overview tile's Floor-risk value and Distribution's SD row must agree to the same rounding.
    const floorTile = screen.getByTestId('tile-floor').textContent
    const sdMatch = floorTile.match(/±([\d.]+)/)
    expect(sdMatch).not.toBeNull()
    expect(screen.getByTestId('dist-sd').textContent).toBe(`±${sdMatch[1]}`)

    const dist = screen.getByTestId('dist-basis').textContent
    expect(dist).toContain('first loaded')
    expect(dist).not.toContain('half-PPR')
  })

  it('Distribution renders its heading even for a player with no qualifying seasons', () => {
    renderModal('qb1', {
      careerStats: { 2025: { qb1: liveApiRow({ gamesPlayed: 2, fantasyPoints: 10, team: 'DAL', weeklyStatus: qbWeeklyStatus, weeklyPoints: qbWeeklyPoints }) } },
    })
    expect(screen.getAllByText('Distribution').length).toBeGreaterThan(0)
  })
})

// weekly-points-display-basis.md §5.3
const stat = (weeks) => Object.fromEntries(weeks.map((v, i) => [String(i + 1), v]))
const sdOf = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) }
const src24 = [10, 12, 8, 14, 6, 16, 9, 11, 13, 7, 15, 10]
const src25 = [20, 5, 18, 7, 15, 9, 12, 14, 6, 17, 10, 11]
const scaleBy = (xs, r) => xs.map(v => Math.round(v * r * 100) / 100)
// A rescored store row: scaled weeklyPoints, source (half-PPR) weeks preserved.
const halfPprRow = (source, ratio) => ({
  gamesPlayed: source.length, fantasyPoints: 150, team: 'DAL',
  scoringBasis: 'league', sourceScoringBasis: 'half_ppr',
  weeklyPoints: stat(scaleBy(source, ratio)), sourceWeeklyPoints: stat(source),
})
const wrCareer = (row2025, extra = {}) => ({
  2024: { wr1: halfPprRow(src24, 1.3) },
  2025: { wr1: { weeklyStatus: wrWeeklyStatus, ...row2025 } },
  ...extra,
})
const wrGameLogRow = (over) => ({ gamesPlayed: 1, fantasyPoints: 19.8, team: 'DAL', ...over })

describe('PlayerDetailModal — weekly points display basis', () => {
  it('Game log PTS renders the half-PPR source week, not the scaled one, with the half-PPR caption', () => {
    const cs = wrCareer(wrGameLogRow({ scoringBasis: 'league', sourceScoringBasis: 'half_ppr', weeklyPoints: { 1: 20.0 }, sourceWeeklyPoints: { 1: 17.3 } }))
    const { container } = renderModal('wr1', { careerStats: cs })
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText('17.3')).toBeInTheDocument()
    expect(gameLog.queryByText('20.0')).not.toBeInTheDocument()
    const cap = screen.getByTestId('game-log-basis').textContent
    expect(cap).toContain('half-PPR')
    expect(cap).toContain("won't necessarily add up")
  })

  it('a rescored live-API row renders its source week under the league-scored caption (no half-PPR claim)', () => {
    const cs = wrCareer(wrGameLogRow({ scoringBasis: 'league', sourceScoringBasis: null, weeklyPoints: { 1: 20.0 }, sourceWeeklyPoints: { 1: 19.1 } }))
    const { container } = renderModal('wr1', { careerStats: cs })
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.getByText('19.1')).toBeInTheDocument()
    const cap = screen.getByTestId('game-log-basis').textContent
    expect(cap).toContain('league-scored')
    expect(cap).not.toContain('half-PPR')
    expect(cap).toContain('first loaded')
  })

  it('a raw unrescored live-API row (no label, no source fields): PTS is — and no caption renders', () => {
    const cs = wrCareer(wrGameLogRow({ weeklyPoints: { 1: 20.0 } }))
    const { container } = renderModal('wr1', { careerStats: cs })
    const gameLog = within(container.querySelector('#game-log'))
    expect(gameLog.queryByText('20.0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('game-log-basis')).not.toBeInTheDocument()
    const week1Row = [...container.querySelectorAll('#game-log table tbody tr')]
      .find(tr => tr.querySelector('td')?.textContent === '1')
    expect(week1Row).toBeTruthy()
    const cells = week1Row.querySelectorAll('td')
    expect(cells[cells.length - 1].textContent).toBe('—')
  })

  it('no caption under an all-— PTS column (rescored half-PPR row whose served series is null)', () => {
    const cs = wrCareer(wrGameLogRow({ scoringBasis: 'league', sourceScoringBasis: 'half_ppr', weeklyPoints: null, sourceWeeklyPoints: null }))
    renderModal('wr1', { careerStats: cs })
    expect(screen.queryByTestId('game-log-basis')).not.toBeInTheDocument()
  })

  it('Distribution on rescored half-PPR rows: SD is the source SD, differs from the league-scaled Overview tile, half-PPR caption', () => {
    const cs = { 2024: { wr1: halfPprRow(src24, 1.3) }, 2025: { wr1: { weeklyStatus: wrWeeklyStatus, ...halfPprRow(src25, 1.1) } } }
    renderModal('wr1', { careerStats: cs })
    const sourceSd = sdOf([...src24, ...src25])
    const scaledSd = sdOf([...scaleBy(src24, 1.3), ...scaleBy(src25, 1.1)])
    expect(sourceSd.toFixed(1)).not.toBe(scaledSd.toFixed(1)) // the fixture can tell the two apart
    expect(screen.getByTestId('dist-sd').textContent).toBe(`±${sourceSd.toFixed(1)}`)
    const tileSd = screen.getByTestId('tile-floor').textContent.match(/±([\d.]+)/)[1]
    expect(tileSd).toBe(scaledSd.toFixed(1))
    expect(screen.getByTestId('dist-sd').textContent).not.toBe(`±${tileSd}`)
    expect(screen.getByTestId('dist-basis').textContent).toContain('half-PPR')
  })

  it('Distribution over a mixed window lists each season under its own basis', () => {
    const live25 = { weeklyStatus: wrWeeklyStatus, gamesPlayed: 12, fantasyPoints: 150, team: 'DAL', scoringBasis: 'league', sourceScoringBasis: null, weeklyPoints: stat(scaleBy(src25, 1.1)), sourceWeeklyPoints: stat(src25) }
    renderModal('wr1', { careerStats: { 2024: { wr1: halfPprRow(src24, 1.3) }, 2025: { wr1: live25 } } })
    const cap = screen.getByTestId('dist-basis').textContent
    expect(cap).toContain('mix scoring bases')
    expect(cap).toContain('half-PPR: 2024')
    expect(cap).toContain('league: 2025')
  })
})
