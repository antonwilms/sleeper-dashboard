import { describe, it, expect } from 'vitest'
import {
  opportunitiesPerGame, buildPriorSeasonContext, usableLiveSeason, buildInSeasonPosteriors,
  K_ROS_POINTS, K_ROS_OPP, MIN_BASELINE_GAMES, MIN_BASELINE_OPP,
} from './inSeasonEvidence'

// Synthetic fixtures only (the 2025 fixture carries no scoringBasis).
const HP = 'half_ppr'
const pRow = (gamesPlayed, stats, extra = {}) => ({ gamesPlayed, stats, fantasyPoints: 0, scoringBasis: HP, ...extra })

// Three WRs with 10 games at 5 / 8 / 10 opp/g → WR median 8. RBs at 4 / 6 / 8 → median 6.
function baseCareer() {
  return {
    2025: {
      wLo: pRow(10, { rec_tgt: 50 }), wMid: pRow(10, { rec_tgt: 80 }), wHi: pRow(10, { rec_tgt: 100 }),
      rA: pRow(10, { rush_att: 30, rec_tgt: 10 }), rB: pRow(10, { rush_att: 50, rec_tgt: 10 }), rC: pRow(10, { rush_att: 70, rec_tgt: 10 }),
      qb: pRow(16, { pass_att: 500, rush_att: 60 }),
      TEAM_KC: { gamesPlayed: 17, stats: { rec_tgt: 999 } },     // no scoringBasis, no skill position
      KC: { gamesPlayed: 17, stats: { rec_tgt: 999 } },
      k1: pRow(16, { rec_tgt: 999 }),
    },
  }
}
const basePlayerMap = {
  wLo: { position: 'WR' }, wMid: { position: 'WR' }, wHi: { position: 'WR' },
  rA: { position: 'RB' }, rB: { position: 'RB' }, rC: { position: 'RB' },
  qb: { position: 'QB' }, k1: { position: 'K' },
}
const live = (gamesPlayed, fantasyPoints, stats = {}, extra = {}) => ({ gamesPlayed, fantasyPoints, stats, scoringBasis: HP, ...extra })
const mkTotals = (players, extra = {}) => ({ season: 2026, complete: true, players, ...extra })
const row = (player_id, position, projectedPPG) => ({ player_id, position, projectedPPG })

function run({ rows, players, career = baseCareer(), pmap = basePlayerMap, totals }) {
  return buildInSeasonPosteriors({
    playerRows: rows, careerStats: career, dataSeason: 2025, playerMap: pmap,
    currentSeasonTotals: totals ?? mkTotals(players),
  })
}
const get = (res, id) => res.byId.get(id)

describe('opportunitiesPerGame (test 8)', () => {
  it('QB = pass_att + rush_att; RB/WR/TE = rush_att + rec_tgt', () => {
    expect(opportunitiesPerGame({ gamesPlayed: 2, stats: { pass_att: 60, rush_att: 4, rec_tgt: 99 } }, 'QB')).toBe(32) // 64/2
    expect(opportunitiesPerGame({ gamesPlayed: 2, stats: { pass_att: 60, rush_att: 10, rec_tgt: 4 } }, 'RB')).toBe(7)  // 14/2
    expect(opportunitiesPerGame({ gamesPlayed: 2, stats: { rush_att: 1, rec_tgt: 9 } }, 'WR')).toBe(5)
    expect(opportunitiesPerGame({ gamesPlayed: 2, stats: { rec_tgt: 6 } }, 'TE')).toBe(3)
  })
  it('an absent key counts 0 under gamesPlayed > 0; a present non-finite key is null', () => {
    expect(opportunitiesPerGame({ gamesPlayed: 4, stats: {} }, 'WR')).toBe(0)
    expect(opportunitiesPerGame({ gamesPlayed: 4, stats: { rec_tgt: 'x' } }, 'WR')).toBeNull()
    expect(opportunitiesPerGame({ gamesPlayed: 4, stats: { rec_tgt: NaN } }, 'WR')).toBeNull()
  })
  it('gamesPlayed 0 / missing row / other position → null', () => {
    expect(opportunitiesPerGame({ gamesPlayed: 0, stats: { rec_tgt: 3 } }, 'WR')).toBeNull()
    expect(opportunitiesPerGame(null, 'WR')).toBeNull()
    expect(opportunitiesPerGame({ gamesPlayed: 3, stats: {} }, 'K')).toBeNull()
  })
})

describe('buildPriorSeasonContext (test 3)', () => {
  it('medians per position over ≥8-game skill rows; K, TEAM_ and DEF rows excluded', () => {
    const ctx = buildPriorSeasonContext(baseCareer(), 2025, basePlayerMap)
    expect(ctx.medians.WR).toBe(8)   // 5, 8, 10
    expect(ctx.medians.RB).toBe(6)   // 4, 6, 8
    expect(ctx.medians.TE).toBeNull()
    expect(ctx.seasonBasis).toBe(HP) // TEAM_KC / KC without a basis do not spoil it
  })
  it('a 7-game WR is excluded from the median; even-length median is the mean of the middle two', () => {
    const career = baseCareer()
    career[2025].w7 = pRow(7, { rec_tgt: 700 })
    career[2025].w4 = pRow(10, { rec_tgt: 20 })
    const pmap = { ...basePlayerMap, w7: { position: 'WR' }, w4: { position: 'WR' } }
    const ctx = buildPriorSeasonContext(career, 2025, pmap)
    expect(ctx.medians.WR).toBe(6.5) // 2, 5, 8, 10 → (5+8)/2
  })
  it('seasonBasis is null when a skill row lacks it or two values disagree (5c)', () => {
    const c1 = baseCareer(); delete c1[2025].wLo.scoringBasis
    expect(buildPriorSeasonContext(c1, 2025, basePlayerMap).seasonBasis).toBeNull()
    const c2 = baseCareer(); c2[2025].wLo.scoringBasis = 'ppr'
    expect(buildPriorSeasonContext(c2, 2025, basePlayerMap).seasonBasis).toBeNull()
  })
})

describe('usableLiveSeason (test 10)', () => {
  it('requires complete, a finite season, and season > dataSeason', () => {
    expect(usableLiveSeason({ season: 2026, complete: false }, 2025)).toBe(false)
    expect(usableLiveSeason({ season: 2025, complete: true }, 2025)).toBe(false)
    expect(usableLiveSeason({ season: NaN, complete: true }, 2025)).toBe(false)
    expect(usableLiveSeason({ season: 2026, complete: true }, undefined)).toBe(false)
    expect(usableLiveSeason(null, 2025)).toBe(false)
    expect(usableLiveSeason({ season: 2026, complete: true }, 2025)).toBe(true)
  })
  it('builder returns null when unusable; otherwise season, priorSeason, maxGames', () => {
    expect(run({ rows: [], totals: { season: 2026, complete: false, players: {} } })).toBeNull()
    const res = run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60) } })
    expect(res.liveSeason).toBe(2026)
    expect(res.priorSeason).toBe(2025)
    expect(res.maxGames).toBe(3)
  })
})

describe('the blend (tests 1, 2, 4)', () => {
  it('formula: strong WR, proj 10, 3 games at 20 ppg → weight 3/8, ROS 13.75; dynasty k 6.5', () => {
    const res = run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, { rec_tgt: 30 }) } })
    const r = get(res, 'wHi')
    expect(r.band).toBe('strong')
    expect(r.ppg).toBe(20)
    expect(r.rosWeight).toBe(0.375)         // 3/(3+5)
    expect(r.rosPpg).toBe(13.75)            // 10 + 0.375·10
    expect(r.dynWeight).toBeCloseTo(3 / 9.5, 12)
    expect(r.dynPpg).toBeCloseTo(10 + (3 / 9.5) * 10, 12)
  })
  it('band: WR below median k 3.5, at/above k 5; RB k 3 both; QB flat 6, band null', () => {
    const res = run({
      rows: [row('wLo', 'WR', 10), row('wMid', 'WR', 10), row('rA', 'RB', 10), rowFor('rC'), row('qb', 'QB', 10)],
      players: {
        wLo: live(3, 60, { rec_tgt: 9 }), wMid: live(3, 60, { rec_tgt: 9 }),
        rA: live(3, 60, { rush_att: 9 }), rC: live(3, 60, { rush_att: 9 }), qb: live(3, 60, { pass_att: 90 }),
      },
    })
    expect(get(res, 'wLo').band).toBe('weak');    expect(get(res, 'wLo').rosWeight).toBeCloseTo(3 / 6.5, 12)
    expect(get(res, 'wMid').band).toBe('strong'); expect(get(res, 'wMid').rosWeight).toBe(0.375) // 8 is at the median
    expect(get(res, 'rA').band).toBe('weak');     expect(get(res, 'rA').rosWeight).toBe(0.5)      // 3/(3+3)
    expect(get(res, 'rC').band).toBe('strong');   expect(get(res, 'rC').rosWeight).toBe(0.5)
    expect(get(res, 'qb').band).toBeNull();       expect(get(res, 'qb').rosWeight).toBeCloseTo(3 / (3 + K_ROS_POINTS.QB), 12)
    function rowFor(id) { return row(id, 'RB', 10) }
  })
  it('n = 0: a 0-game live row and a missing live row both give weight 0 and the prior, no observed values', () => {
    const res = run({ rows: [row('wHi', 'WR', 12.5), row('wMid', 'WR', 9)], players: { wHi: live(0, 0) } })
    for (const id of ['wHi', 'wMid']) {
      const r = get(res, id)
      expect(r.ppg).toBeNull(); expect(r.oppNow).toBeNull()
      expect(r.rosWeight).toBe(0)
      expect(r.rosPpg).toBe(r.proj)
    }
    expect(get(res, 'wHi').rosPpg).toBe(12.5)
  })
})

describe('extrapolated players (tests 3, 5)', () => {
  it('a rookie WR (no prior row) is extrapolated, weak band, k 3.5; dynasty uses the flat 6.5', () => {
    const res = run({ rows: [row('rk', 'WR', 8)], players: { rk: live(2, 28, { rec_tgt: 10 }) }, pmap: { ...basePlayerMap, rk: { position: 'WR' } } })
    const r = get(res, 'rk')
    expect(r.extrapolated).toBe(true); expect(r.band).toBe('weak')
    expect(r.rosWeight).toBeCloseTo(2 / 5.5, 12)
    expect(r.rosPpg).toBeCloseTo(8 + (2 / 5.5) * (14 - 8), 12)
    expect(r.dynWeight).toBeCloseTo(2 / 8.5, 12)
  })
  it('a rookie QB uses the flat QB k (6), band null, still extrapolated', () => {
    const res = run({ rows: [row('rq', 'QB', 15)], players: { rq: live(2, 40, { pass_att: 60 }) }, pmap: { ...basePlayerMap, rq: { position: 'QB' } } })
    const r = get(res, 'rq')
    expect(r.extrapolated).toBe(true); expect(r.band).toBeNull()
    expect(r.rosWeight).toBe(0.25) // 2/(2+6)
  })
  it('exactly 8 prior games is not extrapolated; 7 is — and a 7-game WR still gets a posterior', () => {
    const career = baseCareer()
    career[2025].v8 = pRow(8, { rec_tgt: 40 }); career[2025].v7 = pRow(7, { rec_tgt: 35 })
    const pmap = { ...basePlayerMap, v8: { position: 'WR' }, v7: { position: 'WR' } }
    const res = run({ rows: [row('v8', 'WR', 10), row('v7', 'WR', 10)], players: { v8: live(2, 30), v7: live(2, 30) }, career, pmap })
    expect(get(res, 'v8').extrapolated).toBe(false)
    expect(get(res, 'v7').extrapolated).toBe(true)
    expect(get(res, 'v7').band).toBe('weak')
    expect(get(res, 'v7').rosWeight).toBeCloseTo(2 / 5.5, 12)
  })
})

describe('opportunity baseline and new role (5a, 5b, 7, 9)', () => {
  const baselineOf = (games, opps, live2 = live(2, 20, { rush_att: 4 })) => {
    const career = baseCareer(); career[2025].x = pRow(games, { rush_att: opps })
    const res = run({ rows: [row('x', 'RB', 10)], players: { x: live2 }, career, pmap: { ...basePlayerMap, x: { position: 'RB' } } })
    return get(res, 'x')
  }
  it('boundaries are inclusive: 4 games at 2.0 opp/g is a baseline', () => {
    const r = baselineOf(MIN_BASELINE_GAMES, MIN_BASELINE_OPP * MIN_BASELINE_GAMES)
    expect(r.hasBaseline).toBe(true)
    expect(typeof r.oppShift).toBe('number')
  })
  it('3 games at 5.0, and 10 games at 1.9 opp/g, are not baselines → opportunity posterior and shift null', () => {
    for (const r of [baselineOf(3, 15), baselineOf(10, 19)]) {
      expect(r.hasBaseline).toBe(false)
      expect(r.rosOpp).toBeNull(); expect(r.dynOpp).toBeNull(); expect(r.oppShift).toBeNull()
    }
  })
  it('no prior row → no baseline', () => {
    const res = run({ rows: [row('nb', 'RB', 10)], players: { nb: live(2, 20, { rush_att: 12 }) }, pmap: { ...basePlayerMap, nb: { position: 'RB' } } })
    expect(get(res, 'nb').hasBaseline).toBe(false)
    expect(get(res, 'nb').oppShift).toBeNull()
  })
  it('oppShift = rosOpp − oppPrior with sign: 2 → 12 opp/g over 2 games, RB k 2 → rosOpp 7, shift +5', () => {
    const r = baselineOf(10, 20, live(2, 30, { rush_att: 24 }))
    expect(r.oppPrior).toBe(2)
    expect(r.rosOppWeight).toBe(0.5)
    expect(r.rosOpp).toBe(7)
    expect(r.oppShift).toBe(5)
    expect(r.oppShiftSort).toBe(r.oppShift)
    expect(r.newRole).toBe(false)
  })
  it('a sign is preserved on a decline', () => {
    const r = baselineOf(10, 100, live(2, 5, { rush_att: 2 })) // prior 10, now 1 → rosOpp 5.5
    expect(r.oppShift).toBe(-4.5)
  })
  it('new role: no baseline, 2 games, 6.0 opp/g → newRole, sort key 0.5 × 6.0 = 3.0', () => {
    const r = baselineOf(2, 8, live(2, 12, { rush_att: 12 })) // prior 2 games → no baseline
    expect(r.newRole).toBe(true)
    expect(r.oppShiftSort).toBe(3)
    expect(r.oppShift).toBeNull()
  })
  it('new role at exactly 2.0 opp/g; 1.5 is not a new role and has no sort key; n = 0 is not one', () => {
    expect(baselineOf(2, 8, live(2, 12, { rush_att: 4 })).newRole).toBe(true)
    const low = baselineOf(2, 8, live(2, 12, { rush_att: 3 }))
    expect(low.newRole).toBe(false); expect(low.oppShiftSort).toBeNull()
    expect(baselineOf(2, 8, live(0, 0)).newRole).toBe(false)
  })
})

describe('season basis and mismatch (5c, 6)', () => {
  const rookie = (career, liveRow) => {
    const res = run({ rows: [row('rk', 'WR', 8)], players: { rk: liveRow }, career, pmap: { ...basePlayerMap, rk: { position: 'WR' } } })
    return get(res, 'rk')
  }
  it('a rookie computes when every 2025 skill row shares the basis; a TEAM_ row without it does not matter', () => {
    expect(rookie(baseCareer(), live(2, 28)).rosPpg).not.toBeNull()
  })
  it('a rookie has no posterior when the season basis is unresolved; a veteran with its own matching row is unaffected', () => {
    const c = baseCareer(); delete c[2025].wLo.scoringBasis
    expect(rookie(c, live(2, 28)).rosPpg).toBeNull()
    const res = run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(2, 30) }, career: c })
    expect(get(res, 'wHi').rosPpg).not.toBeNull()
  })
  it('prior basis absent, or different from live → every posterior null; observed fields still fill', () => {
    const c1 = baseCareer(); delete c1[2025].wHi.scoringBasis
    const c2 = baseCareer(); c2[2025].wHi.scoringBasis = 'ppr'
    for (const career of [c1, c2]) {
      const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, { rec_tgt: 30 }) }, career }), 'wHi')
      for (const f of ['rosPpg', 'rosWeight', 'dynPpg', 'dynWeight', 'rosOpp', 'dynOpp', 'oppShift', 'oppShiftSort']) expect(r[f]).toBeNull()
      expect(r.ppg).toBe(20); expect(r.oppNow).toBe(10)
    }
  })
  it('live row without scoringBasis → no posterior', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, {}, { scoringBasis: undefined }) } }), 'wHi')
    expect(r.rosPpg).toBeNull()
  })
})

describe('null handling (7, 11)', () => {
  it('proj null → points posteriors null, opportunity posterior and shift still computed', () => {
    const r = get(run({ rows: [row('wHi', 'WR', null)], players: { wHi: live(2, 30, { rec_tgt: 30 }) } }), 'wHi')
    expect(r.rosPpg).toBeNull(); expect(r.dynPpg).toBeNull(); expect(r.rosWeight).toBeNull()
    expect(r.rosOpp).not.toBeNull(); expect(r.oppShift).not.toBeNull()
  })
  it('n > 0 with non-finite fantasyPoints → ppg and every points posterior null, not the prior', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(2, NaN, { rec_tgt: 20 }) } }), 'wHi')
    expect(r.ppg).toBeNull()
    for (const f of ['rosPpg', 'rosWeight', 'dynPpg', 'dynWeight']) expect(r[f]).toBeNull()
  })
  it('a garbage stat key → oppNow, rosOpp and oppShift null', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(2, 30, { rec_tgt: 'x' }) } }), 'wHi')
    expect(r.oppNow).toBeNull(); expect(r.rosOpp).toBeNull(); expect(r.oppShift).toBeNull()
  })
  it('every non-null posterior across a mixed set is finite', () => {
    const rows = [row('wHi', 'WR', 10), row('wLo', 'WR', null), row('rA', 'RB', 7), row('qb', 'QB', 20), row('none', 'WR', 5)]
    const res = run({ rows, players: { wHi: live(2, NaN), wLo: live(3, 40, { rec_tgt: 20 }), rA: live(0, 0), qb: live(2, 40, { pass_att: 70 }) } })
    for (const r of res.byId.values()) {
      for (const f of ['rosPpg', 'rosWeight', 'dynPpg', 'dynWeight', 'rosOpp', 'rosOppWeight', 'dynOpp', 'dynOppWeight', 'oppShift', 'oppShiftSort']) {
        if (r[f] != null) expect(Number.isFinite(r[f])).toBe(true)
      }
    }
  })
})

describe('purity and row scoping (12, 13)', () => {
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze) } return o }
  it('leaves frozen playerRows / careerStats / currentSeasonTotals untouched', () => {
    const rows = [row('wHi', 'WR', 10), row('rk', 'WR', 8)]
    const career = baseCareer()
    const totals = mkTotals({ wHi: live(3, 60, { rec_tgt: 30 }), rk: live(2, 28) })
    const before = structuredClone({ rows, career, totals })
    deepFreeze(rows); deepFreeze(career); deepFreeze(totals)
    const res = buildInSeasonPosteriors({
      playerRows: rows, careerStats: career, dataSeason: 2025,
      playerMap: { ...basePlayerMap, rk: { position: 'WR' } }, currentSeasonTotals: totals,
    })
    expect(res.byId.size).toBe(2)
    expect({ rows, career, totals }).toEqual(before)
  })
  it('maxGames ignores live DEF and TEAM_ rows', () => {
    const res = run({
      rows: [row('wHi', 'WR', 10), row('rA', 'RB', 7)],
      players: { wHi: live(2, 30), rA: live(2, 20), KC: { gamesPlayed: 3, stats: {} }, TEAM_KC: { gamesPlayed: 3, stats: {} } },
    })
    expect(res.maxGames).toBe(2)
  })
  it('exposes K_ROS_OPP for the shrunk new-role key', () => {
    expect(K_ROS_OPP.RB).toBe(2)
  })
})
