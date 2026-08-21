import { describe, it, expect } from 'vitest'
import {
  GAME_LOG_COLUMNS,
  computeGameLogValues,
  findScheduleGame,
  deriveGameResult,
  formatWeather,
  buildGameLogRows,
} from './gameLog'

// ---------------------------------------------------------------------------
// computeGameLogValues — per-position production, rate recomputation
// ---------------------------------------------------------------------------
describe('computeGameLogValues', () => {
  it('QB: CMP/ATT, YDS, TD, INT, EPA/ATT — a WR row does not appear', () => {
    const game = { completions: 22, attempts: 34, passingYards: 290, passingTds: 2, passingInterceptions: 1, passingEpa: 6.8 }
    const values = computeGameLogValues('QB', game)
    expect(GAME_LOG_COLUMNS.QB.map(c => c.label)).toEqual(['CMP/ATT', 'YDS', 'TD', 'INT', 'EPA/ATT'])
    expect(values).toEqual(['22/34', '290', '2', '1', (6.8 / 34).toFixed(2)])
    expect(GAME_LOG_COLUMNS.WR.map(c => c.label)).not.toContain('CMP/ATT')
  })

  it('RB: CAR, YDS, TD, TGT, REC, EPA/CAR', () => {
    const game = { carries: 18, rushingYards: 84, rushingTds: 1, targets: 3, receptions: 2, rushingEpa: 4.5 }
    const values = computeGameLogValues('RB', game)
    expect(values).toEqual(['18', '84', '1', '3', '2', (4.5 / 18).toFixed(2)])
  })

  it('WR/TE: TGT, REC, YDS, TD, aDOT, EPA/TGT', () => {
    const game = { targets: 8, receptions: 5, receivingYards: 76, receivingTds: 1, receivingAirYards: 96, receivingEpa: 3.2 }
    expect(computeGameLogValues('WR', game)).toEqual(['8', '5', '76', '1', (96 / 8).toFixed(1), (3.2 / 8).toFixed(2)])
    expect(computeGameLogValues('TE', game)).toEqual(computeGameLogValues('WR', game))
  })

  it('zero denominator renders "—", never "0"', () => {
    const qbNoAttempts = { completions: 0, attempts: 0, passingYards: 0, passingTds: 0, passingInterceptions: 0, passingEpa: null }
    expect(computeGameLogValues('QB', qbNoAttempts)[4]).toBe('—')

    const rbNoCarries = { carries: 0, rushingYards: 0, rushingTds: 0, targets: 2, receptions: 1, rushingEpa: 0 }
    expect(computeGameLogValues('RB', rbNoCarries)[5]).toBe('—')

    const wrNoTargets = { targets: 0, receptions: 0, receivingYards: 0, receivingTds: 0, receivingAirYards: 0, receivingEpa: null }
    const wrValues = computeGameLogValues('WR', wrNoTargets)
    expect(wrValues[4]).toBe('—') // aDOT
    expect(wrValues[5]).toBe('—') // EPA/TGT
    // Real counting-stat zeros still render as "0", not "—"
    expect(wrValues[0]).toBe('0')
  })

  it('missing field (absent key, e.g. a QB row with no receivingEpa) renders "—"', () => {
    const qbGame = { completions: 10, attempts: 15, passingYards: 100, passingTds: 1, passingInterceptions: 0, passingEpa: 1.2 }
    // no receiving* keys at all on a QB row — WR/TE columns would all be "—"
    expect(computeGameLogValues('WR', qbGame)).toEqual(['—', '—', '—', '—', '—', '—'])
  })

  it('null game (bye/DNP/no row) renders every column "—", sized to the position', () => {
    expect(computeGameLogValues('QB', null)).toEqual(['—', '—', '—', '—', '—'])
    expect(computeGameLogValues('RB', null)).toEqual(['—', '—', '—', '—', '—', '—'])
    expect(computeGameLogValues('WR', null)).toEqual(['—', '—', '—', '—', '—', '—'])
  })

  it('unrecognised position falls back to WR/TE columns without throwing', () => {
    expect(computeGameLogValues('K', null)).toEqual(['—', '—', '—', '—', '—', '—'])
  })
})

// ---------------------------------------------------------------------------
// findScheduleGame / deriveGameResult / formatWeather
// ---------------------------------------------------------------------------
describe('findScheduleGame', () => {
  const games = [
    { week: 1, homeTeam: 'PHI', awayTeam: 'DAL' },
    { week: 2, homeTeam: 'KC', awayTeam: 'LAC' },
  ]
  it('finds the row where team is either side', () => {
    expect(findScheduleGame(games, 1, 'DAL')).toBe(games[0])
    expect(findScheduleGame(games, 1, 'PHI')).toBe(games[0])
  })
  it('null when not found / no team', () => {
    expect(findScheduleGame(games, 3, 'DAL')).toBeNull()
    expect(findScheduleGame(games, 1, null)).toBeNull()
    expect(findScheduleGame(null, 1, 'DAL')).toBeNull()
  })
})

describe('deriveGameResult', () => {
  it('home win: home team gets W, away team gets L — result is not printed verbatim', () => {
    const g = { homeTeam: 'PHI', awayTeam: 'DAL', homeScore: 24, awayScore: 20, result: 4 }
    expect(deriveGameResult(g, 'PHI')).toEqual({ opponent: 'DAL', resultText: 'W 24-20' })
    // Away player: result (home margin) is inverted, not printed raw
    expect(deriveGameResult(g, 'DAL')).toEqual({ opponent: 'PHI', resultText: 'L 20-24' })
  })

  it('tie: result === 0', () => {
    const g = { homeTeam: 'A', awayTeam: 'B', homeScore: 17, awayScore: 17, result: 0 }
    expect(deriveGameResult(g, 'A').resultText).toBe('T 17-17')
    expect(deriveGameResult(g, 'B').resultText).toBe('T 17-17')
  })

  it('unplayed game: result/scores null → "—", opponent still resolved', () => {
    const g = { homeTeam: 'A', awayTeam: 'B', homeScore: null, awayScore: null, result: null }
    expect(deriveGameResult(g, 'A')).toEqual({ opponent: 'B', resultText: '—' })
  })

  it('no schedule row: opponent null, "—"', () => {
    expect(deriveGameResult(null, 'A')).toEqual({ opponent: null, resultText: '—' })
  })
})

describe('formatWeather', () => {
  it('dome game: temp/wind null renders "—", never "0"', () => {
    expect(formatWeather({ temp: null, wind: null, roof: 'dome' })).toBe('—')
  })
  it('outdoor game: both present', () => {
    expect(formatWeather({ temp: 75, wind: 11 })).toBe('75° / 11mph')
  })
  it('no schedule row: "—"', () => {
    expect(formatWeather(null)).toBe('—')
  })
})

// ---------------------------------------------------------------------------
// buildGameLogRows — bye vs DNP, PTS sourcing, POST handling, era join
// ---------------------------------------------------------------------------
describe('buildGameLogRows', () => {
  const scheduleGames = [
    { week: 1, homeTeam: 'DAL', awayTeam: 'NYG', homeScore: 24, awayScore: 20, result: 4, spreadLine: -3, totalLine: 45, roof: 'outdoors', temp: 70, wind: 5, gameType: 'REG' },
    { week: 2, homeTeam: 'PHI', awayTeam: 'DAL', homeScore: 21, awayScore: 17, result: 4, spreadLine: -2, totalLine: 44, roof: 'outdoors', temp: 60, wind: 8, gameType: 'REG' },
    // week 3: DAL bye — no schedule row needed for the bye test
    { week: 19, homeTeam: 'DAL', awayTeam: 'GB', homeScore: 30, awayScore: 24, result: 6, spreadLine: -5, totalLine: 48, roof: 'dome', temp: null, wind: null, gameType: 'WC' },
  ]

  it('bye week renders a labelled row; a did-not-play week renders context + "—" (proves the schedule join, not a guess)', () => {
    const weeklyStatus = ['P', 'P', 'B', 'D']
    const weeklyPoints = { 1: 14.2, 2: 9.5 } // no key for week 4 (DNP)
    const gamesByWeek = new Map([
      [1, { week: 1, seasonType: 'REG', completions: 20, attempts: 30, passingYards: 200, passingTds: 1, passingInterceptions: 0, passingEpa: 3 }],
      [2, { week: 2, seasonType: 'REG', completions: 18, attempts: 28, passingYards: 180, passingTds: 2, passingInterceptions: 1, passingEpa: 1 }],
      // no row for week 4 — the player did not play, but the team did
    ])
    const resolveTeam = () => 'DAL'
    const rows = buildGameLogRows({ position: 'QB', weeklyStatus, weeklyPoints, gamesByWeek, scheduleGames: scheduleGames.slice(0, 2), resolveTeam })

    const byeRow = rows.find(r => r.week === 3)
    expect(byeRow.kind).toBe('bye')

    const dnpRow = rows.find(r => r.week === 4)
    expect(dnpRow.kind).toBe('played')
    expect(dnpRow.pts).toBeNull()
    expect(dnpRow.production).toEqual(['—', '—', '—', '—', '—'])

    const playedRow = rows.find(r => r.week === 1)
    expect(playedRow.pts).toBe(14.2)
    expect(playedRow.production[0]).toBe('20/30')
  })

  it('week with no status recorded at all renders no row', () => {
    const weeklyStatus = ['P'] // weeks 2-18 unresolved
    const gamesByWeek = new Map([[1, { week: 1, seasonType: 'REG', completions: 1, attempts: 1 }]])
    const rows = buildGameLogRows({ position: 'QB', weeklyStatus, weeklyPoints: {}, gamesByWeek, scheduleGames: [], resolveTeam: () => 'DAL' })
    expect(rows.map(r => r.week)).toEqual([1])
  })

  it('PTS reads weeklyPoints[week] (1-based), never falls back to fantasyPointsPpr', () => {
    const weeklyStatus = ['P']
    const weeklyPoints = { 1: 22.4 }
    const gamesByWeek = new Map([[1, { week: 1, seasonType: 'REG', fantasyPoints: 99, fantasyPointsPpr: 999 }]])
    const rows = buildGameLogRows({ position: 'QB', weeklyStatus, weeklyPoints, gamesByWeek, scheduleGames: [], resolveTeam: () => 'DAL' })
    expect(rows[0].pts).toBe(22.4)
  })

  it('POST rows: no weeklyStatus coverage, PTS always null (weeklyPoints is REG-only)', () => {
    const gamesByWeek = new Map([
      [19, { week: 19, seasonType: 'POST', completions: 25, attempts: 40, passingYards: 300, passingTds: 3, passingInterceptions: 0, passingEpa: 8 }],
    ])
    const rows = buildGameLogRows({ position: 'QB', weeklyStatus: [], weeklyPoints: { 19: 55 }, gamesByWeek, scheduleGames, resolveTeam: () => 'DAL' })
    expect(rows).toHaveLength(1)
    expect(rows[0].seasonType).toBe('POST')
    expect(rows[0].pts).toBeNull() // even though weeklyPoints happens to have a "19" key, POST never reads it
    expect(rows[0].roundLabel).toBe('WC')
    expect(rows[0].resultText).toBe('W 30-24')
  })

  it('era-boundary join: a historical team code resolved by the caller still matches the (already era-accurate) schedule row', () => {
    // Regression for the "circular" schedule-scan derivation the plan rejected (§3.4) — the
    // schedule join here only ever runs off a caller-supplied, already-resolved team code.
    const oakSchedule = [
      { week: 1, homeTeam: 'OAK', awayTeam: 'DEN', homeScore: 24, awayScore: 16, result: 8, spreadLine: -3, totalLine: 44, roof: 'outdoors', temp: 65, wind: 4, gameType: 'REG' },
    ]
    const weeklyStatus = ['P']
    const gamesByWeek = new Map([[1, { week: 1, seasonType: 'REG', carries: 20, rushingYards: 90, rushingTds: 1, targets: 1, receptions: 1, rushingEpa: 2 }]])
    // resolveTeam simulates playerTeam.js's eraTeam() already having remapped LV→OAK for a
    // pre-2020 season — buildGameLogRows itself does no remapping, it only joins on the string.
    const rows = buildGameLogRows({ position: 'RB', weeklyStatus, weeklyPoints: {}, gamesByWeek, scheduleGames: oakSchedule, resolveTeam: () => 'OAK' })
    expect(rows[0].opponent).toBe('DEN')
    expect(rows[0].resultText).toBe('W 24-16')
  })
})
