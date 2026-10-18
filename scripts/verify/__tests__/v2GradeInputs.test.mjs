import { describe, it, expect } from 'vitest'
import { inTolerance, compareTeamTotal, eligibleWeeks, refEfficiency, signedDistribution, runV2, summarizeV2 } from '../lib/v2GradeInputs.mjs'

describe('inTolerance boundaries', () => {
  it('abs: ±1 passes, 1.01 out', () => {
    expect(inTolerance({ kind: 'abs', value: 1 }, 11, 10)).toBe(true)
    expect(inTolerance({ kind: 'abs', value: 1 }, 11.01, 10)).toBe(false)
  })
  it('yards: max(5, 1% of ref)', () => {
    expect(inTolerance({ kind: 'yards' }, 105, 100)).toBe(true)
    expect(inTolerance({ kind: 'yards' }, 106, 100)).toBe(false)
    expect(inTolerance({ kind: 'yards' }, 1500 + 15, 1500)).toBe(true)
    expect(inTolerance({ kind: 'yards' }, 1500 + 16, 1500)).toBe(false)
  })
  it('exact', () => {
    expect(inTolerance({ kind: 'exact' }, 4, 4)).toBe(true)
    expect(inTolerance({ kind: 'exact' }, 5, 4)).toBe(false)
  })
  it('rel 1%', () => {
    expect(inTolerance({ kind: 'rel', value: 0.01 }, 1010, 1000)).toBe(true)
    expect(inTolerance({ kind: 'rel', value: 0.01 }, 1011, 1000)).toBe(false)
  })
  it('efficiency tolerances at the edge', () => {
    expect(inTolerance({ kind: 'abs', value: 0.05 }, 4.55, 4.5)).toBe(true)
    expect(inTolerance({ kind: 'abs', value: 0.05 }, 4.56, 4.5)).toBe(false)
    expect(inTolerance({ kind: 'abs', value: 0.005 }, 0.655, 0.65)).toBe(true)
    expect(inTolerance({ kind: 'abs', value: 0.003 }, 0.054, 0.05)).toBe(false)
    expect(inTolerance({ kind: 'abs', value: 0.5 }, 90.5, 90)).toBe(true)
  })
})

describe('compareTeamTotal', () => {
  it('flags doubling ratios in [1.9, 2.1]', () => {
    expect(compareTeamTotal(2000, 1000)).toMatchObject({ out: true, doubling: true })
    expect(compareTeamTotal(1900, 1000).doubling).toBe(true)
    expect(compareTeamTotal(2100, 1000).doubling).toBe(true)
    expect(compareTeamTotal(1850, 1000)).toMatchObject({ out: true, doubling: false })
    expect(compareTeamTotal(2150, 1000).doubling).toBe(false)
  })
  it('within 1% is not out', () => {
    expect(compareTeamTotal(1005, 1000)).toMatchObject({ out: false, doubling: false })
  })
})

// Minimal fixture: KC + BUF, one WR (w1) traded KC→BUF whose season row sits on KC, two KC WR teammates.
// Gamelog targets: w1 10 (KC) + 30 (BUF) = 40, w2 30, w3 20. The app's w3 row is 1 target high (21).
function fixtureCtx() {
  const game = (week, team, targets, receptions) => ({ week, seasonType: 'REG', team, targets, receptions })
  const row = (recTgt, rec) => ({ gamesPlayed: 17, team: 'KC', stats: { rec_tgt: recTgt, rec } })
  return {
    seasons: [2024],
    playersMap: { w1: { position: 'WR', team: 'KC' }, w2: { position: 'WR', team: 'KC' }, w3: { position: 'WR', team: 'KC' } },
    careerStats: { 2024: { w1: row(40, 28), w2: row(30, 24), w3: row(21, 16) } },
    gamelogs: { 2024: { unmapped: 0, players: {
      w1: { games: [game(1, 'KC', 10, 8), game(2, 'BUF', 30, 20)] },
      w2: { games: [game(1, 'KC', 30, 24)] },
      w3: { games: [game(1, 'KC', 20, 16)] },
    } } },
    teamcontext: { 2024: { teams: {} } }, snaps: { 2024: { players: {} } }, rosterweekly: { 2024: { players: {} } },
  }
}

describe('runV2 V2.6 on ex-traded denominators', () => {
  const res = runV2(fixtureCtx())
  const v26 = res.outOfTolerance.filter(r => r.check === 'V2.6')
  it('lists the traded WR and keeps him out of every V2.6 row', () => {
    expect(res.traded.some(t => t.check === 'V2.6' && t.pid === 'w1' && t.season === 2024)).toBe(true)
    expect(v26.some(r => r.pid === 'w1')).toBe(false)
    expect(res.series['V2.6|wrTeShare'].bySeason[2024]).toEqual({ compared: 2, out: 2 })
  })
  it('compares teammates on ex-traded denominators (hand-computed shares)', () => {
    // app: 30/(30+21) = 0.588, 21/51 = 0.412; reference: 30/50 = 0.6, 20/50 = 0.4
    const by = Object.fromEntries(v26.map(r => [r.pid, r]))
    expect(by.w2.app).toBe(0.588); expect(by.w2.ref).toBe(0.6)
    expect(by.w3.app).toBe(0.412); expect(by.w3.ref).toBe(0.4)
  })
  it('measures the G3 effect separately: as-run share minus ex-traded share', () => {
    // as-run KC denominator 40 + 30 + 21 = 91 → 0.33 and 0.231
    const b = res.series['V2.6-g3effect|share'].bySeason[2024]
    expect(b.compared).toBe(2)
    expect(b.maxAbs).toBeCloseTo(0.258, 6)
    expect(b.sumAbs / b.compared).toBeCloseTo((0.258 + 0.181) / 2, 6)
  })
})

describe('summarizeV2 verdicts are mechanical', () => {
  const info = { doubling: [], unexplainedLarge: {}, rz: {} }
  const ser = (check, out, compared = 1000, metric = 'm') => ({ [`${check}|${metric}`]: { check, metric, bySeason: { 2024: { compared, out } } } })
  it('2.0% passes, 2.1% is a defect', () => {
    expect(summarizeV2(ser('V2.6', 20), info)['V2.6'].verdict).toBe('pass')
    expect(summarizeV2(ser('V2.6', 21), info)['V2.6'].verdict).toBe('defect')
  })
  it('a non-empty doubling list forces V2.4 to defect', () => {
    expect(summarizeV2(ser('V2.4', 0), { ...info, doubling: [{ team: 'KC' }] })['V2.4'].verdict).toBe('defect')
  })
  it('V2.10 with over1 teams is a gap', () => {
    expect(summarizeV2(ser('V2.10', 0), { ...info, rz: { 2024: { over1: ['KC'] } } })['V2.10'].verdict).toBe('gap')
  })
  it('a *-effect series never changes a verdict', () => {
    const series = { ...ser('V2.6', 0), ...ser('V2.6-g3effect', 900, 1000, 'share') }
    const out = summarizeV2(series, info)
    expect(out['V2.6'].verdict).toBe('pass')
    expect(out['V2.6-g3effect']).toBeUndefined()
  })
})

describe('eligibleWeeks / refEfficiency / distribution', () => {
  it('counts weeks listed ACT/INA/RES on a team that has a REG game that week', () => {
    const weeks = { 1: [['KC', 'ACT']], 2: [['KC', 'RES']], 3: [['KC', 'CUT']], 4: [['KC', 'ACT']], 5: [['LAR', 'ACT']] }
    const tw = { KC: new Set([1, 2, 3]), LA: new Set([5]) }
    expect(eligibleWeeks(weeks, tw, 2024)).toBe(3)   // wk1, wk2, wk5 (LAR→LA); wk3 CUT, wk4 bye
  })
  it('counts a PUP week and does not count a DEV week', () => {
    const tw = { KC: new Set([1, 2]) }
    expect(eligibleWeeks({ 1: [['KC', 'PUP']] }, tw, 2024)).toBe(1)
    expect(eligibleWeeks({ 1: [['KC', 'DEV']], 2: [['KC', 'PUP']] }, tw, 2024)).toBe(1)
  })
  it('refEfficiency uses summed components and rounds to 3dp', () => {
    const r = refEfficiency('RB', { carries: 300, rushingYards: 1234, rushingTds: 7 })
    expect(r).toEqual({ ypc: 4.113, rushTdRate: 0.023 })
    expect(refEfficiency('WR', { targets: 0, receptions: 0 }).ypt).toBeNull()
  })
  it('signedDistribution counts signs', () => {
    expect(signedDistribution([-2, 0, 0, 3])).toMatchObject({ n: 4, neg: 1, zero: 2, pos: 1, min: -2, max: 3 })
  })
})
