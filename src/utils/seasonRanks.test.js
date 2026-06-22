import { describe, it, expect } from 'vitest'
import { rankPositionSeason, buildSeasonPositionRanks, computeCeilingFloor } from './seasonRanks.js'

// ---------------------------------------------------------------------------
// rankPositionSeason
// ---------------------------------------------------------------------------
describe('rankPositionSeason', () => {
  it('ranks two WRs by PPG descending, 1-based', () => {
    const seasonData = {
      'p1': { fantasyPoints: 300, gamesPlayed: 15 },  // ppg=20
      'p2': { fantasyPoints: 180, gamesPlayed: 15 },  // ppg=12
    }
    const playersMap = {
      p1: { position: 'WR' },
      p2: { position: 'WR' },
    }
    const result = rankPositionSeason(seasonData, playersMap, 'WR')
    expect(result.get('p1')).toEqual({ rank: 1, points: 300, ppg: 20 })
    expect(result.get('p2')).toEqual({ rank: 2, points: 180, ppg: 12 })
  })

  it('excludes players with gamesPlayed === 0', () => {
    const seasonData = {
      'p1': { fantasyPoints: 200, gamesPlayed: 10 },
      'p2': { fantasyPoints: 100, gamesPlayed: 0 },
    }
    const playersMap = { p1: { position: 'WR' }, p2: { position: 'WR' } }
    const result = rankPositionSeason(seasonData, playersMap, 'WR')
    expect(result.has('p2')).toBe(false)
    expect(result.get('p1').rank).toBe(1)
  })

  it('filters by position — RB in same season not ranked among WRs', () => {
    const seasonData = {
      'wr1': { fantasyPoints: 200, gamesPlayed: 10 },
      'rb1': { fantasyPoints: 400, gamesPlayed: 16 },
    }
    const playersMap = { wr1: { position: 'WR' }, rb1: { position: 'RB' } }
    const result = rankPositionSeason(seasonData, playersMap, 'WR')
    expect(result.has('rb1')).toBe(false)
    expect(result.get('wr1').rank).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// buildSeasonPositionRanks
// ---------------------------------------------------------------------------
describe('buildSeasonPositionRanks', () => {
  it('multi-season fixture → correct ranksByPlayer entries and refByPosRank', () => {
    const careerStats = {
      '2023': {
        'wr1': { fantasyPoints: 320, gamesPlayed: 16 },  // ppg=20, rank 1
        'wr2': { fantasyPoints: 160, gamesPlayed: 16 },  // ppg=10, rank 2
      },
      '2024': {
        'wr1': { fantasyPoints: 280, gamesPlayed: 16 },  // ppg=17.5, rank 1
        'wr2': { fantasyPoints: 240, gamesPlayed: 16 },  // ppg=15, rank 2
      },
    }
    const playersMap = { wr1: { position: 'WR' }, wr2: { position: 'WR' } }

    const { ranksByPlayer, refByPosRank } = buildSeasonPositionRanks(careerStats, playersMap)

    // wr1: rank 1 in both seasons
    const wr1Seasons = ranksByPlayer.get('wr1')
    expect(wr1Seasons).toHaveLength(2)
    const wr1by = Object.fromEntries(wr1Seasons.map(s => [s.season, s]))
    expect(wr1by[2023]).toEqual({ season: 2023, rank: 1, points: 320 })
    expect(wr1by[2024]).toEqual({ season: 2024, rank: 1, points: 280 })

    // wr2: rank 2 in both seasons
    const wr2by = Object.fromEntries(ranksByPlayer.get('wr2').map(s => [s.season, s]))
    expect(wr2by[2023]).toEqual({ season: 2023, rank: 2, points: 160 })
    expect(wr2by[2024]).toEqual({ season: 2024, rank: 2, points: 240 })

    // refByPosRank.WR[1] = mean of rank-1 WR total points = (320+280)/2 = 300
    expect(refByPosRank.WR[1]).toBeCloseTo(300)
    // refByPosRank.WR[2] = (160+240)/2 = 200
    expect(refByPosRank.WR[2]).toBeCloseTo(200)
  })

  it('null careerStats → empty Map and empty refByPosRank, no throw', () => {
    const { ranksByPlayer, refByPosRank } = buildSeasonPositionRanks(null, {})
    expect(ranksByPlayer.size).toBe(0)
    expect(refByPosRank).toEqual({})
  })

  it('empty careerStats → empty Map and empty refByPosRank, no throw', () => {
    const { ranksByPlayer, refByPosRank } = buildSeasonPositionRanks({}, {})
    expect(ranksByPlayer.size).toBe(0)
    expect(refByPosRank).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// computeCeilingFloor
// ---------------------------------------------------------------------------
describe('computeCeilingFloor', () => {
  const refByPosRank = { WR: { 1: 320, 5: 180 } }

  it('picks ceiling (lowest rank) and floor (highest rank) with deltas', () => {
    const seasons = [
      { season: 2022, rank: 3, points: 220 },
      { season: 2023, rank: 1, points: 300 },
      { season: 2024, rank: 5, points: 140 },
    ]
    const result = computeCeilingFloor(seasons, 'WR', refByPosRank)
    expect(result.ceiling.rank).toBe(1)
    expect(result.ceiling.season).toBe(2023)
    expect(result.ceiling.points).toBe(300)
    expect(result.ceiling.delta).toBe(Math.round(300 - 320))  // -20
    expect(result.floor.rank).toBe(5)
    expect(result.floor.points).toBe(140)
    expect(result.floor.delta).toBe(Math.round(140 - 180))    // -40
  })

  it('single-season player → ceiling.season === floor.season', () => {
    const seasons = [{ season: 2023, rank: 2, points: 250 }]
    const result = computeCeilingFloor(seasons, 'WR', refByPosRank)
    expect(result.ceiling.season).toBe(result.floor.season)
    expect(result.ceiling.season).toBe(2023)
    expect(result.ceiling.rank).toBe(result.floor.rank)
    expect(result.ceiling.refAvg).toBeNull()   // no rank-2 ref in refByPosRank
    expect(result.ceiling.delta).toBeNull()
  })

  it('empty array → returns null', () => {
    expect(computeCeilingFloor([], 'WR', refByPosRank)).toBeNull()
  })

  it('undefined → returns null', () => {
    expect(computeCeilingFloor(undefined, 'WR', refByPosRank)).toBeNull()
  })

  it('tie on rank — ceiling picks higher points, floor picks lower', () => {
    const seasons = [
      { season: 2022, rank: 2, points: 250 },
      { season: 2023, rank: 2, points: 210 },
    ]
    const result = computeCeilingFloor(seasons, 'WR', refByPosRank)
    expect(result.ceiling.points).toBe(250)
    expect(result.floor.points).toBe(210)
  })

  it('missing reference for that rank → delta null, season/rank/points still present', () => {
    const seasons = [{ season: 2023, rank: 99, points: 180 }]
    const result = computeCeilingFloor(seasons, 'WR', refByPosRank)
    expect(result.ceiling.delta).toBeNull()
    expect(result.ceiling.refAvg).toBeNull()
    expect(result.ceiling.season).toBe(2023)
    expect(result.ceiling.rank).toBe(99)
    expect(result.ceiling.points).toBe(180)
  })

  it('injury-deflation: rank-1 by PPG but low total points → delta < 0', () => {
    // Rank 1 but only 100 total points (short season); ref avg for WR1 is 320
    const seasons = [{ season: 2023, rank: 1, points: 100 }]
    const result = computeCeilingFloor(seasons, 'WR', refByPosRank)
    expect(result.ceiling.rank).toBe(1)
    expect(result.ceiling.delta).toBeLessThan(0)  // 100 - 320 = -220
  })
})
