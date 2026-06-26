import { describe, it, expect } from 'vitest'
import {
  normalizeTeamForSchedule,
  computeSeasonAverages,
  buildGameLog,
  computeHighLow,
} from './nflStats'

// ---------------------------------------------------------------------------
// normalizeTeamForSchedule
// ---------------------------------------------------------------------------
describe('normalizeTeamForSchedule', () => {
  it('LAR → LA', () => expect(normalizeTeamForSchedule('LAR')).toBe('LA'))
  it('KC → KC', () => expect(normalizeTeamForSchedule('KC')).toBe('KC'))
  it('null → null', () => expect(normalizeTeamForSchedule(null)).toBeNull())
})

// ---------------------------------------------------------------------------
// computeSeasonAverages
// ---------------------------------------------------------------------------
describe('computeSeasonAverages', () => {
  it('QB: counting stats derived correctly (not pre-summed rate keys)', () => {
    const sd = {
      gamesPlayed: 17, fantasyPoints: 380,
      stats: {
        pass_cmp: 300, pass_att: 450, pass_yd: 4200, pass_td: 30, pass_int: 10,
        rush_yd: 200, rush_td: 3,
        // pre-summed rate keys — must be ignored
        cmp_pct: 9999, rec_ypr: 9999,
      },
    }
    const avg = computeSeasonAverages(sd, 'QB')
    expect(avg.games).toBe(17)
    expect(avg.compPct).toBeCloseTo(66.67, 1)
    expect(avg.passYdPerG).toBeCloseTo(247.06, 1)
    expect(avg.passTd).toBe(30)
    expect(avg.passInt).toBe(10)
    expect(avg.rushYdPerG).toBeCloseTo(11.76, 1)
    expect(avg.rushTd).toBe(3)
    expect(avg.fpPerG).toBeCloseTo(22.35, 1)
    expect(avg.totalYdPerG).toBeCloseTo(258.82, 1)
    expect(avg.totalTd).toBe(33)
    // pre-summed rate keys ignored — compPct derived, not 9999
    expect(avg.compPct).not.toBe(9999)
    // no receiving → null
    expect(avg.ypr).toBeNull()
  })

  it('WR: receiving stats', () => {
    const sd = {
      gamesPlayed: 16, fantasyPoints: 240,
      stats: { rec_tgt: 120, rec: 90, rec_yd: 1200, rec_td: 8 },
    }
    const avg = computeSeasonAverages(sd, 'WR')
    expect(avg.tgt).toBe(120)
    expect(avg.rec).toBe(90)
    expect(avg.catchPct).toBe(75)
    expect(avg.recYdPerG).toBe(75)
    expect(avg.ypr).toBeCloseTo(13.33, 1)
    expect(avg.recTd).toBe(8)
    expect(avg.fpPerG).toBe(15)
  })

  it('no-data (undefined): games:0, all stats null, no NaN', () => {
    const avg = computeSeasonAverages(undefined, 'WR')
    expect(avg.games).toBe(0)
    expect(avg.fpPerG).toBeNull()
    expect(avg.totalTd).toBeNull()
    expect(avg.totalYdPerG).toBeNull()
    expect(JSON.stringify(avg)).not.toMatch(/NaN/)
  })

  it('no-data (gamesPlayed:0): games:0, all stats null, no NaN', () => {
    const avg = computeSeasonAverages({ gamesPlayed: 0, stats: { pass_td: 99 } }, 'QB')
    expect(avg.games).toBe(0)
    expect(avg.fpPerG).toBeNull()
    expect(avg.totalTd).toBeNull()
    expect(JSON.stringify(avg)).not.toMatch(/NaN/)
  })

  it('pure rusher: totalTd = rush_td, totalYdPerG = rush_yd/games, no NaN', () => {
    const sd = {
      gamesPlayed: 16, fantasyPoints: 150,
      stats: { rush_att: 200, rush_yd: 900, rush_td: 8 },
    }
    const avg = computeSeasonAverages(sd, 'RB')
    expect(avg.totalTd).toBe(8)
    expect(avg.totalYdPerG).toBeCloseTo(900 / 16, 4)
    // per-position fields absent for non-rush categories → null
    expect(avg.compPct).toBeNull()
    expect(avg.tgt).toBeNull()
    expect(JSON.stringify(avg)).not.toMatch(/NaN/)
  })
})

// ---------------------------------------------------------------------------
// buildGameLog
// ---------------------------------------------------------------------------
describe('buildGameLog', () => {
  function makeStatus(map) {
    const arr = new Array(18).fill('X')
    for (const [w, s] of Object.entries(map)) arr[Number(w) - 1] = s
    return arr
  }

  const game1 = {
    gameId: 'g1', season: 2024, week: 1, gameType: 'REG',
    homeTeam: 'KC', awayTeam: 'BAL',
    homeScore: 27, awayScore: 20, result: 7,
    spreadLine: 3, totalLine: 46,
    roof: null, surface: null, temp: null, wind: null,
  }
  // Wildcard game — must be filtered out
  const wildcard1 = { ...game1, week: 19, gameType: 'WC' }

  it('normal home win: all fields correct', () => {
    const { rows, scheduleLoaded, teamConsistent } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 24 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [game1, wildcard1],
    })
    expect(scheduleLoaded).toBe(true)
    expect(teamConsistent).toBe(true)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.week).toBe(1)
    expect(r.status).toBe('P')
    expect(r.fantasyPoints).toBe(24)
    expect(r.opponent).toBe('BAL')
    expect(r.homeAway).toBe('home')
    expect(r.result).toBe('W')
    expect(r.score).toBe('27-20')
    expect(r.spread).toBe(-3)
    expect(r.total).toBe(46)
  })

  it('away perspective sign-flip', () => {
    const { rows } = buildGameLog({
      playerTeam: 'BAL', season: 2024,
      weeklyPoints: { 1: 18 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [game1],
    })
    const r = rows[0]
    expect(r.homeAway).toBe('away')
    expect(r.opponent).toBe('KC')
    expect(r.result).toBe('L')
    expect(r.score).toBe('20-27')
    expect(r.spread).toBe(3)
  })

  it('tie (result===0)', () => {
    const tieGame = { ...game1, homeScore: 20, awayScore: 20, result: 0 }
    const { rows } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 15 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [tieGame],
    })
    expect(rows[0].result).toBe('T')
  })

  it('null-score in-progress: score/result null but opponent/spread/total present', () => {
    const future = { ...game1, homeScore: null, awayScore: null, result: null }
    const { rows } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 20 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [future],
    })
    const r = rows[0]
    expect(r.score).toBeNull()
    expect(r.result).toBeNull()
    expect(r.opponent).toBe('BAL')
    expect(r.homeAway).toBe('home')
    expect(r.spread).toBe(-3)
    expect(r.total).toBe(46)
  })

  it('bye week: status B, opponent BYE, fantasyPoints null', () => {
    const { rows } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: {},
      weeklyStatus: makeStatus({ 7: 'B' }),
      scheduleGames: [game1],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('B')
    expect(rows[0].opponent).toBe('BYE')
    expect(rows[0].fantasyPoints).toBeNull()
  })

  it('DNP: fantasyPoints null, opponent present from schedule', () => {
    const { rows } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: {},
      weeklyStatus: makeStatus({ 1: 'D' }),
      scheduleGames: [game1],
    })
    const r = rows[0]
    expect(r.status).toBe('D')
    expect(r.fantasyPoints).toBeNull()
    expect(r.opponent).toBe('BAL')
  })

  it('team-abbr alias: LAR matches schedule LA', () => {
    const laGame = { ...game1, homeTeam: 'LA', awayTeam: 'SEA' }
    const { rows } = buildGameLog({
      playerTeam: 'LAR', season: 2024,
      weeklyPoints: { 1: 18 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [laGame],
    })
    expect(rows[0].opponent).toBe('SEA')
  })

  it('team-change/inconsistent: P week on KC bye → teamConsistent false, matchup null', () => {
    // Only week 1 has KC; week 7 has no KC game; player has P in week 7 → inconsistency
    const { rows, teamConsistent } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 24, 7: 20 },
      weeklyStatus: makeStatus({ 1: 'P', 7: 'P' }),
      scheduleGames: [game1],
    })
    expect(teamConsistent).toBe(false)
    for (const r of rows) {
      expect(r.opponent).toBeNull()
      expect(r.result).toBeNull()
      expect(r.score).toBeNull()
    }
  })

  it('empty schedule: scheduleLoaded false, teamConsistent true, fantasyPoints intact', () => {
    const { rows, scheduleLoaded, teamConsistent } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 24, 2: 20 },
      weeklyStatus: makeStatus({ 1: 'P', 2: 'P' }),
      scheduleGames: [],
    })
    expect(scheduleLoaded).toBe(false)
    expect(teamConsistent).toBe(true)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.fantasyPoints).not.toBeNull()
      expect(r.opponent).toBeNull()
    }
  })

  it('X weeks skipped', () => {
    const game5 = { ...game1, week: 5, awayTeam: 'PIT' }
    const { rows } = buildGameLog({
      playerTeam: 'KC', season: 2024,
      weeklyPoints: { 1: 24, 5: 18 },
      weeklyStatus: makeStatus({ 1: 'P', 5: 'P' }),
      scheduleGames: [game1, game5],
    })
    expect(rows.map(r => r.week)).toEqual([1, 5])
  })

  it('T1 — join keys on the passed per-season team, ignores other teams in schedule', () => {
    const dalGame = {
      gameId: 'dal1', season: 2024, week: 1, gameType: 'REG',
      homeTeam: 'DAL', awayTeam: 'PIT',
      homeScore: 28, awayScore: 14, result: 14,
      spreadLine: -3, totalLine: 47,
      roof: null, surface: null, temp: null, wind: null,
    }
    const sfGame = {
      gameId: 'sf1', season: 2024, week: 1, gameType: 'REG',
      homeTeam: 'SF', awayTeam: 'SEA',
      homeScore: 21, awayScore: 17, result: 4,
      spreadLine: -6, totalLine: 44,
      roof: null, surface: null, temp: null, wind: null,
    }
    const { rows, teamConsistent } = buildGameLog({
      playerTeam: 'DAL',
      weeklyPoints: { 1: 20 },
      weeklyStatus: makeStatus({ 1: 'P' }),
      scheduleGames: [dalGame, sfGame],
    })
    expect(teamConsistent).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].opponent).toBe('PIT')
    expect(rows[0].homeAway).toBe('home')
    expect(rows[0].spread).toBe(3)
  })

  it('T2 — null season team: scheduleLoaded true, guard trips, matchups null, FP intact', () => {
    const { rows, scheduleLoaded, teamConsistent } = buildGameLog({
      playerTeam: null,
      weeklyPoints: { 1: 24, 2: 20 },
      weeklyStatus: makeStatus({ 1: 'P', 2: 'P' }),
      scheduleGames: [game1],
    })
    expect(scheduleLoaded).toBe(true)
    expect(teamConsistent).toBe(false)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.opponent).toBeNull()
      expect(r.result).toBeNull()
      expect(r.score).toBeNull()
    }
    expect(rows[0].fantasyPoints).toBe(24)
    expect(rows[1].fantasyPoints).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// computeHighLow
// ---------------------------------------------------------------------------
describe('computeHighLow', () => {
  it('picks high/low from P rows, ignores D and B', () => {
    const rows = [
      { week: 1, status: 'P', fantasyPoints: 24,  opponent: 'BAL' },
      { week: 2, status: 'P', fantasyPoints: 14,  opponent: 'BUF' },
      { week: 3, status: 'D', fantasyPoints: null, opponent: 'CIN' },
      { week: 4, status: 'B', fantasyPoints: null, opponent: 'BYE' },
      { week: 5, status: 'P', fantasyPoints: 31,  opponent: 'DEN' },
      { week: 6, status: 'P', fantasyPoints: 3,   opponent: 'PIT' },
    ]
    const hl = computeHighLow(rows)
    expect(hl.high.fantasyPoints).toBe(31)
    expect(hl.high.week).toBe(5)
    expect(hl.high.opponent).toBe('DEN')
    expect(hl.low.fantasyPoints).toBe(3)
    expect(hl.low.week).toBe(6)
    expect(hl.low.opponent).toBe('PIT')
  })

  it('all non-P rows → null', () => {
    const rows = [
      { week: 1, status: 'B', fantasyPoints: null },
      { week: 2, status: 'D', fantasyPoints: null },
    ]
    expect(computeHighLow(rows)).toBeNull()
  })
})
