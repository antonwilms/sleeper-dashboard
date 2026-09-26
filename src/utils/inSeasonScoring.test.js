import { describe, it, expect } from 'vitest'
import {
  usableLiveSeason, posteriorOf, classifyInSeasonPopulation, selectFrozenPriorCandidate,
  checkFrozenSnapshot, trimFrozenSnapshot, buildScoringPosteriors,
} from './inSeasonScoring'
import { usableLiveSeason as evidenceUsable } from './inSeasonEvidence'
import { K_DYN_POINTS_HISTORY, K_DYN_POINTS_ROOKIE0, K_ROS_POINTS, K_ROS_POINTS_SHORT } from './inSeasonConstants'

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
