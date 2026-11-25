import { describe, it, expect, vi } from 'vitest'

vi.mock('./marketWindowStats', async orig => {
  const actual = await orig()
  return { ...actual, buildWindowStats: vi.fn(actual.buildWindowStats) }
})

import {
  METRIC_META, USAGE_GRID_ROWS, LIVE_SEASON_GAMES, liveTeamGamesCompleted, liveQualifyingGp,
  qualifyingPool, rankInPool, buildUsageGrid,
} from './usageEfficiency'
import { buildWindowStats } from './marketWindowStats'
import { REG_SEASON_TEAM_GAMES } from './qbTakeover'

describe('METRIC_META — domain and formatting', () => {
  it('bounded fraction metrics carry an explicit [0,1] domain (share series unreadable auto-scaled)', () => {
    for (const id of ['rushShare', 'rbTargetShare', 'targetShare', 'airYardsShare', 'snapShare']) {
      expect(METRIC_META[id].domain).toEqual([0, 1])
    }
  })

  it('cmpPct is a 0-1 fraction (buildWindowStats rates.cmpPct), formatted as a percentage', () => {
    expect(METRIC_META.cmpPct.domain).toEqual([0, 1])
    expect(METRIC_META.cmpPct.format(0.634)).toBe('63.4%')
  })

  it('unbounded count/ratio metrics have no fixed domain — a guessed ceiling risks clipping', () => {
    expect(METRIC_META.yardsPerCarry.domain).toBeNull()
    expect(METRIC_META.aDOT.domain).toBeNull()
  })

  it('deltaFormat signs positive and negative correctly', () => {
    expect(METRIC_META.rushShare.deltaFormat(0.05)).toBe('+5.0pp')
    expect(METRIC_META.rushShare.deltaFormat(-0.05)).toBe('-5.0pp')
  })
})

const P = n => Array(n).fill('P').concat(Array(18 - n).fill('X'))
// A row whose weeklyStats sum to its season stats: every stat is spread in full onto week 1.
const row = (gamesPlayed, stats, extra = {}) => ({
  gamesPlayed, gamesStarted: gamesPlayed, team: 'DAL', weeklyStatus: P(gamesPlayed), stats,
  weeklyStats: Object.fromEntries(Array.from({ length: gamesPlayed }, (_, i) => [i + 1, i === 0 ? stats : {}])),
  ...extra,
})
const grid = (playerId, position, careerStats, playerMap, extra = {}) => buildUsageGrid({
  playerId, position, seasons: Object.keys(careerStats).map(Number), careerStats, playerMap,
  gameLogsByYear: null, currentSeasonTotals: null, liveUsable: false, ...extra,
})
const mapOf = (position, ids) => Object.fromEntries(ids.map(id => [id, { position }]))
const rowOf = (g, id) => g.rows.find(r => r.id === id)
const cellOf = (g, id, i = 0) => rowOf(g, id).cells[i]

describe('qualifyingPool and the shared pool (U1)', () => {
  const wr = (tgt, extra) => ({ rec_tgt: tgt, rec_air_yd: tgt * 8, rec_rz_tgt: Math.ceil(tgt / 10), off_snp: 600, tm_off_snp: 1000, ...extra })
  const careerStats = {
    2025: {
      a: row(16, wr(80)),
      b: row(16, wr(60)),
      c: row(9, wr(150), { gamesStarted: 0 }),
      d: row(7, wr(200)),
      r: row(16, { rush_att: 200, rec_tgt: 30 }),
    },
  }
  const playerMap = { ...mapOf('WR', ['a', 'b', 'c', 'd']), r: { position: 'RB' } }

  it('U1 is every same-position player with enough games — no roster, starter or playerRows filter', () => {
    expect(qualifyingPool({ rows: careerStats[2025], playerMap, position: 'WR', minGp: 8 })).toEqual(['a', 'b', 'c'])
  })

  it('U1 ranks two players against the identical pool on every row', () => {
    const a = grid('a', 'WR', careerStats, playerMap)
    const b = grid('b', 'WR', careerStats, playerMap)
    expect(a.rows.map(r => r.id)).toEqual(USAGE_GRID_ROWS.WR)
    for (const g of [a, b]) for (const r of g.rows) expect(r.cells[0].of, r.id).toBe(3)
    expect(cellOf(a, 'targetShare').rank).toBe(2)
    expect(cellOf(b, 'targetShare').rank).toBe(3)
    expect(a.columns[0]).toMatchObject({ season: 2025, kind: 'season', minGp: 8, teamGames: null, poolSize: 3 })
  })
})

describe('rank = sorted position, ties share (U2)', () => {
  const yards = [600, 450, 450, 440, 430, 420, 410, 400, 390, 380, 370, 360] // ÷ 100 carries
  const ids = yards.map((_, i) => `p${i}`)
  const careerStats = { 2025: Object.fromEntries(ids.map((id, i) => [id, row(10, { rush_att: 100, rush_yd: yards[i] })])) }
  const playerMap = mapOf('RB', ids)

  it('U2 competition ranking on yards per carry', () => {
    const ypc = yards.map(y => y / 100)
    const at = id => cellOf(grid(id, 'RB', careerStats, playerMap), 'yardsPerCarry')
    const mine = at('p6') // 4.1 YPC
    expect(mine.value).toBeCloseTo(4.1)
    expect(mine.rank).toBe(1 + ypc.filter(v => v > 4.1).length)
    expect(mine.of).toBe(12)
    expect(at('p1').rank).toBe(2)
    expect(at('p2').rank).toBe(2)
    expect(at('p3').rank).toBe(4)
  })

  it('U2 rankInPool inverts both rank and percentile when ascending, and is null for a non-finite value', () => {
    expect(rankInPool(1, [1, 2, 3], { ascending: true })).toMatchObject({ rank: 1, of: 3 })
    expect(rankInPool(1, [1, 2, 3], { ascending: false })).toMatchObject({ rank: 3, of: 3 })
    expect(rankInPool(1, [1, 2, 3], { ascending: true }).percentile).toBeCloseTo(1 - 0.5 / 3)
    expect(rankInPool(null, [1, 2], { ascending: false })).toBeNull()
    expect(rankInPool(NaN, [1, 2], { ascending: false })).toBeNull()
  })
})

describe('a season under 8 games is unranked (U3)', () => {
  const careerStats = { 2025: { a: row(7, { rec_tgt: 50 }), b: row(16, { rec_tgt: 80 }) } }

  it('U3 keeps the value but gives no rank, count or percentile', () => {
    const cell = cellOf(grid('a', 'WR', careerStats, mapOf('WR', ['a', 'b'])), 'targetShare')
    expect(Number.isFinite(cell.value)).toBe(true)
    expect(cell).toMatchObject({ gp: 7, qualified: false, rank: null, of: null, percentile: null })
  })
})

describe('the live column (U4)', () => {
  const liveRows = n => Object.fromEntries(['a', 'b'].map(id => [id, row(n, { rec_tgt: 20 })]))
  const live = (n, complete = true) => ({ season: 2026, complete, players: liveRows(n) })
  const careerStats = { 2025: { a: row(16, { rec_tgt: 80 }) } }
  const playerMap = mapOf('WR', ['a', 'b'])

  it('U4 pro-rates the games gate to team games played', () => {
    expect(liveQualifyingGp(live(10))).toEqual({ teamGames: 10, minGp: 5 })
    expect(liveQualifyingGp(live(17)).minGp).toBe(8)
    expect(liveQualifyingGp(live(1)).minGp).toBe(1)
    expect(liveQualifyingGp({ season: 2026, complete: true, players: {} })).toBeNull()
    expect(liveQualifyingGp(live(10, false))).toBeNull()
    expect(liveQualifyingGp(null)).toBeNull()
  })

  it('U4 counts P and D weeks, taking the max over rows', () => {
    const totals = { season: 2026, complete: true, players: { a: { weeklyStatus: ['P', 'D', 'B', 'X'] }, b: { weeklyStatus: ['P', 'P', 'P', 'B'] } } }
    expect(liveTeamGamesCompleted(totals)).toBe(3)
  })

  it('U4 appends the live column last only when usable, ranked on the live gate and live rows', () => {
    const on = grid('a', 'WR', careerStats, playerMap, { currentSeasonTotals: live(10), liveUsable: true })
    expect(on.columns.map(c => [c.season, c.kind, c.minGp, c.teamGames])).toEqual([[2025, 'season', 8, null], [2026, 'live', 5, 10]])
    expect(cellOf(on, 'targetShare', 1)).toMatchObject({ season: 2026, of: 2, qualified: true })
    const off = grid('a', 'WR', careerStats, playerMap, { currentSeasonTotals: live(10), liveUsable: false })
    expect(off.columns.map(c => c.season)).toEqual([2025])
  })

  it('U4 gives a player with no live row a void live cell', () => {
    const g = grid('a', 'WR', careerStats, playerMap, {
      currentSeasonTotals: { season: 2026, complete: true, players: { b: row(10, { rec_tgt: 20 }) } }, liveUsable: true,
    })
    expect(cellOf(g, 'targetShare', 1)).toMatchObject({ value: null, gp: 0, qualified: false, rank: null })
  })
})

describe('QB rows: sack rate direction and the volume floor (U6, U6b)', () => {
  const qb = (att, sacks) => ({ pass_att: att, pass_cmp: Math.round(att * 0.65), pass_yd: att * 7, pass_td: 20, pass_int: 5, pass_sack: sacks })
  const playerMap = mapOf('QB', ['q1', 'q2', 'q3'])

  it('U6 the lower sack rate ranks first and sits higher on the scale; no raw sack-count row', () => {
    const careerStats = { 2025: { q1: row(16, qb(480, 20)), q2: row(16, qb(460, 40)) } }
    const one = grid('q1', 'QB', careerStats, playerMap)
    const two = grid('q2', 'QB', careerStats, playerMap)
    expect(cellOf(one, 'sackPct')).toMatchObject({ rank: 1, of: 2 })
    expect(cellOf(two, 'sackPct')).toMatchObject({ rank: 2, of: 2 })
    expect(cellOf(one, 'sackPct').value).toBeCloseTo(0.04)
    expect(cellOf(one, 'sackPct').percentile).toBeGreaterThan(cellOf(two, 'sackPct').percentile)
    expect(one.rows.map(r => r.id)).toEqual(['cmpPct', 'passerRating', 'sackPct'])
  })

  it('U6b a QB under 14 attempts a game keeps the value, is unranked and is not counted', () => {
    const careerStats = { 2025: { q1: row(16, qb(480, 20)), q2: row(16, qb(460, 40)), q3: row(9, qb(90, 2)) } }
    const three = grid('q3', 'QB', careerStats, playerMap)
    const one = grid('q1', 'QB', careerStats, playerMap)
    for (const id of ['cmpPct', 'passerRating', 'sackPct']) {
      const c = cellOf(three, id)
      expect(Number.isFinite(c.value), id).toBe(true)
      expect(c, id).toMatchObject({ qualified: true, lowVolume: true, rank: null, of: null, percentile: null })
      expect(cellOf(one, id).of, id).toBe(2)
    }
  })

  it('U6b the games gate is checked before the volume floor', () => {
    const careerStats = { 2025: { q1: row(16, qb(480, 20)), q3: row(3, qb(9, 0)) } }
    expect(cellOf(grid('q3', 'QB', careerStats, playerMap), 'cmpPct')).toMatchObject({ qualified: false, lowVolume: false })
  })
})

describe('of N counts only the players ranked on the row (U6c)', () => {
  const careerStats = {
    2025: {
      a: row(16, { rec_tgt: 80, rec_air_yd: 700 }),
      b: row(16, { rec_tgt: 60, rec_air_yd: 500 }),
      c: row(16, { rec_tgt: 0, rec_air_yd: 0, rush_att: 5 }),
    },
  }

  it('U6c a pool member with no value is not in N', () => {
    const g = grid('a', 'WR', careerStats, mapOf('WR', ['a', 'b', 'c']))
    expect(cellOf(g, 'aDOT').of).toBe(2)
    expect(cellOf(g, 'targetShare').of).toBe(3)
  })
})

describe('red-zone rows on the games-played basis (U7)', () => {
  const wkOne = (from, to, stat) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, stat]))
  const careerStats = {
    2025: {
      w1: { gamesPlayed: 10, team: 'DAL', weeklyStatus: P(10), stats: { rec_tgt: 20, rec_rz_tgt: 10, rush_att: 20, rush_rz_att: 10 }, weeklyStats: wkOne(1, 10, { rec_tgt: 2, rec_rz_tgt: 1, rush_att: 2, rush_rz_att: 1 }) },
      w2: { gamesPlayed: 17, team: 'DAL', weeklyStatus: P(17), stats: { rec_tgt: 34, rec_rz_tgt: 17, rush_att: 34, rush_rz_att: 17 }, weeklyStats: wkOne(1, 17, { rec_tgt: 2, rec_rz_tgt: 1, rush_att: 2, rush_rz_att: 1 }) },
    },
  }

  it.each([
    ['WR', 'recRzShare', 'rzTgtShare', 'rec_rz_tgt'],
    ['RB', 'rushRzShare', 'rzRushShare', 'rush_rz_att'],
  ])('U7 %s %s is Market’s games-played share, not player ÷ team season total', (pos, rowId, usageKey, statKey) => {
    const playerMap = mapOf(pos, ['w1', 'w2'])
    const value = cellOf(grid('w1', pos, careerStats, playerMap), rowId).value
    const market = buildWindowStats({ window: { id: '2025', kind: 'season', seasons: [2025] }, careerStats, currentSeasonTotals: null, playerMap, gameLogsByYear: null })
    expect(value).toBe(market.get('w1').usage[usageKey])
    expect(value).toBeCloseTo(10 / 20)
    const seasonTeam = careerStats[2025].w1.stats[statKey] / (careerStats[2025].w1.stats[statKey] + careerStats[2025].w2.stats[statKey])
    expect(value).not.toBeCloseTo(seasonTeam, 2)
  })
})

describe('one whole-league pass per column (U9)', () => {
  const totals = { season: 2026, complete: true, players: { a: row(10, { rec_tgt: 20, pass_att: 200 }) } }
  const careerStats = Object.fromEntries([2023, 2024, 2025].map(y => [y, { a: row(16, { rec_tgt: 80, pass_att: 400 }) }]))

  it.each(['QB', 'WR'])('U9 %s: 3 seasons + live is exactly 4 buildWindowStats calls', pos => {
    vi.mocked(buildWindowStats).mockClear()
    grid('a', pos, careerStats, mapOf(pos, ['a']), { currentSeasonTotals: totals, liveUsable: true })
    expect(buildWindowStats).toHaveBeenCalledTimes(4)
  })
})

describe('copied definition (U11)', () => {
  it('U11 LIVE_SEASON_GAMES equals qbTakeover.REG_SEASON_TEAM_GAMES (the original)', () => {
    expect(LIVE_SEASON_GAMES).toBe(REG_SEASON_TEAM_GAMES)
  })
})
