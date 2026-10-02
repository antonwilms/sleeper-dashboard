import { describe, it, expect } from 'vitest'
import {
  rankByTotalPoints, seasonPointsFromCareer, seasonPointsFromWeekly, buildLineupRanks,
} from './weeklyRanks'

const PM = {
  a: { position: 'WR' }, b: { position: 'WR' }, c: { position: 'WR' }, d: { position: 'WR' },
  q: { position: 'QB' }, k: { position: 'K' }, df: { position: 'DEF' },
}

describe('rankByTotalPoints', () => {
  it('uses competition ranking (30, 20, 20, 10 -> 1, 2, 2, 4)', () => {
    const r = rankByTotalPoints({ a: 30, b: 20, c: 20, d: 10 }, PM)
    expect([r.get('a').posRank, r.get('b').posRank, r.get('c').posRank, r.get('d').posRank]).toEqual([1, 2, 2, 4])
  })

  it('posRank is within position, overallRank across QB/RB/WR/TE', () => {
    const r = rankByTotalPoints({ a: 10, q: 50, b: 30 }, PM)
    expect(r.get('q')).toEqual({ posRank: 1, overallRank: 1 })
    expect(r.get('b')).toEqual({ posRank: 1, overallRank: 2 })
    expect(r.get('a')).toEqual({ posRank: 2, overallRank: 3 })
  })

  it('K/DEF get a posRank and a null overallRank', () => {
    const r = rankByTotalPoints({ k: 90, df: 80, a: 5 }, PM)
    expect(r.get('k')).toEqual({ posRank: 1, overallRank: null })
    expect(r.get('df')).toEqual({ posRank: 1, overallRank: null })
    expect(r.get('a').overallRank).toBe(1)
  })

  it('skips ids absent from playerMap and non-finite points', () => {
    const r = rankByTotalPoints({ ghost: 99, a: NaN, b: 5 }, PM)
    expect([...r.keys()]).toEqual(['b'])
  })
})

describe('seasonPointsFromCareer', () => {
  it('drops gamesPlayed 0 and non-finite points; null rows -> {}', () => {
    const rows = {
      a: { gamesPlayed: 10, fantasyPoints: 100 },
      b: { gamesPlayed: 0, fantasyPoints: 50 },
      c: { gamesPlayed: 5, fantasyPoints: null },
    }
    expect(seasonPointsFromCareer(rows)).toEqual({ a: 100 })
    expect(seasonPointsFromCareer(null)).toEqual({})
  })
})

describe('seasonPointsFromWeekly', () => {
  const wk = (rows) => ({ week: 1, rows })
  it('counts only gp === 1 rows and skips TEAM_* rows', () => {
    const maps = [
      wk({ a: { stats: { gp: 1, rec: 4 } }, b: { stats: { gp: 0, rec: 9 } }, TEAM_KC: { stats: { gp: 1, rec: 99 } } }),
      wk({ a: { stats: { gp: 1, rec: 2 } } }),
    ]
    expect(seasonPointsFromWeekly(maps, { rec: 1 })).toEqual({ a: 6 })
  })

  it('scores with the passed settings: PPR and half-PPR order two players differently', () => {
    const maps = [wk({
      x: { stats: { gp: 1, rec: 10, rec_yd: 50 } }, // 10 rec
      y: { stats: { gp: 1, rec: 2, rec_yd: 100 } }, // 2 rec
    })]
    const ppr = seasonPointsFromWeekly(maps, { rec: 1, rec_yd: 0.1 })
    const half = seasonPointsFromWeekly(maps, { rec: 0, rec_yd: 0.1 })
    expect(ppr.x).toBeGreaterThan(ppr.y)
    expect(half.y).toBeGreaterThan(half.x)
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
    expect(out.a).toEqual({ lastPos: 1, thisPos: null, thisOverall: null })
  })

  it('this-season ranks come from the weekly rows, across every player in the payload', () => {
    const maps = [{ week: 1, rows: {
      a: { stats: { gp: 1, rec: 5 } }, b: { stats: { gp: 1, rec: 9 } }, q: { stats: { gp: 1, rec: 20 } },
    } }]
    const out = buildLineupRanks({
      rendered: [{ id: 'a' }], careerStats: {}, playedWeeklyMaps: maps, playerMap: PM, scoringSettings: { rec: 1 },
    })
    expect(out.a).toEqual({ lastPos: null, thisPos: 2, thisOverall: 3 })
  })
})
