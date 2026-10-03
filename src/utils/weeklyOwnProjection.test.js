import { describe, it, expect } from 'vitest'
import {
  buildImpliedTotals, vegasFactor, buildOwnProjections,
  MIN_VEGAS_BASELINE_WEEKS, VEGAS_WEIGHT,
} from './weeklyOwnProjection'

const game = (week, homeTeam, awayTeam, spreadLine, totalLine, extra = {}) => (
  { week, gameType: 'REG', homeTeam, awayTeam, spreadLine, totalLine, ...extra }
)

describe('buildImpliedTotals', () => {
  it('null schedule -> null', () => {
    expect(buildImpliedTotals(null)).toBeNull()
  })

  it('home favoured: spread 9.5, total 47.5 -> home 28.5, away 19.0', () => {
    const idx = buildImpliedTotals({ games: [game(5, 'DAL', 'TB', 9.5, 47.5)] })
    expect(idx.get(5).get('DAL')).toBeCloseTo(28.5, 9)
    expect(idx.get(5).get('TB')).toBeCloseTo(19.0, 9)
  })

  it('negative spread -> the away team is favoured', () => {
    const idx = buildImpliedTotals({ games: [game(2, 'NYG', 'DAL', -7, 44)] })
    expect(idx.get(2).get('DAL')).toBeCloseTo(25.5, 9)
    expect(idx.get(2).get('NYG')).toBeCloseTo(18.5, 9)
  })

  it('skips a game with a null spreadLine or totalLine, and non-REG games', () => {
    const idx = buildImpliedTotals({ games: [
      game(1, 'A', 'B', null, 44), game(1, 'C', 'D', 3, null),
      game(1, 'E', 'F', 3, 44, { gameType: 'POST' }),
    ] })
    expect(idx.size).toBe(0)
  })

  it('a LAR home game lands under LA (schedule-domain alias)', () => {
    const idx = buildImpliedTotals({ games: [game(3, 'LAR', 'SEA', 3, 46)] })
    expect(idx.get(3).has('LA')).toBe(true)
    expect(idx.get(3).has('LAR')).toBe(false)
  })
})

describe('vegasFactor', () => {
  // KC: weeks 1, 2 = 24; week 3 (the current week) = 27; week 4 = 40 must not count.
  const idx = () => buildImpliedTotals({ games: [
    game(1, 'KC', 'A', 0, 48), game(2, 'B', 'KC', 0, 48), game(3, 'KC', 'C', 6, 48), game(4, 'KC', 'D', 0, 80),
  ] })

  it('averages only earlier weeks and applies half the percentage swing', () => {
    const v = vegasFactor(idx(), 'KC', 3)
    expect(VEGAS_WEIGHT).toBe(0.5)
    expect(v.implied).toBe(27)
    expect(v.baselineWeeks).toBe(2)
    expect(v.baseline).toBe(24)
    expect(v.factor).toBeCloseTo(1.0625, 9)
    expect(v.minBaselineWeeks).toBe(MIN_VEGAS_BASELINE_WEEKS)
  })

  it('fewer than the minimum earlier weeks -> factor null, implied still set', () => {
    const v = vegasFactor(idx(), 'KC', 2)
    expect(v.implied).toBe(24)
    expect(v.baselineWeeks).toBe(1)
    expect(v.baseline).toBeNull()
    expect(v.factor).toBeNull()
    expect(v.minBaselineWeeks).toBe(MIN_VEGAS_BASELINE_WEEKS)
  })

  it('Sleeper LAR finds the LA entry', () => {
    const i = buildImpliedTotals({ games: [
      game(1, 'LAR', 'A', 0, 40), game(2, 'LAR', 'B', 0, 40), game(3, 'LAR', 'C', 0, 40),
    ] })
    expect(vegasFactor(i, 'LAR', 3).factor).toBeCloseTo(1, 9)
  })

  it("'FA', null team, null index and no line this week -> null", () => {
    expect(vegasFactor(idx(), 'FA', 3)).toBeNull()
    expect(vegasFactor(idx(), null, 3)).toBeNull()
    expect(vegasFactor(null, 'KC', 3)).toBeNull()
    expect(vegasFactor(idx(), 'KC', 9)).toBeNull()
    expect(vegasFactor(idx(), 'ZZZ', 3)).toBeNull()
  })
})

describe('buildOwnProjections', () => {
  const indexFor = () => buildImpliedTotals({ games: [
    game(1, 'KC', 'A', 0, 48), game(2, 'B', 'KC', 0, 48), game(3, 'KC', 'C', 6, 48),
  ] })
  const run = (rows, extra = {}) => buildOwnProjections({
    rows, seasonProjections: { p1: { projectedPPG: 14.2, inSeason: {} } },
    impliedIndex: indexFor(), currentWeek: 3, playerMap: {}, ...extra,
  })
  const r = (over = {}) => ({ player_id: 'p1', team: 'KC', bye: false, ...over })

  it('value = base x factor, with baseKind ros iff the projection carries inSeason', () => {
    const own = run([r()]).p1
    expect(own.reason).toBeNull()
    expect(own.value).toBeCloseTo(14.2 * 1.0625, 9)
    expect(own.base).toBe(14.2)
    expect(own.baseKind).toBe('ros')
    const season = run([r()], { seasonProjections: { p1: { projectedPPG: 14.2 } } }).p1
    expect(season.baseKind).toBe('season')
  })

  it('each reason fires, with its inputs retained', () => {
    expect(run([r({ bye: true })]).p1).toMatchObject({ reason: 'bye', value: null, vegas: null })
    const out = run([r()], { playerMap: { p1: { injury_status: 'IR' } } }).p1
    expect(out).toMatchObject({ reason: 'out', value: null, status: 'IR', base: 14.2 })
    expect(out.vegas.implied).toBe(27)
    expect(run([r()], { seasonProjections: {} }).p1).toMatchObject({ reason: 'no-base', base: null })
    expect(run([r()], { currentWeek: 9 }).p1).toMatchObject({ reason: 'no-line', vegas: null, base: 14.2 })
    const nb = run([r()], { currentWeek: 2 }).p1
    expect(nb.reason).toBe('no-baseline')
    expect(nb.base).toBe(14.2)
    expect(nb.vegas.implied).toBe(24)
    expect(nb.value).toBeNull()
  })

  it('precedence: a bye row whose player is Out is bye; an Out player with no line is out', () => {
    const pm = { p1: { injury_status: 'Out' } }
    expect(run([r({ bye: true })], { playerMap: pm }).p1.reason).toBe('bye')
    expect(run([r()], { playerMap: pm, currentWeek: 9 }).p1.reason).toBe('out')
  })

  it.each(['Out', 'IR', 'PUP', 'Sus', 'DNR'])('%s is blanked as out', status => {
    expect(run([r()], { playerMap: { p1: { injury_status: status } } }).p1.reason).toBe('out')
  })

  it('Questionable and Doubtful are valued normally', () => {
    expect(run([r()], { playerMap: { p1: { injury_status: 'Questionable' } } }).p1.value).toBeCloseTo(14.2 * 1.0625, 9)
    expect(run([r()], { playerMap: { p1: { injury_status: 'Doubtful' } } }).p1.reason).toBeNull()
  })

  it('skips player_id null rows and never mutates frozen inputs', () => {
    const rows = Object.freeze([Object.freeze(r()), Object.freeze(r({ player_id: null }))])
    const proj = Object.freeze({ p1: Object.freeze({ projectedPPG: 14.2, inSeason: Object.freeze({}) }) })
    const out = buildOwnProjections({
      rows, seasonProjections: proj, impliedIndex: indexFor(), currentWeek: 3, playerMap: Object.freeze({}),
    })
    expect(Object.keys(out)).toEqual(['p1'])
    expect(proj.p1.projectedPPG).toBe(14.2)
  })
})
