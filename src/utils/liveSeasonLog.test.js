import { describe, it, expect } from 'vitest'
import {
  selectLiveWeekly, liveSeasonLines, liveSeasonRanks, buildLivePeers,
  computeLiveGameLogValues, buildLiveGameLogRows, LIVE_GAME_LOG_COLUMNS,
} from './liveSeasonLog'
import { seasonPointsFromWeekly } from './weeklyRanks'

const scoring = { rec: 0.5, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1 }
const wr1Wk1 = { gp: 1, rec_tgt: 8, rec: 5, rec_yd: 76, rec_td: 1, rec_air_yd: 96 }

// Week 1: DAL–NYG. Week 2: DAL on bye (no TEAM_DAL row), NYG plays.
const weeks = [
  {
    week: 1,
    rows: {
      TEAM_DAL: { team: 'DAL', opponent: 'NYG', stats: {} },
      TEAM_NYG: { team: 'NYG', opponent: 'DAL', stats: {} },
      wr1: { team: 'DAL', opponent: 'NYG', stats: wr1Wk1 },
      wr2: { team: 'NYG', opponent: 'DAL', stats: { gp: 1, rec: 4, rec_yd: 40 } },
      rb1: { team: 'NYG', opponent: 'DAL', stats: { gms_active: 1 } },
    },
  },
  {
    week: 2,
    rows: {
      TEAM_NYG: { team: 'NYG', opponent: 'WAS', stats: {} },
      wr2: { team: 'NYG', opponent: 'WAS', stats: { gp: 1, rec: 10, rec_yd: 150 } },
      rb1: { team: 'NYG', opponent: 'WAS', stats: { gp: 1, rush_att: 12, rush_yd: 40 } },
    },
  },
]
const scheduleGames = [
  { week: 1, homeTeam: 'DAL', awayTeam: 'NYG', homeScore: 27, awayScore: 20, result: 7, spreadLine: -3, totalLine: 45, roof: 'dome', temp: null, wind: null },
  { week: 2, homeTeam: 'WAS', awayTeam: 'NYG', homeScore: 17, awayScore: 24, result: -7, spreadLine: 1, totalLine: 41, roof: 'outdoors', temp: 60, wind: 5 },
]
const playersMap = {
  wr1: { position: 'WR', full_name: 'WR One', team: 'DAL' },
  wr2: { position: 'WR', full_name: 'WR Two', team: 'NYG' },
  rb1: { position: 'RB', full_name: 'RB One', team: 'NYG' },
  ghost: { position: 'WR', full_name: 'Ghost', team: 'DAL' },
}

describe('liveSeasonLines (L-1, L-2)', () => {
  it('L-1: points and games over gp===1 rows; no TEAM_* key', () => {
    const lines = liveSeasonLines(weeks, scoring)
    expect(lines.wr1.points).toBeCloseTo(16.1, 5)
    expect(lines.wr1.games).toBe(1)
    expect(lines.rb1.games).toBe(1) // the week-1 row has no gp → not counted
    expect(Object.keys(lines).some(k => k.startsWith('TEAM_'))).toBe(false)
  })

  it('L-2: agrees exactly with /week\'s seasonPointsFromWeekly, same key set', () => {
    const lines = liveSeasonLines(weeks, scoring)
    const weekly = seasonPointsFromWeekly(weeks, scoring)
    expect(Object.keys(lines).sort()).toEqual(Object.keys(weekly).sort())
    for (const id of Object.keys(weekly)) expect(lines[id].points).toBe(weekly[id])
  })
})

describe('ranks and peers (L-3)', () => {
  const lines = liveSeasonLines(weeks, scoring)
  const ranks = liveSeasonRanks(lines, playersMap)

  it('ranks by total points, not PPG', () => {
    // wr2: 2 games, 44 → 4*.5+4 = 6 ; wk2: 5+15 = 20 → total 26, PPG 13. wr1: total 16.1, PPG 16.1.
    expect(lines.wr2.points).toBeGreaterThan(lines.wr1.points)
    expect(lines.wr2.points / lines.wr2.games).toBeLessThan(lines.wr1.points / lines.wr1.games)
    expect(ranks.get('wr2').posRank).toBe(1)
    expect(ranks.get('wr1').posRank).toBe(2)
  })

  it('limit 1: a player outside the top gets a separator; inside, none; unranked never listed', () => {
    const outside = buildLivePeers({ lines, ranks, playersMap, position: 'WR', playerId: 'wr1', limit: 1 })
    expect(outside.map(p => p?.player_id ?? null)).toEqual(['wr2', null, 'wr1'])
    expect(outside[0].ppg).toBeCloseTo(13, 5)
    const inside = buildLivePeers({ lines, ranks, playersMap, position: 'WR', playerId: 'wr2', limit: 1 })
    expect(inside.map(p => p?.player_id)).toEqual(['wr2'])
    const all = buildLivePeers({ lines, ranks, playersMap, position: 'WR', playerId: 'ghost', limit: 5 })
    expect(all.some(p => p?.player_id === 'ghost')).toBe(false)
    expect(all.map(p => p.player_id)).toEqual(['wr2', 'wr1'])
  })
})

describe('computeLiveGameLogValues (L-4)', () => {
  it('WR full line and aDOT', () => {
    expect(computeLiveGameLogValues('WR', wr1Wk1)).toEqual(['8', '5', '76', '1', '12.0'])
  })
  it('absent counts are 0, absent air yards is —', () => {
    expect(computeLiveGameLogValues('WR', { gp: 1, rec_tgt: 2 })).toEqual(['2', '0', '0', '0', '—'])
  })
  it('QB and null', () => {
    expect(computeLiveGameLogValues('QB', { gp: 1, pass_cmp: 20, pass_att: 30, pass_yd: 250 })).toEqual(['20/30', '250', '0', '0'])
    expect(computeLiveGameLogValues('QB', null)).toEqual(['—', '—', '—', '—'])
  })
  it('column set drops EPA only', () => {
    expect(LIVE_GAME_LOG_COLUMNS.WR.map(c => c.id)).toEqual(['tgt', 'rec', 'yds', 'td', 'adot'])
    expect(LIVE_GAME_LOG_COLUMNS.QB.some(c => c.id === 'epa')).toBe(false)
  })
})

describe('buildLiveGameLogRows (L-5)', () => {
  const base = { weeks, scoringSettings: scoring, scheduleGames }

  it('played week then bye (no TEAM_DAL row)', () => {
    const rows = buildLiveGameLogRows({ ...base, position: 'WR', playerId: 'wr1', playerTeam: 'DAL' })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ week: 1, kind: 'played', opponent: 'NYG', roof: 'dome', spread: -3 })
    expect(rows[0].resultText).toBe('W 27-20')
    expect(rows[0].pts).toBeCloseTo(16.1, 5)
    expect(rows[1]).toMatchObject({ week: 2, kind: 'bye' })
  })

  it('a did-not-play week keeps the context block, production —, pts null', () => {
    const rows = buildLiveGameLogRows({ ...base, position: 'RB', playerId: 'rb1', playerTeam: 'NYG' })
    expect(rows[0]).toMatchObject({ week: 1, kind: 'played', opponent: 'DAL', pts: null })
    expect(rows[0].production.every(v => v === '—')).toBe(true)
    expect(rows[1].pts).toBeCloseTo(4, 5)
  })

  it('a free agent with no rows → no rows', () => {
    expect(buildLiveGameLogRows({ ...base, position: 'WR', playerId: 'nobody', playerTeam: 'FA' })).toEqual([])
  })

  it('a Rams player (LAR) joins a schedule game listed as LA', () => {
    const wk = [{ week: 1, rows: {
      TEAM_LAR: { team: 'LAR', opponent: 'SEA', stats: {} },
      lar1: { team: 'LAR', opponent: 'SEA', stats: { gp: 1, rec: 3, rec_yd: 30 } },
    } }]
    const sched = [{ week: 1, homeTeam: 'LA', awayTeam: 'SEA', homeScore: 30, awayScore: 10, result: 20, roof: 'dome' }]
    const rows = buildLiveGameLogRows({ position: 'WR', weeks: wk, playerId: 'lar1', playerTeam: 'LAR', scoringSettings: scoring, scheduleGames: sched })
    expect(rows[0]).toMatchObject({ opponent: 'SEA', resultText: 'W 30-10', roof: 'dome' })
  })
})

describe('selectLiveWeekly (L-6)', () => {
  it('picks nflState.season\'s entry; unknown → null', () => {
    const r = { complete: true }
    expect(selectLiveWeekly({ 2026: r }, { season: '2026' })).toBe(r)
    expect(selectLiveWeekly({ 2026: r }, { season: 'x' })).toBeNull()
    expect(selectLiveWeekly({ 2025: r }, { season: '2026' })).toBeNull()
    expect(selectLiveWeekly({ 2026: r }, null)).toBeNull()
  })
})
