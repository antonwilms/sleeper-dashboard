import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  FPA_POSITIONS, PRIOR_WEIGHT_GAMES, isDefenseRowId,
  computeFpaPerGame, buildFpaTable, rankFpaTable,
} from './opponentStrength'

// Verbatim extract of the data repo's real nfl/season-totals/2025.json — the 32 bare-abbr DEF rows
// only, copied unedited (per the task file's field-existence rule: do not hand-author DEF rows into
// season-totals-2025.json, the app's field-existence-authority fixture; extract verbatim instead).
const REAL_2025_DEF = JSON.parse(readFileSync('src/__fixtures__/season-totals-2025-def.json', 'utf8'))

function makeDefRow({ team, gamesPlayed, qb, rb, wr, te }) {
  return {
    team,
    gamesPlayed,
    stats: {
      fan_pts_allow_qb: qb,
      fan_pts_allow_rb: rb,
      fan_pts_allow_wr: wr,
      fan_pts_allow_te: te,
    },
  }
}

describe('FPA_POSITIONS / PRIOR_WEIGHT_GAMES', () => {
  it('is exactly the four skill positions, no _k / _def', () => {
    expect(FPA_POSITIONS).toEqual(['qb', 'rb', 'wr', 'te'])
  })
  it('PRIOR_WEIGHT_GAMES is a named constant', () => {
    expect(PRIOR_WEIGHT_GAMES).toBe(6)
  })
})

describe('isDefenseRowId', () => {
  it('matches bare 2-3 letter uppercase abbreviations only', () => {
    expect(isDefenseRowId('IND')).toBe(true)
    expect(isDefenseRowId('LA')).toBe(true)
    expect(isDefenseRowId('TEAM_IND')).toBe(false)
    expect(isDefenseRowId('6813')).toBe(false)
    expect(isDefenseRowId('')).toBe(false)
    expect(isDefenseRowId(null)).toBe(false)
    expect(isDefenseRowId(undefined)).toBe(false)
    expect(isDefenseRowId(123)).toBe(false)
  })
})

describe('computeFpaPerGame', () => {
  const careerStats = {
    2025: {
      IND: makeDefRow({ team: 'IND', gamesPlayed: 17, qb: 301.28, rb: 338.9, wr: 614.2, te: 260.4 }),
      BYE: makeDefRow({ team: 'BYE', gamesPlayed: 0, qb: 0, rb: 0, wr: 0, te: 0 }),
      NOSTAT: { team: 'NOSTAT', gamesPlayed: 10, stats: {} },
    },
  }

  it('returns the per-game rate for a normal row', () => {
    expect(computeFpaPerGame(careerStats, 2025, 'IND', 'wr')).toBeCloseTo(614.2 / 17, 5)
  })

  it('gamesPlayed <= 0 returns null explicitly — never fpa/0 (Infinity) or 0*Infinity (NaN)', () => {
    const result = computeFpaPerGame(careerStats, 2025, 'BYE', 'wr')
    expect(result).toBe(null)
    expect(result).not.toBeNaN()
  })

  it('missing stat key returns null, not NaN/undefined arithmetic', () => {
    expect(computeFpaPerGame(careerStats, 2025, 'NOSTAT', 'wr')).toBe(null)
  })

  it('missing row returns null', () => {
    expect(computeFpaPerGame(careerStats, 2025, 'ZZZ', 'wr')).toBe(null)
  })

  it('missing season returns null', () => {
    expect(computeFpaPerGame(careerStats, 2099, 'IND', 'wr')).toBe(null)
  })
})

describe('buildFpaTable — preseason (no current-season file)', () => {
  const careerStats = {
    2025: { KC: makeDefRow({ team: 'KC', gamesPlayed: 17, qb: 300, rb: 350, wr: 500, te: 200 }) },
  }

  it('returns exactly the prior rate for every position — the behaviour Anton specified', () => {
    const table = buildFpaTable(careerStats, { priorSeason: 2025, currentSeason: null })
    expect(table.KC.qb).toBeCloseTo(300 / 17, 10)
    expect(table.KC.rb).toBeCloseTo(350 / 17, 10)
    expect(table.KC.wr).toBeCloseTo(500 / 17, 10)
    expect(table.KC.te).toBeCloseTo(200 / 17, 10)
  })
})

describe('buildFpaTable — mid-season shift', () => {
  // Prior: 20.0/g. Current: 10.0/g. K = PRIOR_WEIGHT_GAMES = 6.
  const careerStats = {
    2024: { KC: makeDefRow({ team: 'KC', gamesPlayed: 17, qb: 340, rb: 0, wr: 0, te: 0 }) }, // 20/g
    2025: {},
  }

  function withCurrentGames(gCur) {
    return {
      2024: careerStats[2024],
      2025: { KC: makeDefRow({ team: 'KC', gamesPlayed: gCur, qb: 10 * gCur, rb: 0, wr: 0, te: 0 }) },
    }
  }

  it('at gCur = K, the result is the midpoint of the two rates', () => {
    const stats = withCurrentGames(PRIOR_WEIGHT_GAMES)
    const table = buildFpaTable(stats, { priorSeason: 2024, currentSeason: 2025 })
    expect(table.KC.qb).toBeCloseTo((10 + 20) / 2, 10)
  })

  it('at gCur = 3K, the result is close to the current rate — proves "slowly adjusting" is real', () => {
    const stats = withCurrentGames(3 * PRIOR_WEIGHT_GAMES)
    const table = buildFpaTable(stats, { priorSeason: 2024, currentSeason: 2025 })
    // (3K*10 + K*20) / 4K = 12.5 — within 3 points of the current rate (10), nowhere near equal to it
    expect(table.KC.qb).toBeCloseTo(12.5, 10)
    expect(Math.abs(table.KC.qb - 10)).toBeLessThan(3)
  })
})

describe('buildFpaTable — degradation', () => {
  it('no prior, current present → current season alone', () => {
    const careerStats = { 2025: { KC: makeDefRow({ team: 'KC', gamesPlayed: 10, qb: 100, rb: 0, wr: 0, te: 0 }) } }
    const table = buildFpaTable(careerStats, { priorSeason: null, currentSeason: 2025 })
    expect(table.KC.qb).toBeCloseTo(10, 10)
  })

  it('neither prior nor current → null, never a league average', () => {
    const table = buildFpaTable({}, { priorSeason: null, currentSeason: null })
    expect(table).toEqual({})
  })

  it('gamesPlayed = 0 in the current season contributes nothing (gCur = 0, the preseason case)', () => {
    const careerStats = {
      2024: { KC: makeDefRow({ team: 'KC', gamesPlayed: 17, qb: 340, rb: 0, wr: 0, te: 0 }) },
      2025: { KC: makeDefRow({ team: 'KC', gamesPlayed: 0, qb: 0, rb: 0, wr: 0, te: 0 }) },
    }
    const table = buildFpaTable(careerStats, { priorSeason: 2024, currentSeason: 2025 })
    expect(table.KC.qb).toBeCloseTo(20, 10)
    expect(table.KC.qb).not.toBeNaN()
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
    const table = { A: { qb: 10, rb: null, wr: null, te: null } }
    const ranks = rankFpaTable(table)
    expect(ranks.A.rb).toBe(null)
    expect('rb' in ranks.A).toBe(true)
  })
})

describe('row taxonomy — TEAM_* and numeric rows excluded from the DEF table', () => {
  const careerStats = {
    2025: {
      IND: REAL_2025_DEF.IND,
      TEAM_IND: { team: 'IND', gamesPlayed: 17, stats: { rush_att: 400 } }, // no fan_pts_allow_* keys
      '6813': { team: 'IND', gamesPlayed: 17, stats: { rec: 50 } }, // a real player row
    },
  }

  it('only the bare-abbr DEF row feeds the table', () => {
    const table = buildFpaTable(careerStats, { priorSeason: 2025, currentSeason: null })
    expect(Object.keys(table)).toEqual(['IND'])
    expect(table.IND.wr).toBeCloseTo(614.2 / 17, 3)
  })
})

describe('the CR-16 domain hop — Rams (LAR DEF row → LA /teams row)', () => {
  it('joins through normalizeTeamForSchedule so the Rams row is never dropped', () => {
    const careerStats = { 2025: { LAR: REAL_2025_DEF.LAR } }
    const table = buildFpaTable(careerStats, { priorSeason: 2025, currentSeason: null })
    expect(table.LAR).toBeUndefined()
    expect(table.LA).toBeDefined()
    expect(table.LA.wr).toBeCloseTo(563.1 / 17, 3)
  })
})

describe('real 2025 data — §1 spread sanity (verbatim extract from the data repo)', () => {
  it('reproduces the verified WR spread (401.2 - 666.3) and the toughest/softest teams', () => {
    const careerStats = { 2025: REAL_2025_DEF }
    const table = buildFpaTable(careerStats, { priorSeason: 2025, currentSeason: null })
    const wrValues = Object.values(table).map(row => row.wr)
    expect(Math.min(...wrValues) * 17).toBeCloseTo(401.2, 0)
    expect(Math.max(...wrValues) * 17).toBeCloseTo(666.3, 0)

    const ranks = rankFpaTable(table)
    expect(ranks.MIN.wr).toBe(1) // toughest — lowest WR points allowed
    expect(ranks.DAL.wr).toBe(32) // softest — highest WR points allowed
  })
})

describe('historical duplicate rows — 2017 OAK/LV (33 rows, one defense)', () => {
  it('dedupes on the row-owned team field, not the key, and yields exactly 32 teams', () => {
    // Mirrors the real 2017 shape verified against the data repo: OAK and LV are both keyed rows
    // with team: "OAK" and identical stats — the same defense counted once, not twice.
    const oakRow = makeDefRow({ team: 'OAK', gamesPlayed: 16, qb: 272.94, rb: 375.4, wr: 464.7, te: 221.3 })
    const careerStats = {
      2017: {
        OAK: oakRow,
        LV: oakRow,
        KC: makeDefRow({ team: 'KC', gamesPlayed: 16, qb: 300, rb: 300, wr: 500, te: 200 }),
      },
    }
    const table = buildFpaTable(careerStats, { priorSeason: 2017, currentSeason: null })
    expect(Object.keys(table).sort()).toEqual(['KC', 'OAK'])
    expect(table.OAK.wr).toBeCloseTo(464.7 / 16, 5)
  })
})
