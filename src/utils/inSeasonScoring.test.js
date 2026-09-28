import { describe, it, expect } from 'vitest'
import {
  usableLiveSeason, posteriorOf, classifyInSeasonPopulation, selectFrozenPriorCandidate,
  checkFrozenSnapshot, trimFrozenSnapshot, buildScoringPosteriors, buildInSeasonLevel, applyInSeasonProjection,
  historyRowOf, buildProspectLevel,
} from './inSeasonScoring'
import { usableLiveSeason as evidenceUsable } from './inSeasonEvidence'
import {
  K_DYN_POINTS_HISTORY, K_DYN_POINTS_ROOKIE0, K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_SHORT, K_ROS_POINTS, K_ROS_POINTS_SHORT,
  K_DYN_PROSPECT_A_YE1,
} from './inSeasonConstants'

const row = (gp, fp, extra = {}) => ({ gamesPlayed: gp, fantasyPoints: fp, ...extra })

describe('usableLiveSeason (copy agrees with inSeasonEvidence)', () => {
  it('agrees on a grid of inputs', () => {
    const totals = [null, {}, { season: 2026, complete: true }, { season: 2026, complete: false },
      { season: 2025, complete: true }, { season: 'x', complete: true }]
    for (const t of totals) for (const d of [null, NaN, 2024, 2025, 2026]) {
      expect(usableLiveSeason(t, d)).toBe(evidenceUsable(t, d))
    }
    expect(usableLiveSeason({ season: 2026, complete: true }, 2025)).toBe(true)
  })
})

describe('posteriorOf', () => {
  it('(10, 20, 3, 3) → 15 at weight 0.5', () => {
    expect(posteriorOf(10, 20, 3, 3)).toEqual({ value: 15, weight: 0.5 })
  })
  it('n 0 → the prior at weight 0, even with obs null', () => {
    expect(posteriorOf(10, null, 0, 3)).toEqual({ value: 10, weight: 0 })
  })
  it('obs null with n > 0 → null', () => { expect(posteriorOf(10, null, 2, 3)).toBeNull() })
  it('prior NaN → null', () => { expect(posteriorOf(NaN, 5, 2, 3)).toBeNull() })
  it('k = 0 with n > 0 → value = obs', () => {
    expect(posteriorOf(10, 20, 4, 0)).toEqual({ value: 20, weight: 1 })
  })
  it('bad n or k → null', () => {
    expect(posteriorOf(10, 20, 2.5, 3)).toBeNull()
    expect(posteriorOf(10, 20, -1, 3)).toBeNull()
    expect(posteriorOf(10, 20, 2, -1)).toBeNull()
    expect(posteriorOf(10, 20, 2, NaN)).toBeNull()
  })
})

describe('classifyInSeasonPopulation', () => {
  const cls = (careerStats, yearsExp, id = 'p') =>
    classifyInSeasonPopulation({ playerId: id, careerStats, dataSeason: 2025, yearsExp })

  it('one fixture per population', () => {
    expect(cls({ 2025: { p: row(16, 200) }, 2024: { p: row(16, 200) } }, 4)).toBe('standard')
    expect(cls({ 2025: { p: row(16, 200) } }, 3)).toBe('standard')
    expect(cls({}, 0)).toBe('ROOKIE0')
    expect(cls({ 2025: { p: row(3, 20) } }, 2)).toBe('ROOKIE1P')
    expect(cls({ 2023: { p: row(12, 100) }, 2025: { p: row(5, 40) } }, 4)).toBe('SHORT')
  })
  it('a second-year (years_exp 1) player with a 16-game season is ROOKIE1P — the app routes yearsExp ≤ 1 to the rookie path', () => {
    expect(cls({ 2025: { p: row(16, 200) } }, 1)).toBe('ROOKIE1P')
  })
  it('a years_exp 4 player with only 2023 gp 12 and 2025 gp 5 is SHORT', () => {
    expect(cls({ 2023: { p: row(12, 100) }, 2025: { p: row(5, 40) } }, 4)).toBe('SHORT')
  })
  it('a player with only a 2025 gp 3 row and years_exp 2 is ROOKIE1P (no qualifying season)', () => {
    expect(cls({ 2025: { p: row(3, 20) } }, 2)).toBe('ROOKIE1P')
  })
  it('years_exp null with S-1 gp 8 is standard', () => {
    expect(cls({ 2025: { p: row(8, 80) } }, null)).toBe('standard')
  })
  it('a non-finite fantasyPoints row does not qualify', () => {
    expect(cls({ 2025: { p: row(16, NaN) } }, 4)).toBe('ROOKIE1P')
  })
  it('other players\' rows are ignored; no rows at all is ROOKIE0', () => {
    expect(cls({ 2025: { q: row(16, 200) } }, 3)).toBe('ROOKIE0')
  })
})

describe('selectFrozenPriorCandidate', () => {
  const paths = ['snapshots/2026-09-05.json', 'snapshots/2026-09-08.json', 'snapshots/2026-09-09.json', 'ktc/snapshot-2026-09-01.json']
  it('latest strictly before kickoff; dated before the epoch → model-changed, dateKey still returned', () => {
    expect(selectFrozenPriorCandidate({ manifestPaths: paths, kickoffDate: '2026-09-09' }))
      .toEqual({ dateKey: '2026-09-08', reason: 'model-changed' })
  })
  it('an earlier epoch admits it', () => {
    expect(selectFrozenPriorCandidate({ manifestPaths: paths, kickoffDate: '2026-09-09', epoch: '2026-09-01' }))
      .toEqual({ dateKey: '2026-09-08', reason: null })
  })
  it('strict < : a capture ON kickoff date is not a candidate', () => {
    expect(selectFrozenPriorCandidate({ manifestPaths: paths, kickoffDate: '2026-09-05', epoch: '2026-09-01' }))
      .toEqual({ dateKey: null, reason: 'no-snapshot' })
  })
  it('missing / malformed kickoff → no-kickoff', () => {
    expect(selectFrozenPriorCandidate({ manifestPaths: paths, kickoffDate: undefined }).reason).toBe('no-kickoff')
    expect(selectFrozenPriorCandidate({ manifestPaths: paths, kickoffDate: 'Sept 9' }).reason).toBe('no-kickoff')
  })
})

describe('checkFrozenSnapshot', () => {
  const env = { leagueId: 'L1', targetSeason: 2026, projectionBasis: 'league' }
  const ctx = { leagueId: 'L1', liveSeason: 2026, projectionBasis: 'league' }
  it('a matching league-basis envelope passes', () => { expect(checkFrozenSnapshot(env, ctx)).toBeNull() })
  it('league / season / basis reasons', () => {
    expect(checkFrozenSnapshot({ ...env, leagueId: 'L2' }, ctx)).toBe('league')
    expect(checkFrozenSnapshot({ ...env, targetSeason: 2025 }, ctx)).toBe('season')
    expect(checkFrozenSnapshot({ ...env, projectionBasis: 'half_ppr' }, ctx)).toBe('basis')
    expect(checkFrozenSnapshot(env, { ...ctx, projectionBasis: 'mixed' })).toBe('basis')
  })
  it('an absent projectionBasis (pre-rescore capture) → basis', () => {
    expect(checkFrozenSnapshot({ leagueId: 'L1', targetSeason: 2026, projectionBasis: null }, ctx)).toBe('basis')
    expect(checkFrozenSnapshot({ leagueId: 'L1', targetSeason: 2026 }, ctx)).toBe('basis')
  })
})

describe('trimFrozenSnapshot', () => {
  it('keeps only finite projectedPPG plus the envelope; projectionBasis defaults to null', () => {
    const t = trimFrozenSnapshot({
      capturedAt: 'c', leagueId: 'L', targetSeason: 2026,
      players: { a: { projection: { projectedPPG: 11.5, factors: {} } }, b: { projection: { projectedPPG: null } }, c: {} },
      teamDepthCharts: { KC: {} },
    })
    expect(t).toEqual({ env: { capturedAt: 'c', leagueId: 'L', targetSeason: 2026, projectionBasis: null }, players: { a: 11.5 } })
  })
})

describe('buildScoringPosteriors', () => {
  const league = 'league'
  const seasonProjections = {
    vet: { projectedPPG: 14.0 }, roo: { projectedPPG: 8.0 }, short: { projectedPPG: 9.0 },
    qbk: { projectedPPG: 20.0 }, kick: { projectedPPG: 5.0 },
  }
  const playerMap = {
    vet: { position: 'RB', years_exp: 4 }, roo: { position: 'WR', years_exp: 0 },
    short: { position: 'TE', years_exp: 5 }, qbk: { position: 'QB', years_exp: 6 }, kick: { position: 'K', years_exp: 3 },
  }
  const careerStats = {
    2024: { vet: row(16, 224), short: row(12, 100) },
    2025: { vet: row(16, 240), short: row(5, 30), qbk: row(16, 320) },
  }
  const live = (id, gp, fp, basis = league) => [id, { gamesPlayed: gp, fantasyPoints: fp, scoringBasis: basis }]
  const totals = (players) => ({ season: 2026, complete: true, players: Object.fromEntries(players) })
  const args = (over = {}) => ({
    seasonProjections, careerStats, dataSeason: 2025, playerMap,
    currentSeasonTotals: totals([live('vet', 3, 60), live('roo', 3, 30), live('short', 2, 30), live('qbk', 3, 60)]),
    projectionBasis: league, frozenPrior: { status: 'refused', reason: 'model-changed', dateKey: '2026-09-08' },
    ...over,
  })

  it('uses the frozen prior when status ok and the player is in the frozen map', () => {
    const m = buildScoringPosteriors(args({ frozenPrior: { status: 'ok', dateKey: '2026-09-13', players: { vet: 12.5 } } }))
    const r = m.get('vet')
    expect(r.frozen).toBe(true)
    expect(r.priorSource).toBe('snapshot:2026-09-13')
    expect(r.notFrozenReason).toBeNull()
    expect(r.ros.prior).toBe(12.5)
    expect(r.ros.k).toBe(K_ROS_POINTS.RB)
    expect(r.ros.value).toBe(Math.round(((12.5 * 2.5 + 20 * 3) / 5.5) * 100) / 100)
  })

  it("absent from an ok frozen map → live prior, reason 'absent'", () => {
    const m = buildScoringPosteriors(args({ frozenPrior: { status: 'ok', dateKey: '2026-09-13', players: { roo: 7 } } }))
    expect(m.get('vet')).toMatchObject({ frozen: false, priorSource: 'live', notFrozenReason: 'absent' })
    expect(m.get('vet').ros.prior).toBe(14.0)
    expect(m.get('roo')).toMatchObject({ frozen: true })
  })

  it('a refused frozen prior → live prior with the refusal reason; none/unavailable/timeout carry through', () => {
    expect(buildScoringPosteriors(args()).get('vet')).toMatchObject({ frozen: false, priorSource: 'live', notFrozenReason: 'model-changed' })
    expect(buildScoringPosteriors(args({ frozenPrior: { status: 'none', reason: 'no-snapshot' } })).get('vet').notFrozenReason).toBe('no-snapshot')
    expect(buildScoringPosteriors(args({ frozenPrior: { status: 'unavailable', reason: 'timeout' } })).get('vet').notFrozenReason).toBe('timeout')
    expect(buildScoringPosteriors(args({ frozenPrior: { status: 'not-needed' } })).get('vet').notFrozenReason).toBe('unavailable')
  })

  it('standard next: history prior = S-1 PPG at K_DYN_POINTS_HISTORY', () => {
    const r = buildScoringPosteriors(args()).get('vet')
    expect(r.population).toBe('standard')
    expect(r.next).toMatchObject({ priorKind: 'history', prior: 15, k: K_DYN_POINTS_HISTORY.RB })
    expect(r.next.weight).toBe(Math.round((3 / (3 + 4)) * 10000) / 10000)
  })

  it('ROOKIE0 next: projection prior at K_DYN_POINTS_ROOKIE0', () => {
    const r = buildScoringPosteriors(args()).get('roo')
    expect(r.population).toBe('ROOKIE0')
    expect(r.next).toMatchObject({ priorKind: 'projection', prior: 8, k: K_DYN_POINTS_ROOKIE0.WR })
  })

  it('SHORT uses the SHORT tables', () => {
    const r = buildScoringPosteriors(args()).get('short')
    expect(r.population).toBe('SHORT')
    expect(r.ros.k).toBe(K_ROS_POINTS_SHORT.TE)
    // SHORT-recent (S-1 gp 12 ≥ 8): `next` is the history posterior, the level it feeds
    expect(r.next.priorKind).toBe('history')
    expect(r.next.k).toBe(K_DYN_POINTS_HISTORY.TE)
    expect(r.next.prior).toBe(Math.round(100 / 12 * 100) / 100)
  })

  it('SHORT-stale (no qualifying season the year before) keeps the projection `next` at K_DYN_POINTS_SHORT', () => {
    const stale = { position: 'TE', years_exp: 6 }
    const r = buildScoringPosteriors(args({
      seasonProjections: { ...seasonProjections, stale: { projectedPPG: 9 } },
      playerMap: { ...playerMap, stale },
      careerStats: { 2023: { stale: row(12, 100) }, 2025: { stale: row(5, 30) } },
      currentSeasonTotals: totals([live('stale', 2, 30)]),
    })).get('stale')
    expect(r.population).toBe('SHORT')
    expect(r.next).toMatchObject({ priorKind: 'projection', k: K_DYN_POINTS_SHORT.TE })
  })

  it('a live row on another scoring basis skips the record', () => {
    const m = buildScoringPosteriors(args({
      currentSeasonTotals: totals([live('vet', 3, 60, 'half_ppr'), live('roo', 3, 30)]),
    }))
    expect(m.has('vet')).toBe(false)
    expect(m.has('roo')).toBe(true)
  })

  it('n 0 (no live row) → value === prior, weight 0', () => {
    const m = buildScoringPosteriors(args({ currentSeasonTotals: totals([live('roo', 3, 30)]) }))
    const r = m.get('vet')
    expect(r.n).toBe(0)
    expect(r.ros).toMatchObject({ weight: 0, value: r.ros.prior })
    expect(r.next).toMatchObject({ weight: 0, value: r.next.prior })
  })

  it('non-skill position → no record', () => {
    expect(buildScoringPosteriors(args()).has('kick')).toBe(false)
  })

  it('unusable live season → null; projectionBasis mixed → null', () => {
    expect(buildScoringPosteriors(args({ currentSeasonTotals: { ...totals([]), complete: false } }))).toBeNull()
    expect(buildScoringPosteriors(args({ currentSeasonTotals: null }))).toBeNull()
    expect(buildScoringPosteriors(args({ projectionBasis: 'mixed' }))).toBeNull()
  })

  it('never mutates its inputs (deep-frozen seasonProjections and frozenPrior)', () => {
    const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }
    const sp = deepFreeze(JSON.parse(JSON.stringify(seasonProjections)))
    const fp = deepFreeze({ status: 'ok', dateKey: '2026-09-13', players: { vet: 12.5 } })
    expect(() => buildScoringPosteriors(args({ seasonProjections: sp, frozenPrior: fp }))).not.toThrow()
  })
})

const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }

describe('buildInSeasonLevel (2b-2 §2.2)', () => {
  const league = 'league'
  const playerMap = {
    vet: { position: 'RB', years_exp: 4 }, vet0: { position: 'WR', years_exp: 5 },
    roo: { position: 'WR', years_exp: 0 }, short: { position: 'TE', years_exp: 5 },
    qbk: { position: 'QB', years_exp: 6 }, kick: { position: 'K', years_exp: 3 },
  }
  const careerStats = {
    2024: { vet: row(16, 224), vet0: row(16, 160), short: row(12, 100) },
    2025: { vet: row(16, 240), vet0: row(16, 200), short: row(5, 30), qbk: row(16, 320), roo: row(3, 20), kick: row(16, 100) },
  }
  const liveRow = (gp, fp, basis = league) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: basis })
  const totals = players => ({ season: 2026, complete: true, players })
  const args = (over = {}) => ({
    careerStats, dataSeason: 2025, playerMap, projectionBasis: league,
    currentSeasonTotals: totals({ vet: liveRow(3, 60), vet0: liveRow(0, 0), roo: liveRow(3, 30), short: liveRow(2, 30), qbk: liveRow(3, 60), kick: liveRow(3, 30) }),
    ...over,
  })

  it('holds standard and SHORT-recent populations with n > 0 only: no rookie, non-skill or n = 0 id', () => {
    const m = buildInSeasonLevel(args())
    expect([...m.keys()].sort()).toEqual(['qbk', 'short', 'vet'])
    // short: S-1 PPG 100/12, live 15 ppg over 2 games, TE k 5.5
    expect(m.get('short')).toBe(Math.round(((100 / 12) * 5.5 + 15 * 2) / 7.5 * 100) / 100)
  })

  it('a SHORT-stale id is absent; a SHORT-recent id with no dataSeason row is present', () => {
    const pm = { ...playerMap, stale: { position: 'TE', years_exp: 6 }, gone: { position: 'TE', years_exp: 5 } }
    const cs = { ...careerStats, 2023: { stale: row(12, 100) }, 2025: { ...careerStats[2025], stale: row(5, 30) } }
    cs[2024] = { ...careerStats[2024], gone: row(12, 100) }
    const m = buildInSeasonLevel(args({
      playerMap: pm, careerStats: cs,
      currentSeasonTotals: totals({ stale: liveRow(2, 30), gone: liveRow(2, 30) }),
    }))
    expect(m.has('stale')).toBe(false)
    expect(m.has('gone')).toBe(true)
  })

  it('the value is the history posterior: vet S-1 PPG 15, live 20 ppg, n 3, RB k 4 → (15·4 + 20·3)/7 = 17.14', () => {
    expect(buildInSeasonLevel(args()).get('vet')).toBe(17.14)
    expect(K_DYN_POINTS_HISTORY.RB).toBe(4)
  })

  it('invariant: level.get(id) === scoringPosteriors.get(id).next.value for every id in both', () => {
    const a = args()
    const level = buildInSeasonLevel(a)
    const post = buildScoringPosteriors({
      ...a, seasonProjections: { vet: { projectedPPG: 14 }, vet0: { projectedPPG: 12 }, qbk: { projectedPPG: 20 }, roo: { projectedPPG: 8 }, short: { projectedPPG: 9 } },
      frozenPrior: { status: 'none', reason: 'no-snapshot' },
    })
    expect(level.size).toBeGreaterThan(0)
    for (const [id, v] of level) expect(v).toBe(post.get(id).next.value)
  })

  it('a live row on another scoring basis, a missing live row, or a non-finite fantasyPoints is omitted', () => {
    const m = buildInSeasonLevel(args({ currentSeasonTotals: totals({ vet: liveRow(3, 60, 'half_ppr'), qbk: liveRow(3, NaN), vet0: undefined }) }))
    expect(m.size).toBe(0)
  })

  it('empty Map when the live season is unusable or the basis is mixed/unknown', () => {
    expect(buildInSeasonLevel(args({ currentSeasonTotals: { ...totals({}), complete: false } })).size).toBe(0)
    expect(buildInSeasonLevel(args({ currentSeasonTotals: null })).size).toBe(0)
    expect(buildInSeasonLevel(args({ projectionBasis: 'mixed' })).size).toBe(0)
  })

  it('never mutates its inputs', () => {
    const a = args()
    deepFreeze(a.careerStats); deepFreeze(a.playerMap); deepFreeze(a.currentSeasonTotals)
    expect(() => buildInSeasonLevel(a)).not.toThrow()
  })
})

describe('applyInSeasonProjection (2b-2 §2.3)', () => {
  const mkProj = (ppg, games, extra = {}) => ({
    projectedPPG: ppg, projectedGames: games, projectedTotalPts: Math.round(ppg * games * 10) / 10,
    confidence: 'high', factors: { a: 1 }, adjustmentSummary: ['x'], ...extra,
  })
  const rec = (n, rosValue) => ({ season: 2026, n, population: 'standard', frozen: true,
    ros: { prior: 10, k: 3, weight: 0.5, value: rosValue }, next: { value: 1 } })
  const totals = players => ({ season: 2026, complete: true, players })

  it('points so far + ROS rate × remaining games: (fp 30, n 3, ros 9.4, projectedGames 14) → 30 + 9.4·11 = 133.4', () => {
    const proj = { a: mkProj(10, 14) }
    const out = applyInSeasonProjection(proj, new Map([['a', rec(3, 9.4)]]), totals({ a: { fantasyPoints: 30 } }))
    expect(out.a.projectedPPG).toBe(9.4)
    expect(out.a.projectedTotalPts).toBe(133.4)
    expect(out.a.projectedGames).toBe(14)            // stays the full-season figure
    expect(out.a.inSeason).toEqual(rec(3, 9.4))
  })

  it('rounds the rate to 1 dp before multiplying: ros 9.44 → 9.4', () => {
    const out = applyInSeasonProjection({ a: mkProj(10, 14) }, new Map([['a', rec(3, 9.44)]]), totals({ a: { fantasyPoints: 30 } }))
    expect(out.a.projectedPPG).toBe(9.4)
    expect(out.a.projectedTotalPts).toBe(133.4)
  })

  it('a player who has already played more games than projected adds no remaining games: total = points banked', () => {
    const out = applyInSeasonProjection({ a: mkProj(10, 6) }, new Map([['a', rec(8, 9.4)]]), totals({ a: { fantasyPoints: 77.7 } }))
    expect(out.a.projectedTotalPts).toBe(77.7)
  })

  it('no live row and n 0 → r1(ros × projectedGames)', () => {
    const out = applyInSeasonProjection({ a: mkProj(10, 14) }, new Map([['a', rec(0, 10)]]), totals({}))
    expect(out.a.projectedTotalPts).toBe(140)
  })

  it('keeps factors, confidence, adjustmentSummary by reference; an id without a record keeps its object reference', () => {
    const proj = { a: mkProj(10, 14), b: mkProj(7, 12) }
    const out = applyInSeasonProjection(proj, new Map([['a', rec(3, 9.4)]]), totals({ a: { fantasyPoints: 30 } }))
    expect(out.a.factors).toBe(proj.a.factors)
    expect(out.a.adjustmentSummary).toBe(proj.a.adjustmentSummary)
    expect(out.a.confidence).toBe('high')
    expect(out.b).toBe(proj.b)
    expect(out).not.toBe(proj)
  })

  it('a non-finite ros.value or a record for an id with no projection is skipped', () => {
    const proj = { a: mkProj(10, 14) }
    const out = applyInSeasonProjection(proj, new Map([['a', rec(3, NaN)], ['ghost', rec(3, 9)]]), totals({}))
    expect(out.a).toBe(proj.a)
    expect(out.ghost).toBeUndefined()
  })

  it('null or empty posteriors → the same object reference', () => {
    const proj = { a: mkProj(10, 14) }
    expect(applyInSeasonProjection(proj, null, totals({}))).toBe(proj)
    expect(applyInSeasonProjection(proj, new Map(), totals({}))).toBe(proj)
  })

  it('never mutates its inputs (deep-frozen)', () => {
    const proj = deepFreeze({ a: mkProj(10, 14) })
    const post = new Map([['a', deepFreeze(rec(3, 9.4))]])
    const t = deepFreeze(totals({ a: { fantasyPoints: 30 } }))
    expect(() => applyInSeasonProjection(proj, post, t)).not.toThrow()
    expect(proj.a.projectedPPG).toBe(10)
  })
})

describe('historyRowOf (2c wiring §3.1)', () => {
  const cs = { 2024: { a: row(12, 100), b: row(7, 60) }, 2025: { a: row(5, 30), s: row(16, 200) } }
  const of = (id, population) => historyRowOf({ careerStats: cs, dataSeason: 2025, id, population })
  it('standard → the dataSeason row', () => { expect(of('s', 'standard')).toBe(cs[2025].s) })
  it('SHORT → the dataSeason − 1 row when gp ≥ 8', () => { expect(of('a', 'SHORT')).toBe(cs[2024].a) })
  it('SHORT with a gp-7 row → null', () => { expect(of('b', 'SHORT')).toBeNull() })
  it('rookie populations and unknown → null', () => {
    expect(of('a', 'ROOKIE0')).toBeNull()
    expect(of('a', 'ROOKIE1P')).toBeNull()
  })
})

describe('buildProspectLevel (2c wiring §3.5)', () => {
  const league = 'league'
  const playerMap = {
    rb0: { position: 'RB', years_exp: 0 }, rb1: { position: 'RB', years_exp: 1 },
    wr0: { position: 'WR', years_exp: 0 }, wr1: { position: 'WR', years_exp: 1 }, wr1n: { position: 'WR', years_exp: 1 },
    rb2: { position: 'RB', years_exp: 2 }, k0: { position: 'K', years_exp: 0 }, bad: { position: 'RB', years_exp: 0 },
  }
  const careerStats = { 2025: { rb1: row(10, 100), wr1: row(9, 90) } }
  const priors = { rb0: 7, rb1: 8, wr0: 6, wr1: 5, wr1n: 5, rb2: 9, k0: 4, bad: NaN }
  const liveRow = (gp, fp, basis = league) => ({ gamesPlayed: gp, fantasyPoints: fp, scoringBasis: basis })
  const totals = players => ({ season: 2026, complete: true, players })
  const args = (over = {}) => ({
    rookieDynastyPriors: priors, careerStats, dataSeason: 2025, playerMap, projectionBasis: league,
    currentSeasonTotals: totals({ rb0: liveRow(3, 30) }), ...over,
  })

  it('(a) RB YE0 (no row) → projection at K_DYN_POINTS_ROOKIE0; RB YE1 with a row → K_DYN_POINTS_ROOKIE1P', () => {
    const m = buildProspectLevel(args())
    expect(m.get('rb0')).toMatchObject({ priorKind: 'projection', prior: 7, k: K_DYN_POINTS_ROOKIE0.RB })
    expect(m.get('rb1')).toMatchObject({ priorKind: 'projection', prior: 8, k: K_DYN_POINTS_ROOKIE1P.RB })
  })

  it('(b) YE0 WR → projection (6.5); YE1 WR → position, prior null, k 3.5 — with or without a careerStats row', () => {
    const m = buildProspectLevel(args())
    expect(m.get('wr0')).toMatchObject({ priorKind: 'projection', prior: 6, k: 6.5 })
    expect(m.get('wr1')).toMatchObject({ priorKind: 'position', prior: null, k: K_DYN_PROSPECT_A_YE1.WR })
    expect(m.get('wr1n')).toMatchObject({ priorKind: 'position', prior: null, k: 3.5 })
  })

  it('(c) a live row gives n/obs; basis mismatch, unusable season or non-finite fp give n 0', () => {
    expect(buildProspectLevel(args()).get('rb0')).toMatchObject({ n: 3, obs: 10 })
    const mismatch = buildProspectLevel(args({ currentSeasonTotals: totals({ rb0: liveRow(3, 30, 'half_ppr') }) }))
    expect(mismatch.get('rb0')).toMatchObject({ n: 0, obs: null })
    const unusable = buildProspectLevel(args({ currentSeasonTotals: { ...totals({ rb0: liveRow(3, 30) }), complete: false } }))
    expect(unusable.get('rb0')).toMatchObject({ n: 0, obs: null })
    const nan = buildProspectLevel(args({ currentSeasonTotals: totals({ rb0: liveRow(3, NaN) }) }))
    expect(nan.get('rb0')).toMatchObject({ n: 0, obs: null })
    expect(buildProspectLevel(args({ currentSeasonTotals: null })).has('rb0')).toBe(true)
  })

  it('(d) YE2, non-skill and non-finite-prior ids are absent', () => {
    const m = buildProspectLevel(args())
    for (const id of ['rb2', 'k0', 'bad']) expect(m.has(id)).toBe(false)
  })

  it('(e) never mutates its inputs', () => {
    const a = args()
    deepFreeze(a.rookieDynastyPriors); deepFreeze(a.careerStats); deepFreeze(a.playerMap); deepFreeze(a.currentSeasonTotals)
    expect(() => buildProspectLevel(a)).not.toThrow()
  })
})
