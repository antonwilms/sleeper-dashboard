import { describe, it, expect } from 'vitest'
import {
  normalizeTeamForSchedule,
  denormalizeTeamForSchedule,
  SCHEDULE_TEAM_ALIAS,
  computeSeasonAverages,
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
// denormalizeTeamForSchedule (dp-v2 6b) — the reverse hop, CR-16 fires again. Coaching data
// keys the Sleeper domain (LAR); the team-detail route param is era-accurate (LA).
// ---------------------------------------------------------------------------
describe('denormalizeTeamForSchedule', () => {
  it('LA → LAR', () => expect(denormalizeTeamForSchedule('LA')).toBe('LAR'))
  it('KC → KC (identity outside the one remapped pair)', () => expect(denormalizeTeamForSchedule('KC')).toBe('KC'))
  it('null → null', () => expect(denormalizeTeamForSchedule(null)).toBeNull())
  it('round-trips through normalizeTeamForSchedule for the remapped pair', () => {
    expect(denormalizeTeamForSchedule(normalizeTeamForSchedule('LAR'))).toBe('LAR')
  })
  it('is derived from SCHEDULE_TEAM_ALIAS, not a second hand-written literal — the two cannot drift', () => {
    for (const [sleeper, schedule] of Object.entries(SCHEDULE_TEAM_ALIAS)) {
      expect(denormalizeTeamForSchedule(schedule)).toBe(sleeper)
    }
  })
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
