import { describe, it, expect } from 'vitest'
import { buildDynastyGolden } from '../lib/dynastyGolden.mjs'

const row = (gp, fp, team, stats = {}) => ({ gamesPlayed: gp, fantasyPoints: fp, team, gamesStarted: gp, dnpWeeks: 0, stats })
function inputs(currentYear = 2020) {
  return {
    S: 2019, currentYear, scoringSettings: { rec: 1, rec_td: 6 }, depthMap: { a: { depthOrder: 1 } },
    playersMap: {
      a: { position: 'WR', age: 25, years_exp: 4, team: 'BUF' },
      b: { position: 'WR', age: 29, years_exp: 8, team: 'BUF' },
      c: { position: 'RB', age: 24, years_exp: 3, team: 'KC' },
    },
    careerStats: {
      2018: { a: row(16, 200, 'BUF', { rec: 60 }), b: row(16, 180, 'BUF', { rec: 55 }), c: row(15, 150, 'KC', { rush_att: 200 }) },
      2019: { a: row(16, 220, 'BUF', { rec: 70 }), b: row(16, 160, 'BUF', { rec: 50 }), c: row(16, 170, 'KC', { rush_att: 220 }), TEAM_BUF: row(17, 900, 'BUF', { rec: 300 }) },
    },
  }
}

describe('buildDynastyGolden', () => {
  it('is deterministic across two calls', () => {
    const a = buildDynastyGolden(inputs())
    const b = buildDynastyGolden(inputs())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(Object.keys(a.scores['per-season-team'])).toEqual(['a', 'b', 'c'])
  })

  it('restores Date and console.log afterwards, also when a callee throws', () => {
    const RealDate = globalThis.Date
    const log = console.log
    buildDynastyGolden(inputs())
    expect(globalThis.Date).toBe(RealDate)
    expect(console.log).toBe(log)
    const bad = inputs()
    bad.careerStats = null // computeEmpiricalAgeCurves throws on Object.entries(null)
    expect(() => buildDynastyGolden(bad)).toThrow()
    expect(globalThis.Date).toBe(RealDate)
    expect(console.log).toBe(log)
  })

  it('ages curve rows by the injected currentYear', () => {
    const ages = g => g.curves.WR.map(p => p.age)
    const g20 = buildDynastyGolden(inputs(2020))
    const g21 = buildDynastyGolden(inputs(2021))
    // a (age 25) 2018 row at currentYear 2020 is 23; at 2021 it is 22
    expect(ages(g20)).toContain(23)
    expect(ages(g21)).toContain(22)
    expect(Math.min(...ages(g21))).toBe(Math.min(...ages(g20)) - 1)
  })

  it('per-season-team mode ignores the TEAM_ row via the filtered season', () => {
    const g = buildDynastyGolden(inputs())
    expect(g.teamContext['per-season-team'].teamOffense.BUF.rec).toBe(120)
  })
})
