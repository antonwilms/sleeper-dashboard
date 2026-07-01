import { describe, it, expect } from 'vitest'
import {
  buildTeamReceivingTotals,
  buildPositionStatSeries,
  computeMetricSummary,
} from './outlookPositionStats.js'

// ---------------------------------------------------------------------------
// Test 1: Rate recomputed from components, not stored rate keys (C4 guard)
// ---------------------------------------------------------------------------
describe('outlookPositionStats', () => {
  it('1. cmpPct/passerRating/yardsPerCarry/aDOT computed from counting components — ignores stored rate keys', () => {
    const careerStats = {
      2024: {
        p1: {
          gamesPlayed: 10,
          fantasyPoints: 200,
          stats: {
            pass_cmp: 200, pass_att: 300, pass_yd: 3000, pass_td: 25, pass_int: 5,
            cmp_pct: 999, pass_rtg: 999, pass_ypa: 999,  // wrong stored rates — must not be used
            rush_yd: 500, rush_att: 100, rush_ypa: 999,   // wrong rush_ypa
            rec_tgt: 50, rec_air_yd: 800, rec_ypt: 999,   // wrong rec_ypt
          },
        },
      },
    }
    const deps = { historicalShares: {}, teamReceivingTotals: {}, playerMap: {} }

    // QB: cmpPct and passerRating
    const qbSeries = buildPositionStatSeries('p1', 'QB', careerStats, deps)
    expect(qbSeries.cmpPct.length).toBe(1)
    expect(qbSeries.cmpPct[0].value).toBeCloseTo(100 * 200 / 300, 5)
    expect(qbSeries.cmpPct[0].value).not.toBe(999)
    expect(qbSeries.passerRating.length).toBe(1)
    expect(qbSeries.passerRating[0].value).not.toBe(999)
    expect(Number.isFinite(qbSeries.passerRating[0].value)).toBe(true)

    // RB: yardsPerCarry (not rush_ypa)
    const rbSeries = buildPositionStatSeries('p1', 'RB', careerStats, deps)
    expect(rbSeries.yardsPerCarry.length).toBe(1)
    expect(rbSeries.yardsPerCarry[0].value).toBeCloseTo(500 / 100, 5)
    expect(rbSeries.yardsPerCarry[0].value).not.toBe(999)

    // WR: aDOT (not rec_ypt)
    const wrSeries = buildPositionStatSeries('p1', 'WR', careerStats, deps)
    expect(wrSeries.aDOT.length).toBe(1)
    expect(wrSeries.aDOT[0].value).toBeCloseTo(800 / 50, 5)
    expect(wrSeries.aDOT[0].value).not.toBe(999)
  })

  // ---------------------------------------------------------------------------
  // Test 2: <2 qualifying seasons → level only
  // ---------------------------------------------------------------------------
  it('2. exactly 1 qualifying season → level only, trend null', () => {
    const series = [{ season: 2024, value: 0.25 }]
    const summary = computeMetricSummary(series, 0.01)
    expect(summary).toEqual({ level: 0.25, latestSeason: 2024, trend: null })
  })

  // ---------------------------------------------------------------------------
  // Test 3: Below-floor season omitted; gp>=8 neighbour included
  // ---------------------------------------------------------------------------
  it('3. gp<8 season excluded; gp>=8 seasons straddling it used for trend', () => {
    const careerStats = {
      2022: { p1: { gamesPlayed: 9, fantasyPoints: 90, stats: { rush_att: 80, rush_yd: 400 } } },
      2023: { p1: { gamesPlayed: 7, fantasyPoints: 50, stats: { rush_att: 50, rush_yd: 200 } } }, // below floor
      2024: { p1: { gamesPlayed: 10, fantasyPoints: 100, stats: { rush_att: 90, rush_yd: 540 } } },
    }
    const deps = { historicalShares: {}, teamReceivingTotals: {}, playerMap: {} }
    const series = buildPositionStatSeries('p1', 'RB', careerStats, deps)
    const yc = series.yardsPerCarry
    expect(yc.length).toBe(2)
    expect(yc[0].season).toBe(2022)
    expect(yc[1].season).toBe(2024)
    const summary = computeMetricSummary(yc, 0.1)
    expect(summary.trend.priorSeason).toBe(2022)
    expect(summary.trend.latestSeason).toBe(2024)
    expect(summary.trend.delta).toBeCloseTo(540 / 90 - 400 / 80, 5)
  })

  // ---------------------------------------------------------------------------
  // Test 4: Share sourced from the correct path
  // ---------------------------------------------------------------------------
  it('4. rushShare from historicalShares verbatim; rbTargetShare from buildTeamReceivingTotals ratio', () => {
    const careerStats = {
      2024: {
        rb1: {
          gamesPlayed: 10, fantasyPoints: 100,
          stats: { rush_att: 100, rush_yd: 400, rec_tgt: 20, rec_air_yd: 0 },
        },
      },
    }
    const historicalShares = {
      rb1: [{ season: 2024, share: 0.321, gamesPlayed: 10 }],
    }
    const teamReceivingTotals = {
      2024: { DAL: { recTgt: 400, recAirYd: 0 } },
    }
    const playerMap = { rb1: { team: 'DAL' } }
    const deps = { historicalShares, teamReceivingTotals, playerMap }

    const series = buildPositionStatSeries('rb1', 'RB', careerStats, deps)
    // rushShare = historicalShares entry verbatim (not recomputed)
    expect(series.rushShare[0].value).toBe(0.321)
    // rbTargetShare = 20/400 = 0.05 (3dp rounding)
    expect(series.rbTargetShare[0].value).toBeCloseTo(0.05, 3)
    // Confirm rbTargetShare is NOT an average of per-game share — it's the season-total ratio
    expect(series.rbTargetShare[0].value).not.toBe(0.321)
  })

  // ---------------------------------------------------------------------------
  // Test 5: buildTeamReceivingTotals
  // ---------------------------------------------------------------------------
  it('5. buildTeamReceivingTotals: gp>=1 summed; gp=0 excluded; missing-team player skipped', () => {
    const careerStats = {
      2024: {
        p1: { gamesPlayed: 10, fantasyPoints: 100, stats: { rec_tgt: 100, rec_air_yd: 800 } },
        p2: { gamesPlayed: 1,  fantasyPoints: 10,  stats: { rec_tgt: 50,  rec_air_yd: 300 } },
        p3: { gamesPlayed: 0,  fantasyPoints: 0,   stats: { rec_tgt: 200, rec_air_yd: 1000 } }, // excluded gp=0
        p4: { gamesPlayed: 5,  fantasyPoints: 50,  stats: { rec_tgt: 80,  rec_air_yd: 400 } }, // no team → skipped
      },
    }
    const playerMap = {
      p1: { team: 'KC' },
      p2: { team: 'KC' },
      p3: { team: 'KC' },
      // p4 intentionally absent
    }
    const result = buildTeamReceivingTotals(careerStats, playerMap)
    expect(result[2024].KC.recTgt).toBe(150)   // p1(100)+p2(50); p3 gp=0 excluded; p4 no team
    expect(result[2024].KC.recAirYd).toBe(1100) // p1(800)+p2(300)
  })

  // ---------------------------------------------------------------------------
  // Test 6: Sacks present path — no gamelogs substitution
  // ---------------------------------------------------------------------------
  it('6. sacks = pass_sack count; trend delta is finite (documents F2 — no gamelog loader needed)', () => {
    const careerStats = {
      2023: {
        qb1: {
          gamesPlayed: 16, fantasyPoints: 350,
          stats: { pass_att: 500, pass_cmp: 330, pass_yd: 4000, pass_td: 30, pass_int: 8, pass_sack: 30 },
        },
      },
      2024: {
        qb1: {
          gamesPlayed: 16, fantasyPoints: 360,
          stats: { pass_att: 520, pass_cmp: 350, pass_yd: 4200, pass_td: 32, pass_int: 7, pass_sack: 22 },
        },
      },
    }
    const deps = { historicalShares: {}, teamReceivingTotals: {}, playerMap: {} }
    const series = buildPositionStatSeries('qb1', 'QB', careerStats, deps)
    expect(series.sacks.length).toBe(2)
    expect(series.sacks[0].value).toBe(30)
    expect(series.sacks[1].value).toBe(22)
    const summary = computeMetricSummary(series.sacks, 0.5)
    expect(summary.trend).not.toBeNull()
    expect(Number.isFinite(summary.trend.delta)).toBe(true)
    expect(summary.trend.delta).toBe(-8) // 22 - 30
  })

  // ---------------------------------------------------------------------------
  // Test 7: computeMetricSummary direction & dead-band
  // ---------------------------------------------------------------------------
  it('7. computeMetricSummary: empty→null; inside eps→flat; outside→up/down', () => {
    expect(computeMetricSummary([], 0.01)).toBeNull()
    expect(computeMetricSummary(null, 0.01)).toBeNull()

    const flat = [{ season: 2023, value: 0.25 }, { season: 2024, value: 0.255 }]
    expect(computeMetricSummary(flat, 0.01).trend.direction).toBe('flat') // delta=0.005 < eps=0.01

    const up = [{ season: 2023, value: 0.20 }, { season: 2024, value: 0.25 }]
    expect(computeMetricSummary(up, 0.01).trend.direction).toBe('up') // delta=0.05 > eps=0.01

    const down = [{ season: 2023, value: 0.30 }, { season: 2024, value: 0.25 }]
    expect(computeMetricSummary(down, 0.01).trend.direction).toBe('down') // delta=-0.05 < -eps
  })

  // ---------------------------------------------------------------------------
  // Test 8: Never NaN — zero denominators → null, not NaN
  // ---------------------------------------------------------------------------
  it('8. zero denominators → that season excluded (value null), never NaN', () => {
    const careerStats = {
      2024: {
        qb1: {
          gamesPlayed: 10, fantasyPoints: 100,
          stats: { pass_att: 0, pass_cmp: 0, pass_yd: 0, pass_td: 0, pass_int: 0 },
        },
        rb1: {
          gamesPlayed: 10, fantasyPoints: 100,
          stats: { rush_att: 0, rush_yd: 0, rec_tgt: 0, rec_air_yd: 0 },
        },
        wr1: {
          gamesPlayed: 10, fantasyPoints: 100,
          stats: { rec_tgt: 0, rec_air_yd: 0 },
        },
      },
    }
    const teamReceivingTotals = { 2024: { KC: { recTgt: 0, recAirYd: 0 } } }
    const playerMap = {
      rb1: { team: 'KC' },
      wr1: { team: 'KC' },
    }
    const deps = { historicalShares: {}, teamReceivingTotals, playerMap }

    // QB pass_att=0 → no cmpPct or passerRating qualifying seasons
    const qbSeries = buildPositionStatSeries('qb1', 'QB', careerStats, deps)
    expect(qbSeries.cmpPct.length).toBe(0)
    expect(qbSeries.passerRating.length).toBe(0)

    // RB rush_att=0 → no yardsPerCarry; rec_tgt=0 → no rbTargetShare; team denom=0 → also no rbTargetShare
    const rbSeries = buildPositionStatSeries('rb1', 'RB', careerStats, deps)
    expect(rbSeries.yardsPerCarry.length).toBe(0)
    expect(rbSeries.rbTargetShare.length).toBe(0)

    // WR rec_tgt=0 → no aDOT; rec_air_yd=0 → no airYardsShare
    const wrSeries = buildPositionStatSeries('wr1', 'WR', careerStats, deps)
    expect(wrSeries.aDOT.length).toBe(0)
    expect(wrSeries.airYardsShare.length).toBe(0)

    // Confirm no NaN anywhere
    for (const series of [qbSeries, rbSeries, wrSeries]) {
      for (const arr of Object.values(series)) {
        for (const pt of arr) {
          expect(Number.isNaN(pt.value)).toBe(false)
        }
      }
    }
  })
})
