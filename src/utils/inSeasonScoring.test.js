import { describe, it, expect, vi } from 'vitest'
import {
  usableLiveSeason, posteriorOf, classifyInSeasonPopulation, selectFrozenPriorCandidate,
  checkFrozenSnapshot, trimFrozenSnapshot, buildScoringPosteriors, buildInSeasonLevel, applyInSeasonProjection,
  historyRowOf, buildProspectLevel, primaryPassersByTeamWeek, buildQbLiveStates,
} from './inSeasonScoring'
import { expectedStarts } from './qbTakeover'
import { QB_SAT_LONGER_DISCOUNT } from './qbTakeoverConstants'
import { usableLiveSeason as evidenceUsable } from './inSeasonEvidence'
import {
  K_DYN_POINTS_HISTORY, K_DYN_POINTS_ROOKIE0, K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_SHORT, K_ROS_POINTS, K_ROS_POINTS_SHORT,
  K_DYN_PROSPECT_A_YE1, K_ROS_POINTS_ROOKIE0,
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
    expect(t).toEqual({ env: { capturedAt: 'c', leagueId: 'L', targetSeason: 2026, projectionBasis: null }, players: { a: 11.5 }, starterPPG: {} })
  })
  it('P6b: keeps the finite projection.factors.qbStarterPPG as starterPPG (a null or absent one is dropped)', () => {
    const t = trimFrozenSnapshot({
      players: {
        q: { projection: { projectedPPG: 3.1, factors: { qbStarterPPG: 19.75 } } },
        r: { projection: { projectedPPG: 12.5, factors: { qbStarterPPG: null } } },
        s: { projection: { projectedPPG: 9, factors: {} } },
        u: { projection: { projectedPPG: null, factors: { qbStarterPPG: 14.2 } } },
      },
    })
    expect(t.players).toEqual({ q: 3.1, r: 12.5, s: 9 })
    expect(t.starterPPG).toEqual({ q: 19.75, u: 14.2 })
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

// ─── P6b Stage B ─────────────────────────────────────────────────────────────

describe('primaryPassersByTeamWeek (qb-takeover-wiring-b §3.2)', () => {
  const r = (team, att, sack) => ({ team, opponent: 'X', stats: { pass_att: att, pass_sack: sack } })
  it('primary = most dropbacks (pass_att + pass_sack); ties → more attempts → smaller pid; TEAM_ rows and zero-dropback rows ignored', () => {
    const weeks = [
      { week: 1, rows: { a: r('KC', 20, 0), b: r('KC', 18, 2), TEAM_KC: { team: 'KC', opponent: 'X', stats: { pass_att: 99 } }, z: r('KC', 0, 0) } },
      { week: 2, rows: { b: r('KC', 18, 2), a: r('KC', 18, 2) } },
      { week: 3, rows: { a: r('KC', 5, 3), c: r('DEN', 1, 0) } },
    ]
    const m = primaryPassersByTeamWeek(weeks)
    expect(m.get('KC|1')).toEqual({ pid: 'a', dropbacks: 20, attempts: 20 })    // tie on dropbacks → attempts
    expect(m.get('KC|2')).toEqual({ pid: 'a', dropbacks: 20, attempts: 18 })    // full tie → smaller pid
    expect(m.get('KC|3')).toEqual({ pid: 'a', dropbacks: 8, attempts: 5 })
    expect(m.get('DEN|3')).toEqual({ pid: 'c', dropbacks: 1, attempts: 1 })
    expect(m.size).toBe(4)                                                       // z (0 dropbacks) and TEAM_KC absent
  })
  it('a missing pass_att / pass_sack counts as 0', () => {
    const m = primaryPassersByTeamWeek([{ week: 1, rows: { a: { team: 'KC', stats: { pass_sack: 2 } }, b: { team: 'KC', stats: { pass_att: 1 } } } }])
    expect(m.get('KC|1').pid).toBe('a')
  })
})

describe('buildQbLiveStates (qb-takeover-wiring-b §3.2)', () => {
  const scoring = { pass_yd: 0.1 }                                  // pass_yd 200 → 20 points
  const qb = (team, att, yd, sack = 0, gp = 1) => ({ team, opponent: 'OPP', stats: { gp, pass_att: att, pass_sack: sack, pass_yd: yd } })
  const team = () => ({ opponent: 'OPP', stats: {} })
  // T1: q1 starts wk 1, q2 takes over wk 2-4 (a week-1 starter benched).
  // T2: q3 starts every game it plays; bye in wk 3 (no TEAM_T2 row); q4 is a rookie backup who never plays.
  // T3: q5 starts all four; q6 is a veteran backup.
  const playerMap = {
    q1: { position: 'QB', team: 'T1', years_exp: 5, depth_chart_order: 2 },
    q2: { position: 'QB', team: 'T1', years_exp: 3, depth_chart_order: 1 },
    q3: { position: 'QB', team: 'T2', years_exp: 6, depth_chart_order: 1 },
    q4: { position: 'QB', team: 'T2', years_exp: 0, depth_chart_order: 2 },
    q5: { position: 'QB', team: 'T3', years_exp: 7, depth_chart_order: 1 },
    q6: { position: 'QB', team: 'T3', years_exp: 4, depth_chart_order: 2 },
    rb: { position: 'RB', team: 'T1', years_exp: 2, depth_chart_order: 1 },
    fa: { position: 'QB', team: 'FA', years_exp: 2, depth_chart_order: null },
  }
  const careerStats = { 2025: {
    q2: row(16, 160), q3: row(16, 320), q5: row(16, 240), q1: row(16, 200),
  } }
  const wkRows = w => {
    const rows = { TEAM_T1: team(), TEAM_T3: team() }
    if (w !== 3) rows.TEAM_T2 = team()
    if (w === 1) rows.q1 = qb('T1', 30, 300)
    else rows.q2 = qb('T1', 25, 100)
    if (w !== 3) rows.q3 = qb('T2', 30, 200)
    rows.q5 = qb('T3', 30, 150)
    return rows
  }
  const loaded = (n = 4, over = {}) => ({
    year: 2026, complete: true, failedWeeks: [],
    weeks: Array.from({ length: n }, (_, i) => ({ week: i + 1, rows: wkRows(i + 1) })), ...over,
  })
  const preseason = { q4: { role: 'backup', perGame: Array(17).fill(0.3) } }
  const build = (over = {}) => buildQbLiveStates({ qbWeekly: loaded(), playerMap, careerStats, dataSeason: 2025, scoringSettings: scoring, preseason, ...over })
  const chain = (start, remaining) => expectedStarts({ start, remaining })

  it('a team plays when its TEAM_ row has an opponent: a bye week is skipped in the game index (T2: g = 3, next game 4)', () => {
    const s = build().get('q4')
    expect(s.gamesPlayed).toBe(3)
    expect(s.remaining).toBe(14)
    // strong iq (incumbent 20 ppg vs median 15), rookie, d2, never started, not the week-1 starter
    const r = chain({ role: 'B', ps: 0, c: 0, g: 4, hazardCodes: { dp: 0, og: 0, rk: 1, iq: 2 }, stickCodes: {} }, 14)
    expect(s.kind).toBe('backup')
    expect(s.fraction).toBe(r.fraction)
    expect(s.expected).toBe(r.expected)
    expect(s.pNext).toBe(r.perGame[0])
    expect(s.starts).toBe(0)
  })

  it('original: the week-1 starter who is still the last game\'s primary is unmodelled (no pNext / expected / fraction) but carries his starts and points', () => {
    const s = build().get('q3')
    expect(s).toMatchObject({ kind: 'original', team: 'T2', gamesPlayed: 3, starts: 3, startPoints: 60, seasonPoints: 60, pNext: null, expected: null, fraction: null })
  })

  it('starter: a non-week-1 starter who is the last game\'s primary takes the S chain at his streak, post-demotion codes d2 / unknown', () => {
    const s = build().get('q2')
    expect(s.kind).toBe('starter')
    expect(s.starts).toBe(3)
    expect(s.startPoints).toBeCloseTo(30)                              // 3 × 100 yd × 0.1
    const r = chain({ role: 'S', ps: 1, c: 0, s: 3, g: 5, hazardCodes: { dp: 0, og: 0, rk: 0, iq: 3 }, stickCodes: {} }, 13)
    expect(s.fraction).toBe(r.fraction)
    expect(s.expected).toBe(r.expected)
    // a streak of 2 (week 2 given to q1) is a different chain
    const wk = loaded()
    wk.weeks[1].rows.q1 = qb('T1', 40, 200)                            // q1 is week 2's primary now → q2's streak is 2 (weeks 3-4)
    delete wk.weeks[1].rows.q2
    const s2 = build({ qbWeekly: wk }).get('q2')
    expect(s2.starts).toBe(2)
    expect(s2.fraction).toBe(chain({ role: 'S', ps: 1, c: 0, s: 2, g: 5, hazardCodes: { dp: 0, og: 0, rk: 0, iq: 3 }, stickCodes: {} }, 13).fraction)
    expect(s2.fraction).not.toBe(s.fraction)
  })

  it('backup: a benched week-1 starter has og 1 and ps 1; iq is the incumbent\'s incPPG over the all-teams median (weak here)', () => {
    const s = build().get('q1')
    expect(s.kind).toBe('backup')
    expect(s.starts).toBe(1)
    expect(s.startPoints).toBe(30)
    expect(s.seasonPoints).toBe(30)
    const r = chain({ role: 'B', ps: 1, c: 0, g: 5, hazardCodes: { dp: 0, og: 1, rk: 0, iq: 1 }, stickCodes: {} }, 13)
    expect(s.fraction).toBe(r.fraction)
  })

  it('injury rule (fix pass 1): an injured week-1 starter who is not the last game\'s primary stays `original` (no chain); healthy he is a `backup` with og 1', () => {
    const withInj = injury_status => ({ ...playerMap, q1: { ...playerMap.q1, injury_status } })
    const inj = build({ playerMap: withInj('Out') }).get('q1')
    expect(inj).toMatchObject({ kind: 'original', pNext: null, expected: null, fraction: null, starts: 1 })
    const healthy = build({ playerMap: withInj(null) }).get('q1')
    expect(healthy.kind).toBe('backup')
    expect(healthy.fraction).toBe(chain({ role: 'B', ps: 1, c: 0, g: 5, hazardCodes: { dp: 0, og: 1, rk: 0, iq: 1 }, stickCodes: {} }, 13).fraction)
    expect(build({ playerMap: withInj('') }).get('q1').kind).toBe('backup')
  })

  it('iq: a mid incumbent (q5, 15 ppg = the median) codes mid; no prior and < 2 observed games codes unknown', () => {
    expect(build().get('q6').fraction).toBe(chain({ role: 'B', ps: 0, c: 0, g: 5, hazardCodes: { dp: 0, og: 0, rk: 0, iq: 0 }, stickCodes: {} }, 13).fraction)
    // q5 without a prior and with one observed game → incPPG null → unknown; the median then comes from the other two
    const noPrior = { 2025: { q2: row(16, 160), q3: row(16, 320) } }
    const w1 = loaded(1)
    const s = build({ careerStats: noPrior, qbWeekly: w1 }).get('q6')
    expect(s.fraction).toBe(chain({ role: 'B', ps: 0, c: 0, g: 2, hazardCodes: { dp: 0, og: 0, rk: 0, iq: 3 }, stickCodes: {} }, 16).fraction)
  })

  it('an incomplete load or any failed week → an empty Map (a missing week breaks the game index and streaks)', () => {
    expect(build({ qbWeekly: loaded(4, { failedWeeks: [2] }) }).size).toBe(0)
    expect(build({ qbWeekly: loaded(4, { complete: false }) }).size).toBe(0)
    expect(build({ qbWeekly: null }).size).toBe(0)
  })

  it('no state for a QB with no team (FA), a non-QB, or a team whose last game has no primary passer', () => {
    const m = build()
    expect(m.has('fa')).toBe(false)
    expect(m.has('rb')).toBe(false)
    const wk = loaded()
    delete wk.weeks[3].rows.q2                                          // T1's week 4: a game with no passer row
    const m2 = build({ qbWeekly: wk })
    expect(m2.has('q1')).toBe(false)
    expect(m2.has('q2')).toBe(false)
    expect(m2.has('q3')).toBe(true)
  })

  it('no state once a team has played all 17 games (remaining 0)', () => {
    const weeks = Array.from({ length: 17 }, (_, i) => ({ week: i + 1, rows: { TEAM_T3: team(), q5: qb('T3', 30, 150) } }))
    expect(buildQbLiveStates({ qbWeekly: { complete: true, failedWeeks: [], weeks }, playerMap, careerStats, dataSeason: 2025, scoringSettings: scoring, preseason }).size).toBe(0)
  })

  it('D1: a rookie the preseason chain called a backup — residual = starts − Σ preseason perGame[0..g−1]; satLonger only below −1 (boundary −1 is not)', () => {
    const at = perGame => build({ preseason: { q4: { role: 'backup', perGame: Array(17).fill(perGame) } } }).get('q4')
    expect(at(0.3)).toMatchObject({ satLonger: false })               // −0.9
    expect(at(0.3).residual).toBeCloseTo(-0.9)
    expect(at(1 / 3).satLonger).toBe(false)                            // exactly −1 → not sat longer
    expect(at(0.4)).toMatchObject({ satLonger: true })                // −1.2
    // vets, preseason non-backups and rookies without a preseason entry carry null
    expect(build().get('q6')).toMatchObject({ residual: null, satLonger: null })
    expect(build({ preseason: { q4: { role: 'incumbent' } } }).get('q4')).toMatchObject({ residual: null, satLonger: null })
    expect(build({ preseason: null }).get('q4')).toMatchObject({ residual: null, satLonger: null })
  })

  it('D1: a rookie who started games is measured against the same expectation (starts 2 vs 0.9 expected → +1.1, not sat longer)', () => {
    const wk = loaded()
    wk.weeks[0].rows.q4 = qb('T2', 50, 100)
    wk.weeks[1].rows.q4 = qb('T2', 50, 100)
    const s = build({ qbWeekly: wk }).get('q4')
    expect(s.starts).toBe(2)
    expect(s.residual).toBeCloseTo(2 - 0.9)
    expect(s.satLonger).toBe(false)
  })
})

describe('buildScoringPosteriors — the QB start chain (qb-takeover-wiring-b §3.3)', () => {
  const league = 'league'
  const factors = (starter, basis) => ({ qbStarterPPG: starter, qbTakeoverBasis: basis })
  const seasonProjections = {
    bk: { projectedPPG: 2.4, projectedGames: 16, factors: factors(15, 'chain') },
    inc: { projectedPPG: 20, projectedGames: 17, factors: factors(20.123, 'incumbent') },
    roo: { projectedPPG: 3, projectedGames: 14, factors: factors(12, 'chain') },
    nof: { projectedPPG: 2, projectedGames: 16, factors: factors(14, 'chain') },
  }
  const playerMap = {
    bk: { position: 'QB', years_exp: 5 }, inc: { position: 'QB', years_exp: 6 },
    roo: { position: 'QB', years_exp: 0 }, nof: { position: 'QB', years_exp: 4 },
  }
  const careerStats = { 2025: { bk: row(16, 240), inc: row(16, 320), nof: row(16, 200) } }
  const live = (id, gp, fp) => [id, { gamesPlayed: gp, fantasyPoints: fp, scoringBasis: league }]
  const totals = players => ({ season: 2026, complete: true, players: Object.fromEntries(players) })
  const state = (over = {}) => ({
    kind: 'backup', team: 'T', gamesPlayed: 7, remaining: 10, pNext: 0.3, expected: 4, fraction: 0.4,
    starts: 2, startPoints: 40, seasonPoints: 55.5, residual: null, satLonger: null, ...over,
  })
  const args = (over = {}) => ({
    seasonProjections, careerStats, dataSeason: 2025, playerMap, projectionBasis: league,
    currentSeasonTotals: totals([live('bk', 7, 77), live('inc', 7, 140), live('roo', 5, 20), live('nof', 7, 70)]),
    frozenPrior: { status: 'refused', reason: 'model-changed' },
    qbLiveStates: new Map([['bk', state()], ['roo', state({ starts: 0, startPoints: 0, fraction: 0.3, expected: 3, remaining: 10 })], ['nof', state()]]),
    ...over,
  })
  const kQb = K_ROS_POINTS.QB

  it('start branch: evidence is starts (not games played), prior = the starter prior, ros at the chain fraction, record gains `start`', () => {
    const r = buildScoringPosteriors(args()).get('bk')
    const post = (15 * kQb + 20 * 2) / (kQb + 2)                       // obs = 40 / 2 starts
    expect(r.n).toBe(7)                                                // n stays live games played
    expect(r.ros.k).toBe(kQb)
    expect(r.ros.weight).toBe(Math.round(2 / (2 + kQb) * 10000) / 10000)
    expect(r.ros.prior).toBeCloseTo(15 * 0.4, 10)
    expect(r.ros.value).toBe(Math.round(post * 0.4 * 100) / 100)
    expect(r.start).toEqual({
      kind: 'backup', fraction: 0.4, expected: 4, remaining: 10, pNext: 0.3, starts: 2, seasonPoints: 55.5,
      starterPrior: 15, starterValue: Math.round(post * 100) / 100, priorSource: 'live',
    })
  })

  it('zero starts → the prior unchanged at weight 0 (the share still applies)', () => {
    const r = buildScoringPosteriors(args({ currentSeasonTotals: totals([live('roo', 5, 20)]) })).get('roo')
    expect(r.ros.weight).toBe(0)
    expect(r.ros.value).toBe(Math.round(12 * 0.3 * 100) / 100)
    expect(r.start).toMatchObject({ starts: 0, starterValue: 12, fraction: 0.3 })
  })

  it('a frozen record uses the frozen starterPPG (priorSource frozen), and `next` for a rookie QB uses it too — never the live starter prior', () => {
    const frozenPrior = { status: 'ok', dateKey: '2026-09-13', players: { bk: 2.1, roo: 2.5 }, starterPPG: { bk: 14, roo: 11 } }
    const m = buildScoringPosteriors(args({ frozenPrior }))
    expect(m.get('bk')).toMatchObject({ frozen: true })
    expect(m.get('bk').start).toMatchObject({ starterPrior: 14, priorSource: 'frozen' })
    expect(m.get('bk').ros.prior).toBeCloseTo(14 * 0.4, 10)
    expect(m.get('roo').next).toMatchObject({ priorKind: 'projection', prior: 11 })          // frozen starterPPG, not 12 (live) or 2.5 (frozen projectedPPG)
    // frozen but this id missing from starterPPG → the live factor
    const m2 = buildScoringPosteriors(args({ frozenPrior: { ...frozenPrior, starterPPG: {} } }))
    expect(m2.get('bk').start).toMatchObject({ starterPrior: 15, priorSource: 'live' })
  })

  it('`next` for a rookie QB reads the live qbStarterPPG on a live record, with or without a live state', () => {
    expect(buildScoringPosteriors(args()).get('roo').next).toMatchObject({ priorKind: 'projection', prior: 12 })
    expect(buildScoringPosteriors(args({ qbLiveStates: new Map([['roo', state()]]) })).get('roo').next.prior).toBe(12)
  })

  it('a QB the share never touched has the same starter prior as today (to rounding): ros prior stays projPrior, `start` absent, original kind too', () => {
    const noStates = buildScoringPosteriors(args({ qbLiveStates: null }))
    expect(noStates.get('inc').ros.prior).toBe(20)
    expect(noStates.get('inc')).not.toHaveProperty('start')
    const orig = buildScoringPosteriors(args({ qbLiveStates: new Map([['inc', state({ kind: 'original', pNext: null, expected: null, fraction: null })]]) }))
    expect(orig.get('inc').ros.prior).toBe(20)
    expect(orig.get('inc')).not.toHaveProperty('start')
    expect(orig.get('inc').ros.value).toBe(Math.round(((20 * kQb + (140 / 7) * 7) / (kQb + 7)) * 100) / 100)
  })

  it('a preseason-`chain` QB with no live state emits NO record (null map, empty map, or no entry); a non-chain QB with none keeps today\'s record', () => {
    for (const qbLiveStates of [null, new Map(), new Map([['inc', state()]])]) {
      const m = buildScoringPosteriors(args({ qbLiveStates }))
      expect(m.has('bk'), String(qbLiveStates)).toBe(false)
      expect(m.has('nof')).toBe(false)
      expect(m.has('inc')).toBe(true)
    }
  })

  it('a preseason-`chain` QB whose live state is `original` builds his ROS on qbStarterPPG, not the chain prior; an `incumbent`-basis original is unchanged (fix pass 1)', () => {
    const orig = state({ kind: 'original', pNext: null, expected: null, fraction: null })
    const m = buildScoringPosteriors(args({ qbLiveStates: new Map([['bk', orig], ['inc', orig]]) }))
    expect(m.get('bk')).not.toHaveProperty('start')
    expect(m.get('bk').ros.value).toBe(Math.round(((15 * kQb + 11 * 7) / (kQb + 7)) * 100) / 100)   // prior 15 (starter), obs 77 / 7 = 11
    expect(m.get('inc').ros.value).toBe(Math.round(((20 * kQb + 20 * 7) / (kQb + 7)) * 100) / 100)  // projPrior 20 (basis incumbent)
  })

  it('start branch only for QBs: an RB with the same id shape is untouched', () => {
    const sp = { rb: { projectedPPG: 10, projectedGames: 16, factors: { qbStarterPPG: null, qbTakeoverBasis: 'none' } } }
    const m = buildScoringPosteriors(args({
      seasonProjections: sp, playerMap: { rb: { position: 'RB', years_exp: 5 } },
      careerStats: { 2025: { rb: row(16, 160) } }, currentSeasonTotals: totals([live('rb', 4, 60)]),
      qbLiveStates: new Map([['rb', state()]]),
    }))
    expect(m.get('rb')).not.toHaveProperty('start')
    expect(m.get('rb').ros.prior).toBe(10)
  })

  it('a rookie QB (ROOKIE0) on the start chain uses K_ROS_POINTS_ROOKIE0.QB', () => {
    const r = buildScoringPosteriors(args({ qbLiveStates: new Map([['roo', state({ starts: 3, startPoints: 60, fraction: 0.5, expected: 5 })]]) })).get('roo')
    expect(r.ros.k).toBe(K_ROS_POINTS_ROOKIE0.QB)
  })
})

describe('applyInSeasonProjection — a record with `start` (qb-takeover-wiring-b §3.3)', () => {
  const proj = { projectedPPG: 2.4, projectedGames: 16, projectedTotalPts: 38.4, confidence: 'high', factors: {}, adjustmentSummary: [] }
  const startRec = {
    season: 2026, n: 7, population: 'standard', frozen: false,
    ros: { prior: 6, k: 3, weight: 0.4, value: 6.63 },
    start: { kind: 'backup', fraction: 0.4, expected: 4, remaining: 10, pNext: 0.3, starts: 2, seasonPoints: 55.5, starterPrior: 15, starterValue: 16.58, priorSource: 'live' },
  }
  it('total = start.seasonPoints + starterValue × expected; season-totals fantasyPoints (deliberately different) is not read', () => {
    const out = applyInSeasonProjection({ q: proj }, new Map([['q', startRec]]), { season: 2026, complete: true, players: { q: { fantasyPoints: 999 } } })
    expect(out.q.projectedTotalPts).toBe(Math.round((55.5 + 16.58 * 4) * 10) / 10)
    expect(out.q.projectedPPG).toBe(6.6)
    expect(out.q.inSeason).toBe(startRec)
  })
  it('a record without `start` keeps the points-so-far + rate × remaining-games formula', () => {
    const rec = { season: 2026, n: 3, population: 'standard', frozen: true, ros: { prior: 10, k: 3, weight: 0.5, value: 9.4 }, next: { value: 1 } }
    const out = applyInSeasonProjection({ q: { ...proj, projectedGames: 14 } }, new Map([['q', rec]]), { season: 2026, complete: true, players: { q: { fantasyPoints: 30 } } })
    expect(out.q.projectedTotalPts).toBe(133.4)
  })
})

describe('buildProspectLevel — the rookie-QB sat-longer discount (qb-takeover-wiring-b §3.3)', () => {
  const league = 'league'
  const playerMap = {
    q0: { position: 'QB', years_exp: 0 }, q1: { position: 'QB', years_exp: 1 }, r0: { position: 'RB', years_exp: 0 }, q0b: { position: 'QB', years_exp: 0 },
  }
  const priors = { q0: 10, q1: 11, r0: 7, q0b: 9 }
  const states = new Map([
    ['q0', { satLonger: true }], ['q1', { satLonger: true }], ['r0', { satLonger: true }], ['q0b', { satLonger: false }],
  ])
  const base = { rookieDynastyPriors: priors, careerStats: { 2025: { q1: row(10, 100) } }, dataSeason: 2025, playerMap, projectionBasis: league,
    currentSeasonTotals: { season: 2026, complete: true, players: {} } }

  it('a QB projection entry with satLonger === true has prior × QB_SAT_LONGER_DISCOUNT and carries satLongerDiscount; nothing else does', () => {
    const m = buildProspectLevel({ ...base, qbLiveStates: states })
    expect(m.get('q0').prior).toBeCloseTo(10 * QB_SAT_LONGER_DISCOUNT, 10)
    expect(m.get('q0').satLongerDiscount).toBe(QB_SAT_LONGER_DISCOUNT)
    expect(m.get('q1').prior).toBeCloseTo(11 * QB_SAT_LONGER_DISCOUNT, 10)
    expect(m.get('q0b')).toMatchObject({ prior: 9 })                    // satLonger false
    expect(m.get('q0b')).not.toHaveProperty('satLongerDiscount')
    expect(m.get('r0')).toMatchObject({ prior: 7 })                     // not a QB
    expect(m.get('r0')).not.toHaveProperty('satLongerDiscount')
  })
  it('no qbLiveStates (null) → no discount anywhere; the discount constant is 0.9', () => {
    const m = buildProspectLevel({ ...base, qbLiveStates: null })
    expect(m.get('q0')).toMatchObject({ prior: 10 })
    expect(m.get('q0')).not.toHaveProperty('satLongerDiscount')
    expect(QB_SAT_LONGER_DISCOUNT).toBe(0.9)
  })
})

describe('module-load guard on the pinned QB hazard features (qb-takeover-wiring-b §3.3)', () => {
  it('throws at import if the pinned feature set includes one buildQbLiveStates does not build', async () => {
    vi.resetModules()
    vi.doMock('./qbTakeoverConstants', async importOriginal => {
      const real = await importOriginal()
      return { ...real, QB_HAZARD: { ...real.QB_HAZARD, features: [...real.QB_HAZARD.features, 'bn'] } }
    })
    try {
      await expect(import('./inSeasonScoring')).rejects.toThrow(/"bn" is not built by buildQbLiveStates/)
    } finally {
      vi.doUnmock('./qbTakeoverConstants')
      vi.resetModules()
    }
  })
})
