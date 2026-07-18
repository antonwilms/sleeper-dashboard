import { describe, it, expect } from 'vitest'
import {
  buildTeamShareTotals,
  buildPerSeasonTeamShares,
  buildPositionStatSeries,
  computeMetricSummary,
} from './outlookPositionStats.js'
import { computeHistoricalTeamTotals, computeHistoricalShares } from './teamContext.js'

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
    const deps = { perSeasonTeamShares: {}, teamShareTotals: {} }

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
    const deps = { perSeasonTeamShares: {}, teamShareTotals: {} }
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
  it('4. rushShare from perSeasonTeamShares verbatim; rbTargetShare from teamShareTotals ratio', () => {
    const careerStats = {
      2024: {
        rb1: {
          gamesPlayed: 10, fantasyPoints: 100, team: 'DAL',
          stats: { rush_att: 100, rush_yd: 400, rec_tgt: 20, rec_air_yd: 0 },
        },
      },
    }
    const perSeasonTeamShares = {
      rb1: [{ season: 2024, share: 0.321, gamesPlayed: 10 }],
    }
    const teamShareTotals = {
      2024: { DAL: { rushAtt: 400, rec: 0, recTgt: 400, recAirYd: 0 } },
    }
    const deps = { perSeasonTeamShares, teamShareTotals }

    const series = buildPositionStatSeries('rb1', 'RB', careerStats, deps)
    // rushShare = perSeasonTeamShares entry verbatim (not recomputed)
    expect(series.rushShare[0].value).toBe(0.321)
    // rbTargetShare = 20/400 = 0.05 (3dp rounding), keyed by the record's per-season team
    expect(series.rbTargetShare[0].value).toBeCloseTo(0.05, 3)
    // Confirm rbTargetShare is NOT an average of per-game share — it's the season-total ratio
    expect(series.rbTargetShare[0].value).not.toBe(0.321)
  })

  // ---------------------------------------------------------------------------
  // Test 5: buildTeamShareTotals
  // ---------------------------------------------------------------------------
  it('5. buildTeamShareTotals: per-season-team keying + gp/team/playerMap gates', () => {
    const careerStats = {
      2024: {
        a1: { gamesPlayed: 10, team: 'A', stats: { rush_att: 100, rec: 20, rec_tgt: 30, rec_air_yd: 300 } },
        a2: { gamesPlayed: 8,  team: 'A', stats: { rush_att: 50,  rec: 10, rec_tgt: 15, rec_air_yd: 150 } },
        b1: { gamesPlayed: 12, team: 'B', stats: { rush_att: 80,  rec: 40, rec_tgt: 60, rec_air_yd: 500 } },
        zeroGp: { gamesPlayed: 0, team: 'A', stats: { rush_att: 999, rec: 999, rec_tgt: 999, rec_air_yd: 999 } }, // excluded gp=0
        noTeam: { gamesPlayed: 10, team: null, stats: { rush_att: 999, rec: 999, rec_tgt: 999, rec_air_yd: 999 } }, // no team → excluded
        noPlayerMap: { gamesPlayed: 10, team: 'A', stats: { rush_att: 999, rec: 999, rec_tgt: 999, rec_air_yd: 999 } }, // absent from playerMap → excluded
      },
    }
    const playerMap = {
      a1: { position: 'RB' }, a2: { position: 'RB' }, b1: { position: 'RB' },
      zeroGp: { position: 'RB' }, noTeam: { position: 'RB' },
      // noPlayerMap intentionally absent
    }
    const result = buildTeamShareTotals(careerStats, playerMap)
    expect(result[2024].A).toEqual({ rushAtt: 150, rec: 30, recTgt: 45, recAirYd: 450 }) // a1+a2 only
    expect(result[2024].B).toEqual({ rushAtt: 80, rec: 40, recTgt: 60, recAirYd: 500 })  // b1 only
    expect(result[2024].null).toBeUndefined()
    for (const teamTotals of Object.values(result[2024])) {
      for (const v of Object.values(teamTotals)) expect(Number.isNaN(v)).toBe(false)
    }
  })

  // ---------------------------------------------------------------------------
  // Pre-load render: OutlookTab guards careerStats/playerMap to {} before
  // calling (never passes null) — this documents the empty-object shape is
  // safe and produces an empty result, not a throw.
  // ---------------------------------------------------------------------------
  it('pre-load render: empty careerStats/playerMap → empty result, no throw', () => {
    expect(buildTeamShareTotals({}, {})).toEqual({})
    const shares = buildPerSeasonTeamShares({}, buildTeamShareTotals({}, {}), {})
    expect(shares).toEqual({})
  })

  // ---------------------------------------------------------------------------
  // Team-changer prior-season share uses the prior-season per-season team
  // ---------------------------------------------------------------------------
  it('team-changer: prior-season share is measured against the prior-season team, not the current team', () => {
    const careerStats = {
      2024: {
        X: { gamesPlayed: 10, team: 'A', stats: { rush_att: 100 } },
        Y: { gamesPlayed: 10, team: 'A', stats: { rush_att: 300 } },
        W: { gamesPlayed: 10, team: 'B', stats: { rush_att: 200 } },
      },
      2025: {
        X: { gamesPlayed: 10, team: 'B', stats: { rush_att: 120 } },
        Z: { gamesPlayed: 10, team: 'B', stats: { rush_att: 380 } },
      },
    }
    const playerMap = {
      X: { position: 'RB' }, Y: { position: 'RB' }, W: { position: 'RB' }, Z: { position: 'RB' },
    }
    const teamShareTotals = buildTeamShareTotals(careerStats, playerMap)
    const shares = buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)

    const x2024 = shares.X.find(e => e.season === 2024)
    const x2025 = shares.X.find(e => e.season === 2025)
    // 2024: X was on team A → 100 / (A total 400) = 0.25 — the per-season-team-correct value
    expect(x2024.share).toBeCloseTo(0.25, 3)
    // What a current-team (X's later team, B) computation would give: 100/200=0.50 — must differ
    expect(x2024.share).not.toBeCloseTo(100 / 200, 3)
    // 2025: X's per-season team is already B (== current team) → unaffected
    expect(x2025.share).toBeCloseTo(120 / 500, 3)
  })

  // ---------------------------------------------------------------------------
  // Non-team-changer invariance — byte-identical to computeHistoricalShares
  // ---------------------------------------------------------------------------
  it('non-team-changer invariance: byte-identical to computeHistoricalShares when no team changes anywhere', () => {
    const careerStats = {
      2023: {
        p1: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 100 } },
        p2: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 200 } },
        p3: { gamesPlayed: 10, team: 'DAL', stats: { rec_tgt: 50 } },
        p4: { gamesPlayed: 10, team: 'DAL', stats: { rec_tgt: 100 } },
      },
      2024: {
        p1: { gamesPlayed: 12, team: 'KC', stats: { rush_att: 150 } },
        p2: { gamesPlayed: 12, team: 'KC', stats: { rush_att: 180 } },
        p3: { gamesPlayed: 12, team: 'DAL', stats: { rec_tgt: 60 } },
        p4: { gamesPlayed: 12, team: 'DAL', stats: { rec_tgt: 90 } },
      },
    }
    const playerMap = {
      p1: { position: 'RB', team: 'KC' },
      p2: { position: 'RB', team: 'KC' },
      p3: { position: 'WR', team: 'DAL' },
      p4: { position: 'WR', team: 'DAL' },
    }
    const cur = computeHistoricalShares(careerStats, playerMap, computeHistoricalTeamTotals(careerStats, playerMap))
    const psn = buildPerSeasonTeamShares(careerStats, buildTeamShareTotals(careerStats, playerMap), playerMap)
    expect(psn).toEqual(cur)
  })

  // ---------------------------------------------------------------------------
  // Teammate-traded propagation — a non-changer's denominator is corrected,
  // not a regression. (Retired-player inclusion in the denominator is a
  // deliberate divergence: buildTeamShareTotals gates on playerMap membership
  // and drops directory-absent ids, while computeHistoricalTeamTotals keeps
  // them — the R2 denominator repair — and excludes only `TEAM_<abbr>`
  // aggregate rows via isTeamAggregateId.)
  // ---------------------------------------------------------------------------
  it('teammate-traded: a non-team-changer sees a corrected per-season denominator (propagating fix, not a regression)', () => {
    // p1 stays on KC both seasons. p2 is on KC in 2023 but is traded to DAL for 2024;
    // p2's CURRENT team (post-trade) is DAL, so the current-team path misattributes
    // p2's 2023 production away from KC, undercounting KC's true 2023 denominator.
    const careerStats = {
      2023: {
        p1: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 100 } },
        p2: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 100 } },
      },
      2024: {
        p1: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 100 } },
        p2: { gamesPlayed: 10, team: 'DAL', stats: { rush_att: 100 } },
      },
    }
    const playerMap = {
      p1: { position: 'RB', team: 'KC' },
      p2: { position: 'RB', team: 'DAL' }, // current team = DAL (post-trade)
    }
    const curTotals = computeHistoricalTeamTotals(careerStats, playerMap, { attribution: 'current-team' })
    const psnTotals = buildTeamShareTotals(careerStats, playerMap)
    expect(curTotals[2023].KC.rushAtt).toBe(100)   // p2 misattributed to DAL — missing from KC's 2023 total
    expect(psnTotals[2023].KC.rushAtt).toBe(200)   // per-season-team correctly includes p2's 2023 KC production

    const cur = computeHistoricalShares(careerStats, playerMap, curTotals, { attribution: 'current-team' })
    const psn = buildPerSeasonTeamShares(careerStats, psnTotals, playerMap)
    expect(cur.p1[0].share).toBeCloseTo(1.0, 3)   // current-team wrongly gives p1 the whole (undercounted) pie
    expect(psn.p1[0].share).toBeCloseTo(0.5, 3)   // corrected, more accurate denominator
    expect(psn.p1[0].share).not.toBe(cur.p1[0].share)
  })

  // ---------------------------------------------------------------------------
  // Mid-season-trade residual — bounded, documented, never split
  // ---------------------------------------------------------------------------
  it('mid-season-trade: full-season total is attributed to one dominant team (documented residual)', () => {
    const careerStats = {
      2022: {
        Y: { gamesPlayed: 17, team: 'SF', stats: { rush_att: 244 } },
        other: { gamesPlayed: 17, team: 'SF', stats: { rush_att: 56 } },
      },
    }
    const playerMap = { Y: { position: 'RB' }, other: { position: 'RB' } }
    const teamShareTotals = buildTeamShareTotals(careerStats, playerMap)
    const shares = buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)
    // Y's entire 244 attempts attributed to SF — no split for the away-team (CAR) games
    expect(teamShareTotals[2022].SF.rushAtt).toBe(300) // 244+56, all-SF, no CAR bucket
    expect(shares.Y[0].share).toBeCloseTo(244 / 300, 3)
    expect(Number.isFinite(shares.Y[0].share)).toBe(true)
    // Y is absent from any other team's denominator — no CAR key exists at all
    expect(teamShareTotals[2022].CAR).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Absent per-season team → graceful omit, never NaN/0
  // ---------------------------------------------------------------------------
  it('per-season team absent → player omitted from the share series and all denominators (never NaN, never 0)', () => {
    const careerStats = {
      2024: {
        Z: { gamesPlayed: 10, team: null, stats: { rush_att: 100 } },
        other: { gamesPlayed: 10, team: 'KC', stats: { rush_att: 50 } },
      },
    }
    const playerMap = { Z: { position: 'RB' }, other: { position: 'RB' } }
    const teamShareTotals = buildTeamShareTotals(careerStats, playerMap)
    const shares = buildPerSeasonTeamShares(careerStats, teamShareTotals, playerMap)
    expect(shares.Z).toBeUndefined() // omitted entirely — no entry pushed, not 0/NaN
    expect(teamShareTotals[2024].null).toBeUndefined()
    expect(teamShareTotals[2024].KC.rushAtt).toBe(50) // Z contributes to no denominator
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
    const deps = { perSeasonTeamShares: {}, teamShareTotals: {} }
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
          gamesPlayed: 10, fantasyPoints: 100, team: 'KC',
          stats: { rush_att: 0, rush_yd: 0, rec_tgt: 0, rec_air_yd: 0 },
        },
        wr1: {
          gamesPlayed: 10, fantasyPoints: 100, team: 'KC',
          stats: { rec_tgt: 0, rec_air_yd: 0 },
        },
      },
    }
    const teamShareTotals = { 2024: { KC: { rushAtt: 0, rec: 0, recTgt: 0, recAirYd: 0 } } }
    const deps = { perSeasonTeamShares: {}, teamShareTotals }

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
