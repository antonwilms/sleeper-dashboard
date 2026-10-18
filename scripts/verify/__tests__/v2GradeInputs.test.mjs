import { describe, it, expect } from 'vitest'
import { inTolerance, compareTeamTotal, tallyOutRate, eligibleWeeks, refEfficiency, signedDistribution } from '../lib/v2GradeInputs.mjs'

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

describe('tallyOutRate (G3)', () => {
  const rows = [{ out: false }, { out: true }, { out: true, traded: true }, { out: false, traded: true }]
  it('excludes traded rows from the rate', () => {
    expect(tallyOutRate(rows)).toEqual({ compared: 2, out: 1, rate: 0.5 })
  })
})

describe('eligibleWeeks / refEfficiency / distribution', () => {
  it('counts weeks listed ACT/INA/RES on a team that has a REG game that week', () => {
    const weeks = { 1: [['KC', 'ACT']], 2: [['KC', 'RES']], 3: [['KC', 'PUP']], 4: [['KC', 'ACT']], 5: [['LAR', 'ACT']] }
    const tw = { KC: new Set([1, 2, 3]), LA: new Set([5]) }
    expect(eligibleWeeks(weeks, tw, 2024)).toBe(3)   // wk1, wk2, wk5 (LAR→LA); wk3 PUP, wk4 bye
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
