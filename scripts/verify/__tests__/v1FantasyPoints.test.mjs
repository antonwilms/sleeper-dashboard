import { describe, it, expect } from 'vitest'
import { compareWeeklyPoints, attributeKeys, bucketDiffs } from '../lib/v1FantasyPoints.mjs'

const row = (wp, method = 'exact') => ({ weeklyPoints: wp, weeklyPointsMethod: method })

describe('compareWeeklyPoints', () => {
  it('classifies one row of each class', () => {
    expect(compareWeeklyPoints({ sleeperPts: 10, appRow: row({ 1: 10 }), week: 1 }).class).toBe('match')
    expect(compareWeeklyPoints({ sleeperPts: 10, appRow: row({ 1: 12 }), week: 1 }).class).toBe('diff')
    expect(compareWeeklyPoints({ sleeperPts: 0, appRow: row({ 2: 5 }), week: 1 }).class).toBe('app-missing-zero')
    expect(compareWeeklyPoints({ sleeperPts: 4.2, appRow: row({ 2: 5 }), week: 1 }).class).toBe('app-missing-nonzero')
    expect(compareWeeklyPoints({ sleeperPts: 4.2, appRow: undefined, week: 1 }).class).toBe('app-no-row')
  })
  it('treats |Δ| = 0.01 as a match and 0.02 as a diff', () => {
    expect(compareWeeklyPoints({ sleeperPts: 10, appRow: row({ 1: 10.01 }), week: 1 }).class).toBe('match')
    expect(compareWeeklyPoints({ sleeperPts: 10, appRow: row({ 1: 9.99 }), week: 1 }).class).toBe('match')
    expect(compareWeeklyPoints({ sleeperPts: 10, appRow: row({ 1: 10.02 }), week: 1 }).class).toBe('diff')
  })
  it('reads array-shaped weeklyPoints by week - 1 and reports the method', () => {
    const c = compareWeeklyPoints({ sleeperPts: 7, appRow: row([null, 7], 'scaled'), week: 2 })
    expect(c).toMatchObject({ class: 'match', appPts: 7, method: 'scaled' })
  })
})

describe('attributeKeys', () => {
  const settings = { rec: 0.5, rec_yd: 0.1, rush_td: 6 }
  it('names the stale key with (live − served) × multiplier and a zero residual', () => {
    // served: 4 rec / 40 yd = 6.0 ; live corrected to 5 rec -> 6.5 ; Sleeper matchup 6.5
    const a = attributeKeys({ served: { rec: 4, rec_yd: 40 }, live: { rec: 5, rec_yd: 40 }, settings, sleeperPts: 7, appPts: 6, method: 'exact' })
    expect(a.staleKeys).toEqual([{ key: 'rec', live: 5, served: 4, pts: 0.5 }])
    expect(a.liveScore).toBe(6.5)
    // sleeper 7 vs live 6.5: residual 0.5 -> not a plain dot-product
    expect(a.residual).toBe(0.5)
    expect(a.cause).toBe('scoring-model')
  })
  it('classifies stale-capture when the stale keys explain the gap and the residual is zero', () => {
    const a = attributeKeys({ served: { rec: 4, rec_yd: 40 }, live: { rec: 5, rec_yd: 40 }, settings, sleeperPts: 6.5, appPts: 6, method: 'exact' })
    expect(a.residual).toBe(0)
    expect(a.cause).toBe('stale-capture')
  })
  it('classifies app-branch for a scaled row with no stale keys and unexplained gap', () => {
    const a = attributeKeys({ served: { rec: 4 }, live: { rec: 4 }, settings, sleeperPts: 2, appPts: 3, method: 'scaled' })
    expect(a.residual).toBe(0)
    expect(a.cause).toBe('app-branch')
  })
  it('is unexplained when live stats are absent', () => {
    const a = attributeKeys({ served: {}, live: null, settings, sleeperPts: 3, appPts: null, method: null })
    expect(a).toMatchObject({ cause: 'unexplained', liveMissing: true })
  })
})

describe('bucketDiffs', () => {
  it('puts boundary values in the inclusive-upper-edge bucket', () => {
    expect(bucketDiffs([0.01, 0.1, 0.5, 1, 2, 2.5, -2.5])).toEqual({
      '<=0.01': 1, '<=0.1': 1, '<=0.5': 1, '<=1': 1, '<=2': 1, '>2': 2,
    })
  })
})
