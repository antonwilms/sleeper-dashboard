import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRookieDynastyPriors } from './prospectPrior'
import { computeNextSeasonProjection } from './seasonProjection'
import { defaultCurves, DEFAULT_PEAK_PPG, defaultPPRScoring } from '../__fixtures__/factories.js'

// in-season-evidence-2c-wiring §7.2 — the dynasty prior is invariant to KTC and college; the season projection is not.

describe('buildRookieDynastyPriors', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

  const playersMap = {
    rook: { position: 'RB', age: 22, years_exp: 0, full_name: 'Rook Ie', team: 'IND' },
    ye2: { position: 'RB', age: 24, years_exp: 2, team: 'IND' },
    kick: { position: 'K', age: 24, years_exp: 0, team: 'IND' },
  }
  for (let i = 1; i <= 8; i++) playersMap[`vet${i}`] = { position: 'RB', age: 25, years_exp: 3, team: 'SF' }
  const ktc = (rookValue) => {
    const m = new Map()
    for (let i = 1; i <= 8; i++) m.set(`vet${i}`, { value: 1000 * i + 500, confidence: 'high' })
    m.set('rook', { value: rookValue, confidence: 'high' })
    return m
  }
  const college = (dom) => ({ rook: { peakDominator: dom, seasons: [{ dominator: dom }] } })
  const base = {
    positionBasisScale: { QB: 1, RB: 1, WR: 1, TE: 1 }, playersMap, careerStats: { 2025: {} },
    empiricalCurves: defaultCurves(), positionPeakPPG: DEFAULT_PEAK_PPG,
    scoringSettings: defaultPPRScoring(), currentSeason: 2025, nflDraftYears: [2026],
    nflDraftMatches: { rook: { round: 1, pick: 20, overall: 20 } },
  }
  const prior = (over = {}) => buildRookieDynastyPriors({ playerIds: ['rook'], projectionArgs: { ...base, ...over } }).rook
  const season = (over = {}) => computeNextSeasonProjection({ ...base, playerId: 'rook', ...over }).projectedPPG

  it('the season projection moves with KTC; the dynasty prior does not', () => {
    const lo = { ktcMap: ktc(1200) }
    const hi = { ktcMap: ktc(9500) }
    expect(season(lo)).not.toBe(season(hi))
    expect(prior(lo)).toBe(prior(hi))
  })

  it('the season projection moves with college stats; the dynasty prior does not', () => {
    const lo = { collegeStats: college(10) }
    const hi = { collegeStats: college(35) }
    expect(season(lo)).not.toBe(season(hi))
    expect(prior(lo)).toBe(prior(hi))
  })

  it('is the same pure function with ktcMap and collegeStats null', () => {
    expect(prior({ ktcMap: ktc(9500), collegeStats: college(35) }))
      .toBe(computeNextSeasonProjection({ ...base, playerId: 'rook', ktcMap: null, collegeStats: null }).projectedPPG)
  })

  it('filters to skill positions with years_exp 0 or 1', () => {
    const out = buildRookieDynastyPriors({ playerIds: ['rook', 'ye2', 'kick'], projectionArgs: base })
    expect(Object.keys(out)).toEqual(['rook'])
  })
})
