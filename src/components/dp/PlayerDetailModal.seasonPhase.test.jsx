// @vitest-environment jsdom
//
// P5c (player-popup-season-phase.md) — the pop-up's season-phase Overview header and the Game
// log's season switcher. Fixture style follows PlayerDetailModal.gameLogDistribution.test.jsx
// (that file stays unedited).
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailModal } from './PlayerDetailModal'

expect.extend(jestDomMatchers)
afterEach(cleanup)

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  disconnect() {}
})
Element.prototype.scrollIntoView = vi.fn()

const makeWeekly = (n, val) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), val]))
const liveApiRow = (row) => ({ ...row, scoringBasis: 'league', sourceScoringBasis: null, sourceWeeklyPoints: row.weeklyPoints ?? null })

const richDynastyScore = () => ({
  score: 80, label: 'Elite', confidence: 'high', isRookie: false,
  components: {
    ageAdjusted: { value: 78, weight: 0.28 }, trajectory: { value: 65, weight: 0.25 },
    currentLevel: { value: 90, weight: 0.22 }, reliability: { value: 70, weight: 0.10 },
    opportunityQuality: { value: 85, weight: 0.15 },
  },
  signals: { seasonsOfData: 3, draftCapital: null, ktcInfluenced: false },
})

const ids = ['wr1', 'wr2', 'idle', 'sat']
const playersMap = {
  wr1: { player_id: 'wr1', position: 'WR', full_name: 'Test Receiver', age: 24, years_exp: 2, team: 'DAL' },
  wr2: { player_id: 'wr2', position: 'WR', full_name: 'Other Receiver', age: 26, years_exp: 4, team: 'NYG' },
  idle: { player_id: 'idle', position: 'WR', full_name: 'Idle Receiver', age: 25, years_exp: 3, team: 'DAL' },
  sat: { player_id: 'sat', position: 'WR', full_name: 'Sat Out Receiver', age: 27, years_exp: 5, team: 'DAL' },
}

const season = (id, gp) => liveApiRow({ gamesPlayed: gp, fantasyPoints: gp * 15, team: 'DAL', weeklyPoints: makeWeekly(gp, 15) })
const careerStats = {
  2023: Object.fromEntries(ids.map(id => [id, season(id, 15)])),
  2024: Object.fromEntries(ids.map(id => [id, season(id, 16)])),
  2025: {
    wr1: liveApiRow({ gamesPlayed: 1, fantasyPoints: 19.8, team: 'DAL', weeklyStatus: ['P', ...Array(17).fill(undefined)], weeklyPoints: { 1: 19.8 } }),
    wr2: season('wr2', 16),
    idle: liveApiRow({ gamesPlayed: 1, fantasyPoints: 12, team: 'DAL', weeklyStatus: ['P', ...Array(17).fill(undefined)], weeklyPoints: { 1: 12 } }),
    // sat: no 2025 entry — sat out dataSeason
  },
}

const playerRows = ids.map(id => ({
  player_id: id, position: 'WR', full_name: playersMap[id].full_name, dynastyScore: richDynastyScore(),
  ownerTeamName: null, ktcValue: 5000, divergenceSignal: null,
  dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
}))

const wr1Stats = { gp: 1, rec_tgt: 8, rec: 5, rec_yd: 76, rec_td: 1, rec_air_yd: 96 }
const scoringSettings = { rec: 0.5, rec_yd: 0.1, rec_td: 6 }
const team = (abbr, opp) => ({ team: abbr, opponent: opp, stats: {} })
const liveWeek = (week, { dal = true } = {}) => ({
  week,
  rows: {
    ...(dal ? { TEAM_DAL: team('DAL', 'NYG'), wr1: { team: 'DAL', opponent: 'NYG', stats: wr1Stats } } : {}),
    TEAM_NYG: team('NYG', dal ? 'DAL' : 'WAS'),
    wr2: { team: 'NYG', opponent: 'DAL', stats: { gp: 1, rec_tgt: 12, rec: 9, rec_yd: 120, rec_td: 1, rec_air_yd: 100 } },
  },
})
const liveRows = (overrides = {}) => ({
  year: 2026, complete: true, failedWeeks: [],
  weeks: [liveWeek(1), liveWeek(2), liveWeek(3)],
  ...overrides,
})

const sched = (weeks) => weeks.map(w => ({
  week: w, gameType: 'REG', homeTeam: 'DAL', awayTeam: 'NYG', homeScore: 27, awayScore: 20, result: 7,
  spreadLine: -3, totalLine: 45, roof: 'dome', temp: null, wind: null,
}))

const gameLogsByYear = {
  2025: {
    complete: true, year: 2025, rowCount: 5000,
    players: { wr1: { games: [{ week: 1, seasonType: 'REG', team: 'DAL', opponent: 'NYG', targets: 8, receptions: 5, receivingYards: 76, receivingTds: 1, receivingAirYards: 96, receivingEpa: 3.2 }] } },
  },
}
const nflScheduleByYear = {
  2025: { complete: true, year: 2025, rowCount: 285, games: sched([1]) },
  2026: { complete: true, year: 2026, rowCount: 285, games: sched([1, 2, 3]) },
}

const inSeasonState = { season: '2026', season_type: 'regular', week: 4, season_start_date: '2026-09-09' }

function baseContext(overrides = {}) {
  return {
    careerStats, playersMap, playerRows, positionPeakPPG: { QB: 24, RB: 18, WR: 20, TE: 14 },
    ktcMap: new Map(), historicalShares: {}, collegeStats: {}, seasonProjections: {},
    enrichmentMap: {}, advStats: { byId: {}, year: 2025 },
    gameLogsByYear, nflScheduleByYear,
    nflState: inSeasonState, scoringSettings, liveWeeklyRows: liveRows(), onNeedGameLogSeason: vi.fn(),
    ...overrides,
  }
}
const ui = (playerId, ctx) => (
  <ProfileDataContext.Provider value={ctx}>
    <PlayerDetailModal playerId={playerId} myTeamName="My Team" />
  </ProfileDataContext.Provider>
)
const renderModal = (playerId, overrides = {}) => render(ui(playerId, baseContext(overrides)))

const optionTexts = () => [...screen.getByTestId('game-log-season').querySelectorAll('option')].map(o => o.textContent)
const tileCount = () => document.querySelectorAll('[data-testid^="tile-"]').length

describe('PlayerDetailModal — season-phase header (P5c)', () => {
  it('S-1: in-season shows the so-far tile (label, PPG, rank · games) in a five-column grid', () => {
    renderModal('wr1')
    const tile = screen.getByTestId('tile-sofar')
    expect(tile.textContent).toContain('2026 SO FAR')
    expect(tile.textContent).toContain('16.1')
    expect(tile.textContent).toContain('WR2 · 3 G')
    expect(tileCount()).toBe(5)
    expect(tile.parentElement.className).toContain('md:grid-cols-5')
  })

  it('S-2: next tile — REST OF SEASON with the prior→value delta; PROJECTED · 2026 without inSeason', () => {
    const inSeasonProj = { wr1: { projectedPPG: 18.7, projectedGames: 17, inSeason: { n: 3, ros: { prior: 20.5, value: 18.7, weight: 0.5, k: 3 } } } }
    const { unmount } = renderModal('wr1', { seasonProjections: inSeasonProj })
    const next = screen.getByTestId('tile-next')
    expect(next.textContent).toContain('REST OF SEASON')
    expect(next.textContent).toContain('-1.8')
    unmount()
    renderModal('wr1', { seasonProjections: { wr1: { projectedPPG: 17, projectedGames: 17 } } })
    expect(screen.getByTestId('tile-next').textContent).toContain('PROJECTED · 2026')
  })

  it('S-3: the so-far bar is the only "latest" bar; the 2025 bar is historical', () => {
    renderModal('wr1', { seasonProjections: { wr1: { projectedPPG: 17, projectedGames: 17 } } })
    const liveBar = screen.getByText("'26 so far").parentElement.querySelector('div')
    expect(liveBar.className).toContain('bg-dp-up')
    const label2025 = screen.getAllByText('2025').find(el => el.tagName === 'SPAN')
    expect(label2025.parentElement.querySelector('div').className).not.toContain('bg-dp-up')
  })

  it('S-4: in-season rail is titled by the live season, ranked by total points, player highlighted', () => {
    renderModal('wr1')
    const title = screen.getByText('RANK · 2026 SO FAR')
    expect(title.parentElement.textContent).toContain('by total points')
    const rows = [...title.parentElement.querySelectorAll('div.rounded-md')]
    expect(rows[0].textContent).toContain('Other Receiver')
    expect(rows[1].textContent).toContain('Test Receiver')
    expect(rows[1].className).toContain('bg-dp-up-bg')
  })

  it('S-5: offseason (pre) keeps four tiles, no so-far tile, rail retitled to the data season, no lag note', () => {
    renderModal('wr1', { nflState: { season: '2026', season_type: 'pre' }, liveWeeklyRows: null })
    expect(screen.queryByTestId('tile-sofar')).not.toBeInTheDocument()
    expect(tileCount()).toBe(4)
    expect(screen.getByText('RANK · 2025')).toBeInTheDocument()
    expect(screen.queryByTestId('season-lag-note')).not.toBeInTheDocument()
  })

  it('S-6: post — the lag note names both seasons', () => {
    renderModal('wr1', { nflState: { season: '2026', season_type: 'post' } })
    const note = screen.getByTestId('season-lag-note').textContent
    expect(note).toContain('The 2026 season is over')
    expect(note).toContain('compare 2025 with 2026')
  })

  it('S-10: live rows not loaded in-season → no 2026 option, so-far tile —, rail says none loaded', () => {
    renderModal('wr1', { liveWeeklyRows: null })
    expect(optionTexts().some(t => t.startsWith('2026'))).toBe(false)
    const tile = screen.getByTestId('tile-sofar')
    expect(tile.textContent).toContain('—')
    expect(tile.textContent).toContain('Weekly stats not loaded')
    expect(screen.getByText('No 2026 games loaded.')).toBeInTheDocument()
  })
})

describe('PlayerDetailModal — game-log season switcher (P5c)', () => {
  it('S-7: defaults to the live season; live table has aDOT, no EPA, caption states source; bye renders', () => {
    // Week 2 with no TEAM_DAL row and no wr1 row = DAL on bye.
    const weeks = [liveWeek(1), liveWeek(2, { dal: false }), liveWeek(3)]
    const { container } = renderModal('wr1', { liveWeeklyRows: liveRows({ weeks }) })
    const select = screen.getByTestId('game-log-season')
    expect(optionTexts().slice(0, 2)).toEqual(['2026 · so far', '2025'])
    expect(optionTexts()).toEqual(['2026 · so far', '2025', '2024', '2023'])
    expect(select.value).toBe('2026')
    const log = within(container.querySelector('#game-log'))
    expect(log.getByText('aDOT')).toBeInTheDocument()
    expect(log.queryByText('EPA/TGT')).not.toBeInTheDocument()
    const basis = screen.getByTestId('game-log-basis').textContent
    expect(basis).toContain("Sleeper's weekly stats through week 3")
    expect(basis).toContain('no EPA')
    expect(log.getByText(/WK 2 · BYE/)).toBeInTheDocument()
  })

  it('S-8: switching to dataSeason restores EPA and the gamelogs values without a load request', () => {
    const onNeed = vi.fn()
    const { container } = renderModal('wr1', { onNeedGameLogSeason: onNeed })
    fireEvent.change(screen.getByTestId('game-log-season'), { target: { value: '2025' } })
    const log = within(container.querySelector('#game-log'))
    expect(log.getByText('EPA/TGT')).toBeInTheDocument()
    expect(log.getByText('76')).toBeInTheDocument()
    expect(onNeed).not.toHaveBeenCalled()
  })

  it('S-9: an older season requests its load, shows the loading line, then renders when the maps fill', () => {
    const onNeed = vi.fn()
    const ctx = baseContext({ onNeedGameLogSeason: onNeed })
    const { rerender, container } = render(ui('wr1', ctx))
    fireEvent.change(screen.getByTestId('game-log-season'), { target: { value: '2024' } })
    expect(onNeed).toHaveBeenCalledWith(2024)
    expect(screen.getByTestId('game-log-loading').textContent).toContain('Loading the 2024 game log')
    const filled = {
      ...ctx,
      gameLogsByYear: { ...gameLogsByYear, 2024: { ...gameLogsByYear[2025], year: 2024 } },
      nflScheduleByYear: { ...nflScheduleByYear, 2024: { ...nflScheduleByYear[2025], year: 2024 } },
    }
    rerender(ui('wr1', filled))
    expect(screen.queryByTestId('game-log-loading')).not.toBeInTheDocument()
    expect(within(container.querySelector('#game-log')).getByText('EPA/TGT')).toBeInTheDocument()
  })

  it('S-11: a failed week is named in the caption', () => {
    renderModal('wr1', { liveWeeklyRows: liveRows({ failedWeeks: [2], weeks: [liveWeek(1), liveWeek(3)] }) })
    expect(screen.getByTestId('game-log-basis').textContent).toContain("Week 2 couldn't be loaded.")
  })

  it('S-12: a player with no live games has no live option, opens on dataSeason, so-far note says no games', () => {
    renderModal('idle')
    expect(optionTexts().some(t => t.startsWith('2026'))).toBe(false)
    expect(screen.getByTestId('game-log-season').value).toBe('2025')
    expect(screen.getByTestId('tile-sofar').textContent).toContain('No games yet')
  })

  it('S-13: a player who sat out dataSeason still opens on it (degraded copy), no load request', () => {
    const onNeed = vi.fn()
    renderModal('sat', { onNeedGameLogSeason: onNeed })
    expect(optionTexts()).toContain('2025')
    expect(screen.getByTestId('game-log-season').value).toBe('2025')
    expect(screen.getByText(/No recorded games for Sat Out Receiver in 2025/)).toBeInTheDocument()
    expect(onNeed).not.toHaveBeenCalled()
  })

  it('S-14: no loader in context → an unloaded older season degrades, never loads forever', () => {
    renderModal('wr1', { onNeedGameLogSeason: undefined })
    fireEvent.change(screen.getByTestId('game-log-season'), { target: { value: '2024' } })
    expect(screen.queryByTestId('game-log-loading')).not.toBeInTheDocument()
    expect(screen.getByText(/isn.t available/)).toBeInTheDocument()
  })

  it('S-15: in the post phase the live option drops the "so far" suffix', () => {
    renderModal('wr1', { nflState: { season: '2026', season_type: 'post' } })
    expect(optionTexts()[0]).toBe('2026')
  })
})
