import { describe, it, expect } from 'vitest'
import {
  buildImpliedTotals, vegasFactor, buildOwnProjections, buildQbStartersByTeam,
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

describe('buildQbStartersByTeam', () => {
  const qb = (team, order, injury_status = null) => ({ position: 'QB', team, depth_chart_order: order, injury_status })

  it('picks the lowest order not listed out; Doubtful still starts', () => {
    expect(buildQbStartersByTeam({ a: qb('KC', 1), b: qb('KC', 2) }).get('KC')).toBe('a')
    expect(buildQbStartersByTeam({ a: qb('KC', 1, 'Out'), b: qb('KC', 2) }).get('KC')).toBe('b')
    expect(buildQbStartersByTeam({ a: qb('KC', 1, 'IR'), b: qb('KC', 2, 'Out'), c: qb('KC', 3) }).get('KC')).toBe('c')
    expect(buildQbStartersByTeam({ a: qb('KC', 1, 'Doubtful'), b: qb('KC', 2) }).get('KC')).toBe('a')
  })

  it('ties go to the smaller id; null order, FA/null team and non-QBs are ignored; empty teams are absent', () => {
    expect(buildQbStartersByTeam({ b: qb('KC', 1), a: qb('KC', 1) }).get('KC')).toBe('a')
    const m = buildQbStartersByTeam({
      a: qb('KC', null), b: qb('FA', 1), c: qb(null, 1), d: { position: 'RB', team: 'KC', depth_chart_order: 1 },
      e: qb('DEN', 1, 'Out'), f: qb('DEN', null),
    })
    expect(m.size).toBe(0)
  })

  it('handles a missing map', () => {
    expect(buildQbStartersByTeam(undefined).size).toBe(0)
  })
})

describe('buildOwnProjections — QB role (P10)', () => {
  const index = buildImpliedTotals({ games: [
    game(1, 'KC', 'A', 0, 48), game(2, 'B', 'KC', 0, 48), game(3, 'KC', 'C', 6, 48),
  ] })
  const F = 1.0625
  const qb = (team, order, injury_status = null) => ({ position: 'QB', team, depth_chart_order: order, injury_status })
  const run = (seasonProjections, playerMap, rows = [{ player_id: 'p1', team: 'KC', bye: false }]) =>
    buildOwnProjections({ rows, seasonProjections, impliedIndex: index, currentWeek: 3, playerMap })
  const chain = { qbStarterPPG: 13.0, qbTakeoverBasis: 'chain', qbStartShare: 0.1558 }
  const promoted = { p1: qb('KC', 2), p2: qb('KC', 1, 'Out') }

  it('the Mariota case: in-season start record -> starterValue, not the preseason factor', () => {
    const own = run({ p1: { projectedPPG: 4.9, inSeason: { start: { starterValue: 14.3, fraction: 0.34 } },
      factors: { ...chain, qbStartShare: 0.16 } } }, promoted).p1
    expect(own).toMatchObject({ qbRole: 'starter', base: 14.3, share: 0.34, baseKind: 'ros', reason: null })
    expect(own.value).toBeCloseTo(14.3 * F, 9)
  })

  it('preseason chain row without inSeason -> factors.qbStarterPPG', () => {
    const own = run({ p1: { projectedPPG: 2.1, factors: chain } }, promoted).p1
    expect(own).toMatchObject({ base: 13.0, share: 0.1558, baseKind: 'season', qbRole: 'starter' })
  })

  it('inSeason without start keeps projectedPPG, no share', () => {
    const own = run({ p1: { projectedPPG: 15.5, inSeason: {}, factors: chain } }, promoted).p1
    expect(own).toMatchObject({ base: 15.5, share: null, baseKind: 'ros' })
  })

  it('a normal incumbent starter is unchanged', () => {
    const own = run({ p1: { projectedPPG: 18, factors: { qbTakeoverBasis: 'incumbent', qbStarterPPG: 18 } } },
      { p1: qb('KC', 1) }).p1
    expect(own).toMatchObject({ qbRole: 'starter', share: null, base: 18, reason: null })
    expect(own.value).toBeCloseTo(18 * F, 9)
  })

  it('a backup behind a healthy starter is qb-backup with the implied total kept; no listed QBs is qb-no-role', () => {
    const sp = { p1: { projectedPPG: 4, factors: chain } }
    const b = run(sp, { p1: qb('KC', 2), p2: qb('KC', 1) }).p1
    expect(b).toMatchObject({ reason: 'qb-backup', value: null, qbRole: 'backup' })
    expect(b.vegas.implied).toBe(27)
    expect(run(sp, { p1: qb('KC', null) }).p1).toMatchObject({ reason: 'qb-no-role', qbRole: 'unknown', value: null })
  })

  it('precedence: bye > out > qb-backup; a starter with a null starter base is no-base', () => {
    const sp = { p1: { projectedPPG: 4, factors: chain } }
    const pm = { p1: qb('KC', 2), p2: qb('KC', 1) }
    expect(run(sp, pm, [{ player_id: 'p1', team: 'KC', bye: true }]).p1.reason).toBe('bye')
    expect(run(sp, { ...pm, p1: qb('KC', 2, 'Out') }).p1.reason).toBe('out')
    const nb = run({ p1: { projectedPPG: 4, factors: { ...chain, qbStarterPPG: null } } }, { p1: qb('KC', 1) }).p1
    expect(nb.reason).toBe('no-base')
  })

  it('non-QB rows carry qbRole null and share null; teamless QBs keep the no-line path', () => {
    const sp = { p1: { projectedPPG: 12 } }
    expect(run(sp, { p1: { position: 'RB', team: 'KC' } }).p1).toMatchObject({ qbRole: null, share: null, reason: null })
    expect(run(sp, { p1: qb('FA', 1) }, [{ player_id: 'p1', team: 'FA', bye: false }]).p1)
      .toMatchObject({ qbRole: null, reason: 'no-line' })
    expect(run(sp, { p1: qb(null, 1) }, [{ player_id: 'p1', team: null, bye: false }]).p1)
      .toMatchObject({ qbRole: null, reason: 'no-line' })
  })

  it('never mutates frozen QB inputs', () => {
    const pm = Object.freeze({ p1: Object.freeze(qb('KC', 2)), p2: Object.freeze(qb('KC', 1, 'Out')) })
    const sp = Object.freeze({ p1: Object.freeze({ projectedPPG: 4, factors: Object.freeze({ ...chain }) }) })
    expect(run(sp, pm).p1.qbRole).toBe('starter')
  })
})
