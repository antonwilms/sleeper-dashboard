import { describe, it, expect } from 'vitest'
import {
  buildLineupRanks, rankDual, seasonLinesFromCareer, buildRankPeers,
} from './weeklyRanks'

const PM = {
  a: { position: 'WR' }, b: { position: 'WR' }, c: { position: 'WR' }, d: { position: 'WR' },
  q: { position: 'QB' }, k: { position: 'K' }, df: { position: 'DEF' },
}

const line = (points, games) => ({ points, games })
const wrMap = (...ids) => Object.fromEntries(ids.map(id => [id, { position: 'WR', full_name: id.toUpperCase() }]))
const pts = o => Object.fromEntries(Object.entries(o).map(([id, p]) => [id, line(p, 3)]))

describe('rankDual — total ranks', () => {
  it('R-1: uses competition ranking (30, 20, 20, 10 -> 1, 2, 2, 4)', () => {
    const r = rankDual(pts({ a: 30, b: 20, c: 20, d: 10 }), PM)
    expect([r.get('a').posRank, r.get('b').posRank, r.get('c').posRank, r.get('d').posRank]).toEqual([1, 2, 2, 4])
  })

  it('R-2: posRank is within position, overallRank across QB/RB/WR/TE', () => {
    const r = rankDual(pts({ a: 10, q: 50, b: 30 }), PM)
    expect(r.get('q')).toMatchObject({ posRank: 1, overallRank: 1 })
    expect(r.get('b')).toMatchObject({ posRank: 1, overallRank: 2 })
    expect(r.get('a')).toMatchObject({ posRank: 2, overallRank: 3 })
  })

  it('R-3: K/DEF get a posRank and null overall ranks', () => {
    const r = rankDual(pts({ k: 90, df: 80, a: 5 }), PM)
    expect(r.get('k')).toMatchObject({ posRank: 1, overallRank: null, overallRankPpg: null })
    expect(r.get('df')).toMatchObject({ posRank: 1, overallRank: null, overallRankPpg: null })
    expect(r.get('a').overallRank).toBe(1)
  })
})

describe('buildLineupRanks', () => {
  it('reads careerStats[max season] (2025, with no 2024) for last-season rank', () => {
    const careerStats = {
      2023: { a: { gamesPlayed: 10, fantasyPoints: 500 }, b: { gamesPlayed: 10, fantasyPoints: 10 } },
      2025: { a: { gamesPlayed: 10, fantasyPoints: 10 }, b: { gamesPlayed: 10, fantasyPoints: 500 } },
    }
    const out = buildLineupRanks({
      rendered: [{ id: 'a' }, { id: 'b' }], careerStats, playedWeeklyMaps: [], playerMap: PM, scoringSettings: {},
    })
    expect(out.a.lastPos).toBe(2)
    expect(out.b.lastPos).toBe(1)
  })

  it('zero played weeks -> thisPos and thisOverall are null', () => {
    const out = buildLineupRanks({
      rendered: [{ id: 'a' }], careerStats: { 2025: { a: { gamesPlayed: 1, fantasyPoints: 5 } } },
      playedWeeklyMaps: [], playerMap: PM, scoringSettings: { rec: 1 },
    })
    expect(out.a).toEqual({ lastPos: 1, lastPosPpg: 1, thisPos: null, thisPosPpg: null, thisOverall: null, thisOverallPpg: null })
  })

  it('this-season ranks come from the weekly rows, across every player in the payload', () => {
    const maps = [{ week: 1, rows: {
      a: { stats: { gp: 1, rec: 5 } }, b: { stats: { gp: 1, rec: 9 } }, q: { stats: { gp: 1, rec: 20 } },
    } }]
    const out = buildLineupRanks({
      rendered: [{ id: 'a' }], careerStats: {}, playedWeeklyMaps: maps, playerMap: PM, scoringSettings: { rec: 1 },
    })
    expect(out.a).toEqual({ lastPos: null, lastPosPpg: null, thisPos: 2, thisPosPpg: 2, thisOverall: 3, thisOverallPpg: 3 })
  })

  it('BL-1: per-game ranks diverge from totals, and the games floor counts this season\'s weekly rows', () => {
    const careerStats = { 2025: { a: { gamesPlayed: 10, fantasyPoints: 100 }, b: { gamesPlayed: 4, fantasyPoints: 60 } } }
    const week = (n, rows) => ({ week: n, rows: Object.fromEntries(Object.entries(rows).map(([id, rec]) => [id, { stats: { gp: 1, rec } }])) })
    const maps = [week(1, { a: 5, b: 9, c: 4 }), week(2, { a: 5, b: 9, c: 4 }), week(3, { a: 5, c: 4 })]
    const out = buildLineupRanks({
      rendered: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], careerStats, playedWeeklyMaps: maps, playerMap: PM, scoringSettings: { rec: 1 },
    })
    expect(out.a).toEqual({ lastPos: 1, lastPosPpg: 2, thisPos: 2, thisPosPpg: 1, thisOverall: 2, thisOverallPpg: 1 })
    expect(out.b).toEqual({ lastPos: 2, lastPosPpg: 1, thisPos: 1, thisPosPpg: null, thisOverall: 1, thisOverallPpg: null })
    expect(out.c).toEqual({ lastPos: null, lastPosPpg: null, thisPos: 3, thisPosPpg: 2, thisOverall: 3, thisOverallPpg: 2 })
  })
})

const col = (r, ids, key) => ids.map(id => r.get(id)[key])

describe('rankDual', () => {
  it('W-1: total and per-game orderings diverge', () => {
    const r = rankDual({ a: line(100, 10), b: line(60, 4), c: line(80, 8), d: line(45, 5) }, wrMap('a', 'b', 'c', 'd'))
    expect(col(r, ['a', 'c', 'b', 'd'], 'posRank')).toEqual([1, 2, 3, 4])
    expect(col(r, ['b', 'a', 'c', 'd'], 'posRankPpg')).toEqual([1, 2, 2, 4])
  })

  it('W-2: a player under 3 games has no PPG rank but keeps a total rank', () => {
    const r = rankDual({ a: line(50, 5), b: line(36, 4), c: line(40, 2) }, wrMap('a', 'b', 'c'))
    expect(r.get('c').posRankPpg).toBeNull()
    expect(r.get('c').posRank).toBe(2)
    expect(col(r, ['a', 'b'], 'posRankPpg')).toEqual([1, 2])
  })

  it('W-3: in week 1 the floor drops to the most games played', () => {
    const map = { ...wrMap('a', 'b'), q: { position: 'QB' } }
    const r = rankDual({ a: line(10, 1), b: line(5, 1), q: line(20, 1) }, map)
    for (const id of ['a', 'b', 'q']) {
      expect(typeof r.get(id).posRankPpg).toBe('number')
      expect(typeof r.get(id).overallRankPpg).toBe('number')
    }
  })

  it('W-4: the floor is computed per position group', () => {
    const map = { ...wrMap('w1', 'w2'), t1: { position: 'TE' }, t2: { position: 'TE' } }
    const r = rankDual({ w1: line(30, 3), w2: line(30, 2), t1: line(20, 2), t2: line(15, 1) }, map)
    expect(r.get('w2').posRankPpg).toBeNull()
    expect(typeof r.get('t1').posRankPpg).toBe('number')
    expect(r.get('t2').posRankPpg).toBeNull()
  })

  it('W-7: unmapped, non-finite and 0-game entries are skipped', () => {
    const r = rankDual({ a: line(10, 3), nomap: line(50, 3), nan: line(NaN, 3), zero: line(40, 0) }, wrMap('a', 'nan', 'zero'))
    expect([...r.keys()]).toEqual(['a'])
    expect(r.get('a')).toMatchObject({ posRank: 1, posRankPpg: 1 })
  })
})

describe('seasonLinesFromCareer', () => {
  it('W-6: keeps rows with games played and finite points; null rows -> {}', () => {
    const rows = {
      a: { gamesPlayed: 10, fantasyPoints: 20 }, b: { gamesPlayed: 0, fantasyPoints: 7 },
      c: { gamesPlayed: 5, fantasyPoints: 11 }, d: { gamesPlayed: 3, fantasyPoints: null },
    }
    expect(seasonLinesFromCareer(rows)).toEqual({ a: { points: 20, games: 10 }, c: { points: 11, games: 5 } })
    expect(seasonLinesFromCareer(null)).toEqual({})
  })
})

describe('buildRankPeers', () => {
  it('W-8: peers carry the PPG rank and are ordered by total rank', () => {
    const map = wrMap('a', 'b', 'c')
    const lines = { a: line(100, 10), b: line(60, 4), c: line(80, 2) }
    const ranks = rankDual(lines, map)
    const peers = buildRankPeers({ lines, ranks, playersMap: map, position: 'WR', playerId: 'a' })
    expect(peers.map(p => p.player_id)).toEqual(['a', 'c', 'b'])
    for (const p of peers) expect(p.positionRankPpg).toBe(ranks.get(p.player_id).posRankPpg)
    expect(peers[1].positionRankPpg).toBeNull()
  })
})
