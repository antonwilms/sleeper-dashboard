import { describe, it, expect } from 'vitest'
import { buildInSeasonUsage } from './portfolioUsage'

// Fixture M's usage inputs (Portfolio.test.jsx): w1 live share 9/30 = 30%, live snap 60%, live games 3/3;
// prior games-played share 30/90 = 33%, season-total share 30/120 = 25%, prior snap 90%, prior games 15/17.
const W = (p, d = 0) => [...Array(p).fill('P'), ...Array(d).fill('D'), ...Array(18 - p - d).fill('X')]
const weeks = (from, to, stat) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, stat]))

const playerMap = { w1: { position: 'WR' }, w2: { position: 'WR' }, q1: { position: 'QB' } }
const liveRows = {
  w1: { gamesPlayed: 3, fantasyPoints: 54, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 9, off_snp: 120, tm_off_snp: 200 }, weeklyStats: weeks(1, 3, { rec_tgt: 3 }) },
  w2: { gamesPlayed: 3, fantasyPoints: 60, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 21 }, weeklyStats: weeks(1, 3, { rec_tgt: 7 }) },
  q1: { gamesPlayed: 3, fantasyPoints: 60, team: 'DAL', weeklyStatus: W(3), stats: { off_snp: 60, tm_off_snp: 60 }, weeklyStats: {} },
}
const careerStats = {
  2025: {
    w1: { gamesPlayed: 10, fantasyPoints: 160, team: 'DAL', weeklyStatus: W(15, 2), stats: { off_snp: 900, tm_off_snp: 1000, rec_tgt: 30 }, weeklyStats: weeks(1, 15, { rec_tgt: 2 }) },
    w2: { gamesPlayed: 10, fantasyPoints: 140, team: 'DAL', weeklyStatus: W(17), stats: { rec_tgt: 90 }, weeklyStats: { ...weeks(1, 15, { rec_tgt: 4 }), ...weeks(16, 17, { rec_tgt: 15 }) } },
  },
}
const args = { ids: ['w1', 'q1'], liveRows, liveSeason: 2026, careerStats, dataSeason: 2025, playerMap, gameLogsByYear: null }

describe('buildInSeasonUsage (T25)', () => {
  it('live is the live season; prior is the games-played share of the data season, not the season-total one', () => {
    const w1 = buildInSeasonUsage(args).get('w1')
    expect(w1.live).toMatchObject({ played: 3, missed: 0 })
    expect(w1.live.share).toBeCloseTo(0.3, 3)
    expect(w1.live.snap).toBeCloseTo(0.6, 3)
    expect(w1.prior).toMatchObject({ played: 15, missed: 2 })
    expect(w1.prior.share).toBeCloseTo(30 / 90, 3) // 33%; the season-total share would be 25%
    expect(w1.prior.snap).toBeCloseTo(0.9, 3)
  })

  it('a quarterback has no share and no snap on either side', () => {
    const q1 = buildInSeasonUsage(args).get('q1')
    expect(q1.live.share).toBeNull()
    expect(q1.live.snap).toBeNull() // live snaps 60/60 would read 100% without the position gate
  })

  it('no live rows → live: null for every id; prior still built', () => {
    const out = buildInSeasonUsage({ ...args, liveRows: null })
    expect(out.get('w1').live).toBeNull()
    expect(out.get('w1').prior.played).toBe(15)
  })

  it('a player with no row on a side has that side null', () => {
    expect(buildInSeasonUsage(args).get('q1').prior).toBeNull()
  })

  it('never mutates its inputs', () => {
    const clone = JSON.parse(JSON.stringify({ liveRows, careerStats, playerMap }))
    buildInSeasonUsage(args)
    expect({ liveRows, careerStats, playerMap }).toEqual(clone)
  })
})
