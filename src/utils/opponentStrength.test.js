import { describe, it, expect } from 'vitest'
import {
  FPA_POSITIONS, PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES,
  defenceLoadPlan, buildDefenceSeasonAllowed, computeFpaPerGame, computeYardsPerGame,
  buildFpaTable, rankFpaTable,
} from './opponentStrength'

// A `teams` map entry (buildDefenceSeasonAllowed's per-defence season totals).
function team({ gp, qb = 0, rb = 0, wr = 0, te = 0, passYd = 0, rushYd = 0 }) {
  return { gp, pts: { qb, rb, wr, te }, passYd, rushYd }
}

describe('FPA_POSITIONS / PRIOR_WEIGHT_GAMES', () => {
  it('is exactly the four skill positions, no _k / _def', () => {
    expect(FPA_POSITIONS).toEqual(['qb', 'rb', 'wr', 'te'])
  })
  it('PRIOR_WEIGHT_GAMES is a named constant', () => {
    expect(PRIOR_WEIGHT_GAMES).toBe(3)
  })
})

describe('defenceLoadPlan', () => {
  it('no dataSeason -> no plan', () => {
    expect(defenceLoadPlan({ dataSeason: null, nflState: { season: '2026', season_type: 'regular', week: 4 } })).toEqual([])
  })
  it('regular season week 4 -> prior in full plus the live season through week 3', () => {
    expect(defenceLoadPlan({ dataSeason: 2025, nflState: { season: '2026', season_type: 'regular', week: 4 } })).toEqual([
      { season: 2025, throughWeek: 18, currentNflWeek: 0 },
      { season: 2026, throughWeek: 3, currentNflWeek: 4 },
    ])
  })
  it('regular season week 1 -> prior only (no completed live week)', () => {
    expect(defenceLoadPlan({ dataSeason: 2025, nflState: { season: '2026', season_type: 'regular', week: 1 } }))
      .toEqual([{ season: 2025, throughWeek: 18, currentNflWeek: 0 }])
  })
  it('pre / off -> prior only', () => {
    for (const season_type of ['pre', 'off']) {
      expect(defenceLoadPlan({ dataSeason: 2025, nflState: { season: '2026', season_type, week: 3 } }))
        .toEqual([{ season: 2025, throughWeek: 18, currentNflWeek: 0 }])
    }
  })
  it('post -> the live season in full, currentNflWeek 0', () => {
    expect(defenceLoadPlan({ dataSeason: 2025, nflState: { season: '2026', season_type: 'post', week: 2 } })).toEqual([
      { season: 2025, throughWeek: 18, currentNflWeek: 0 },
      { season: 2026, throughWeek: 18, currentNflWeek: 0 },
    ])
  })
  it('live season not after dataSeason -> prior only', () => {
    expect(defenceLoadPlan({ dataSeason: 2025, nflState: { season: '2025', season_type: 'regular', week: 9 } }))
      .toEqual([{ season: 2025, throughWeek: 18, currentNflWeek: 0 }])
  })
  it('a 2020 prior season has 17 weeks', () => {
    expect(defenceLoadPlan({ dataSeason: 2020, nflState: null })).toEqual([{ season: 2020, throughWeek: 17, currentNflWeek: 0 }])
  })
})

describe('buildDefenceSeasonAllowed', () => {
  const playerMap = { qb1: { position: 'QB' }, te1: { position: 'TE' }, k1: { position: 'K' } }
  const scoring = { pass_yd: 0.04, pass_td: 5 }

  function result(weeks) {
    return { year: 2025, weeks, failedWeeks: [], complete: true }
  }

  it('null for a null or incomplete loader result', () => {
    expect(buildDefenceSeasonAllowed(null, { playerMap, scoringSettings: scoring })).toBe(null)
    expect(buildDefenceSeasonAllowed({ ...result([]), complete: false }, { playerMap, scoringSettings: scoring })).toBe(null)
  })

  it('credits a Sleeper-domain opponent (LAR) to the era key LA — the CR-16 hop', () => {
    const wk = { week: 1, rows: {
      TEAM_KC: { opponent: 'LAR', stats: { pass_yd: 200, rush_yd: 100 } },
      qb1: { opponent: 'LAR', stats: { pass_yd: 300, pass_td: 2 } },
    } }
    const out = buildDefenceSeasonAllowed(result([wk]), { playerMap, scoringSettings: scoring })
    expect(out.teams.LA).toBeDefined()
    expect(out.teams.LAR).toBeUndefined()
    expect(out.teams.LA.gp).toBe(1)
  })

  it('scores a QB row in the league scoring: 300 pass_yd x 0.04 + 2 pass_td x 5 = 22', () => {
    const wk = { week: 1, rows: {
      TEAM_KC: { opponent: 'DEN', stats: {} },
      qb1: { opponent: 'DEN', stats: { pass_yd: 300, pass_td: 2 } },
    } }
    const out = buildDefenceSeasonAllowed(result([wk]), { playerMap, scoringSettings: scoring })
    expect(out.teams.DEN.pts.qb).toBeCloseTo(22, 10)
  })

  it('a row whose playerMap position is K, or that is absent from playerMap, adds nothing', () => {
    const wk = { week: 1, rows: {
      TEAM_KC: { opponent: 'DEN', stats: {} },
      k1: { opponent: 'DEN', stats: { pass_yd: 300 } },
      ghost: { opponent: 'DEN', stats: { pass_yd: 300 } },
    } }
    const out = buildDefenceSeasonAllowed(result([wk]), { playerMap, scoringSettings: scoring })
    expect(out.teams.DEN.pts).toEqual({ qb: 0, rb: 0, wr: 0, te: 0 })
  })

  it('pass yards are net of sack yards; rush yards add; pass + rush is total', () => {
    const wk = { week: 1, rows: { TEAM_KC: { opponent: 'DEN', stats: { pass_yd: 250, pass_sack_yds: 20, rush_yd: 90 } } } }
    const out = buildDefenceSeasonAllowed(result([wk]), { playerMap, scoringSettings: scoring })
    expect(out.teams.DEN.passYd).toBe(230)
    expect(out.teams.DEN.rushYd).toBe(90)
  })

  it('gp counts weeks named by a TEAM_ row, not player rows; a player-only defence is dropped', () => {
    const w1 = { week: 1, rows: { TEAM_KC: { opponent: 'DEN', stats: {} }, qb1: { opponent: 'DEN', stats: { pass_yd: 100 } } } }
    const w2 = { week: 2, rows: { qb1: { opponent: 'DEN', stats: { pass_yd: 100 } }, te1: { opponent: 'NYJ', stats: { rec: 4 } } } }
    const w3 = { week: 3, rows: { TEAM_KC: { opponent: 'DEN', stats: {} } } }
    const out = buildDefenceSeasonAllowed(result([w1, w2, w3]), { playerMap, scoringSettings: scoring })
    expect(out.teams.DEN.gp).toBe(2)
    expect(out.teams.NYJ).toBeUndefined()
    expect(out.weeks).toEqual([1, 2, 3])
  })

  it('a defence that faced no TE has pts.te === 0, and computeFpaPerGame returns 0, not null', () => {
    const wk = { week: 1, rows: { TEAM_KC: { opponent: 'DEN', stats: {} }, qb1: { opponent: 'DEN', stats: { pass_yd: 100 } } } }
    const out = buildDefenceSeasonAllowed(result([wk]), { playerMap, scoringSettings: scoring })
    expect(out.teams.DEN.pts.te).toBe(0)
    expect(computeFpaPerGame(out.teams, 'DEN', 'te')).toBe(0)
  })
})

describe('computeFpaPerGame / computeYardsPerGame', () => {
  const allowed = { IND: team({ gp: 17, wr: 340, passYd: 3400, rushYd: 1700 }), BYE: team({ gp: 0, wr: 5 }) }

  it('per-game points and yards for a normal team', () => {
    expect(computeFpaPerGame(allowed, 'IND', 'wr')).toBeCloseTo(20, 10)
    expect(computeYardsPerGame(allowed, 'IND')).toEqual({ pass: 200, rush: 100 })
  })
  it('null for a null map, an absent team, or gp 0 — never pts/0', () => {
    for (const fn of [
      (a, t) => computeFpaPerGame(a, t, 'wr'),
      (a, t) => computeYardsPerGame(a, t),
    ]) {
      expect(fn(null, 'IND')).toBe(null)
      expect(fn(allowed, 'ZZZ')).toBe(null)
      expect(fn(allowed, 'BYE')).toBe(null)
    }
    expect(computeFpaPerGame(allowed, 'BYE', 'wr')).not.toBeNaN()
  })
})

describe('buildFpaTable — preseason (no live season)', () => {
  const prior = { KC: team({ gp: 17, qb: 300, rb: 350, wr: 500, te: 200 }) }

  it('returns exactly the prior rate for every position', () => {
    const table = buildFpaTable({ prior, current: null })
    expect(table.KC.qb).toBeCloseTo(300 / 17, 10)
    expect(table.KC.rb).toBeCloseTo(350 / 17, 10)
    expect(table.KC.wr).toBeCloseTo(500 / 17, 10)
    expect(table.KC.te).toBeCloseTo(200 / 17, 10)
  })

  it('weights are all 0 when no current map is present', () => {
    expect(buildFpaTable({ prior, current: null }).KC.weights).toEqual({ qb: 0, rb: 0, wr: 0, te: 0 })
  })
})

describe('buildFpaTable — mid-season shift', () => {
  const prior = { KC: team({ gp: 17, qb: 340 }) } // 20/g
  const current = (gCur) => ({ KC: team({ gp: gCur, qb: 10 * gCur }) }) // 10/g

  it('at gCur = K, the result is the midpoint of the two rates', () => {
    const table = buildFpaTable({ prior, current: current(PRIOR_WEIGHT_GAMES) })
    expect(table.KC.qb).toBeCloseTo((10 + 20) / 2, 10)
    expect(table.KC.weights.qb).toBe(PRIOR_WEIGHT_GAMES)
  })

  it('at gCur = 3K = FPA_PRIOR_DROP_GAMES, the prior is dropped entirely, not merely outweighed', () => {
    expect(3 * PRIOR_WEIGHT_GAMES).toBe(FPA_PRIOR_DROP_GAMES)
    expect(buildFpaTable({ prior, current: current(FPA_PRIOR_DROP_GAMES) }).KC.qb).toBe(10)
  })
})

describe('buildFpaTable — prior dropped at FPA_PRIOR_DROP_GAMES', () => {
  const current = (gCur) => ({ KC: team({ gp: gCur, qb: 10 * gCur }) })
  const prior20 = { KC: team({ gp: 17, qb: 340 }) } // 20/g

  it('below the threshold (gCur = 8), the prior is still present', () => {
    const table = buildFpaTable({ prior: prior20, current: current(8) })
    expect(table.KC.qb).toBeCloseTo((8 * 10 + PRIOR_WEIGHT_GAMES * 20) / (8 + PRIOR_WEIGHT_GAMES), 10)
  })

  it('at the threshold (gCur = 9), the result is exactly the current rate regardless of the prior value', () => {
    expect(buildFpaTable({ prior: prior20, current: current(FPA_PRIOR_DROP_GAMES) }).KC.qb).toBe(10)
    const otherPrior = { KC: team({ gp: 17, qb: 1 }) }
    expect(buildFpaTable({ prior: otherPrior, current: current(FPA_PRIOR_DROP_GAMES) }).KC.qb).toBe(10)
  })

  it('at the threshold with no prior at all, still resolves to the current rate', () => {
    expect(buildFpaTable({ prior: null, current: current(FPA_PRIOR_DROP_GAMES) }).KC.qb).toBe(10)
  })

  it('weights.qb still reports the raw gCur (9) — the sibling-key contract', () => {
    expect(buildFpaTable({ prior: prior20, current: current(FPA_PRIOR_DROP_GAMES) }).KC.weights.qb).toBe(9)
  })
})

describe('buildFpaTable — degradation', () => {
  it('no prior, current present -> current season alone', () => {
    const table = buildFpaTable({ prior: null, current: { KC: team({ gp: 10, qb: 100 }) } })
    expect(table.KC.qb).toBeCloseTo(10, 10)
    expect(table.KC.weights.qb).toBe(10)
  })

  it('neither prior nor current -> empty table, never a league average', () => {
    expect(buildFpaTable({ prior: null, current: null })).toEqual({})
    expect(buildFpaTable()).toEqual({})
  })

  it('gp = 0 in the current season contributes nothing (gCur = 0)', () => {
    const table = buildFpaTable({ prior: { KC: team({ gp: 17, qb: 340 }) }, current: { KC: team({ gp: 0 }) } })
    expect(table.KC.qb).toBeCloseTo(20, 10)
    expect(table.KC.qb).not.toBeNaN()
    expect(table.KC.weights.qb).toBe(0)
  })

  it('the team set is the union of both maps', () => {
    const table = buildFpaTable({ prior: { KC: team({ gp: 17, qb: 340 }) }, current: { DEN: team({ gp: 2, qb: 20 }) } })
    expect(Object.keys(table).sort()).toEqual(['DEN', 'KC'])
    expect(table.DEN.weights.qb).toBe(2)
  })
})

describe('rankFpaTable', () => {
  it('lowest per-game allowed ranks 1 (toughest defense)', () => {
    const table = {
      TOUGH: { qb: 10, rb: null, wr: null, te: null },
      MID: { qb: 20, rb: null, wr: null, te: null },
      SOFT: { qb: 30, rb: null, wr: null, te: null },
    }
    const ranks = rankFpaTable(table)
    expect(ranks.TOUGH.qb).toBe(1)
    expect(ranks.MID.qb).toBe(2)
    expect(ranks.SOFT.qb).toBe(3)
  })

  it('a team with no resolved value for a position gets a null rank, not omission', () => {
    const ranks = rankFpaTable({ A: { qb: 10, rb: null, wr: null, te: null } })
    expect(ranks.A.rb).toBe(null)
    expect('rb' in ranks.A).toBe(true)
  })
})

describe('league scoring is what ranks', () => {
  // Two defences, same rows. Sleeper's own `pts_ppr` (AAA 15, BBB 12) would rank BBB tougher; this
  // league's scoring (no reception points) ranks AAA tougher (5 vs 10).
  const playerMap = { wrA: { position: 'WR' }, wrB: { position: 'WR' } }
  const rows = {
    TEAM_X: { opponent: 'AAA', stats: {} },
    TEAM_Y: { opponent: 'BBB', stats: {} },
    wrA: { opponent: 'AAA', stats: { rec: 10, rec_yd: 50, pts_ppr: 15 } },  // PPR 15, standard 5
    wrB: { opponent: 'BBB', stats: { rec: 2, rec_yd: 100, pts_ppr: 12 } },  // PPR 12, standard 10
  }
  const loader = { year: 2025, weeks: [{ week: 1, rows }], failedWeeks: [], complete: true }

  it('rankFpaTable over buildFpaTable follows the league-scored order, not pts_ppr', () => {
    const league = { rec: 0, rec_yd: 0.1 }
    const out = buildDefenceSeasonAllowed(loader, { playerMap, scoringSettings: league })
    const ranks = rankFpaTable(buildFpaTable({ prior: out.teams, current: null }))
    expect(out.teams.AAA.pts.wr).toBeCloseTo(5, 10)
    expect(out.teams.BBB.pts.wr).toBeCloseTo(10, 10)
    expect(ranks.AAA.wr).toBe(1)
    expect(ranks.BBB.wr).toBe(2)
    // Same rows under a full-PPR league rank the other way round — the order is the settings'.
    const ppr = buildDefenceSeasonAllowed(loader, { playerMap, scoringSettings: { rec: 1, rec_yd: 0.1 } })
    const pprRanks = rankFpaTable(buildFpaTable({ prior: ppr.teams, current: null }))
    expect(pprRanks.BBB.wr).toBe(1)
    expect(pprRanks.AAA.wr).toBe(2)
  })
})
