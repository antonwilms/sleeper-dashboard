import { describe, it, expect, vi } from 'vitest'

// sleeperStats.js pulls the cache / data-store modules at import; nothing here touches them.
vi.mock('../utils/cache', () => ({
  getCache: vi.fn(), setCache: vi.fn(), getCacheRecord: vi.fn(), setCacheWithMeta: vi.fn(),
}))
vi.mock('../api/dataStore', () => ({
  tryDataStore: vi.fn(), getManifestEntry: vi.fn(), isValidSeasonTotals: vi.fn(),
}))
import { rescoreSeasonTotals } from '../api/sleeperStats'
import {
  opportunitiesPerGame, buildPriorSeasonContext, usableLiveSeason, buildInSeasonPosteriors,
  MIN_BASELINE_GAMES, MIN_BASELINE_OPP,
} from './inSeasonEvidence'
import { K_ROS_OPP } from './inSeasonConstants'

// Synthetic fixtures only (the 2025 fixture carries no scoringBasis).
const HP = 'half_ppr'
const pRow = (gamesPlayed, stats, extra = {}) => ({ gamesPlayed, stats, fantasyPoints: 0, scoringBasis: HP, ...extra })

// Skill rows for the eligibility / basis cases; TEAM_ and DEF rows carry no scoringBasis and no position.
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

describe('buildPriorSeasonContext', () => {
  it('shrunk to seasonBasis: the one label every skill row carries; K, TEAM_ and DEF rows do not spoil it', () => {
    expect(buildPriorSeasonContext(baseCareer(), 2025, basePlayerMap)).toEqual({ seasonBasis: HP })
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

describe('the result no longer carries the points posterior or the band', () => {
  it('exact key set', () => {
    const res = run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, { rec_tgt: 30 }) } })
    expect(Object.keys(get(res, 'wHi')).sort()).toEqual([
      'baselineSeason', 'games', 'hasBaseline', 'newRole', 'oppNow', 'oppPrior', 'oppShift', 'oppShiftRel',
      'oppShiftSort', 'ppg', 'rosOpp', 'rosOppWeight',
    ])
  })
})

describe('opportunity baseline B — lookback (verdict Q5 arm B)', () => {
  const pm = { ...basePlayerMap, x: { position: 'RB' } }
  const withHistory = (hist, liveRow = live(2, 20, { rush_att: 4 })) => {
    const career = baseCareer()
    for (const [y, r] of Object.entries(hist)) (career[y] ??= {}).x = r
    const res = run({ rows: [row('x', 'RB', 10)], players: { x: liveRow }, career, pmap: pm })
    return get(res, 'x')
  }
  it('finds 2023 when 2025 has gp 2 and 2024 is absent', () => {
    const r = withHistory({ 2025: pRow(2, { rush_att: 40 }), 2023: pRow(12, { rush_att: 96 }) })
    expect(r.baselineSeason).toBe(2023)
    expect(r.oppPrior).toBe(8)           // 96/12
    expect(r.hasBaseline).toBe(true)
  })
  it('takes the most recent qualifying season, not the best one', () => {
    const r = withHistory({ 2025: pRow(10, { rush_att: 50 }), 2024: pRow(16, { rush_att: 300 }) })
    expect(r.baselineSeason).toBe(2025)
    expect(r.oppPrior).toBe(5)
  })
  it('stops at 2025 (gp 5, opp 1.2) — no baseline, even though 2024 had a big role', () => {
    const r = withHistory({ 2025: pRow(5, { rush_att: 6 }), 2024: pRow(16, { rush_att: 300 }) })
    expect(r.baselineSeason).toBe(2025)
    expect(r.oppPrior).toBeCloseTo(1.2, 12)
    expect(r.hasBaseline).toBe(false)
    expect(r.oppShift).toBeNull(); expect(r.oppShiftSort).toBeNull()
  })
  it('looks back three seasons only: a 2022 season is out of range → baselineSeason null', () => {
    const r = withHistory({ 2022: pRow(16, { rush_att: 300 }) })
    expect(r.baselineSeason).toBeNull()
    expect(r.oppPrior).toBeNull()
    expect(r.hasBaseline).toBe(false)
  })
  it('boundaries are inclusive: gp 4 at 2.0 opp/g is a baseline; gp 3 is not a season at all', () => {
    const ok = withHistory({ 2025: pRow(MIN_BASELINE_GAMES, { rush_att: MIN_BASELINE_OPP * MIN_BASELINE_GAMES }) })
    expect(ok.hasBaseline).toBe(true)
    const three = withHistory({ 2025: pRow(3, { rush_att: 15 }), 2024: pRow(16, { rush_att: 160 }) })
    expect(three.baselineSeason).toBe(2024)    // gp 3 does not stop the search
  })
})

describe('opportunity shift — relative (verdict Q6) and new role', () => {
  const pm = { ...basePlayerMap, x: { position: 'RB' } }
  const one = (priorRow, liveRow) => {
    const career = baseCareer(); if (priorRow) career[2025].x = priorRow
    return get(run({ rows: [row('x', 'RB', 10)], players: { x: liveRow }, career, pmap: pm }), 'x')
  }
  it('oppShiftRel = oppShift / oppPrior: WR (K_ROS_OPP 3), prior 10, now 15, n 3 → weight 0.5, rosOpp 12.5, shift 2.5, rel 0.25', () => {
    expect(K_ROS_OPP.WR).toBe(3)
    const career = baseCareer(); career[2025].w = pRow(10, { rec_tgt: 100 })
    const res = run({ rows: [row('w', 'WR', 10)], players: { w: live(3, 30, { rec_tgt: 45 }) }, career, pmap: { ...basePlayerMap, w: { position: 'WR' } } })
    const r = get(res, 'w')
    expect(r.rosOppWeight).toBe(0.5)
    expect(r.rosOpp).toBe(12.5)
    expect(r.oppShift).toBe(2.5)
    expect(r.oppShiftRel).toBe(0.25)
    expect(r.oppShiftSort).toBe(0.25)
  })
  it('RB uses its own pinned k', () => {
    const w = 3 / (3 + K_ROS_OPP.RB)
    const r = one(pRow(10, { rush_att: 100 }), live(3, 30, { rush_att: 45 }))
    expect(r.rosOppWeight).toBeCloseTo(w, 12)
    expect(r.oppShiftRel).toBeCloseTo((w * 5) / 10, 12)
  })
  it('the same shift on a smaller base is a bigger relative shift (why the sort is relative)', () => {
    const big = one(pRow(10, { rush_att: 200 }), live(2, 30, { rush_att: 30 }))     // prior 20 → now 15
    const small = one(pRow(10, { rush_att: 50 }), live(2, 30, { rush_att: 20 }))    // prior 5 → now 10
    expect(big.oppShiftRel).toBeLessThan(0)
    expect(small.oppShiftRel).toBeGreaterThan(0)
    expect(Math.abs(small.oppShiftRel)).toBeGreaterThan(Math.abs(big.oppShiftRel))
  })
  it('a sign is preserved on a decline', () => {
    const r = one(pRow(10, { rush_att: 100 }), live(2, 5, { rush_att: 2 }))
    expect(r.oppShift).toBeLessThan(0); expect(r.oppShiftRel).toBeLessThan(0)
  })
  it('n = 0: shift and relative shift withheld; rosOpp keeps the prior at weight 0', () => {
    const r = one(pRow(10, { rush_att: 100 }), live(0, 0))
    expect(r.oppShift).toBeNull(); expect(r.oppShiftRel).toBeNull(); expect(r.oppShiftSort).toBeNull()
    expect(r.rosOpp).toBe(r.oppPrior); expect(r.rosOppWeight).toBe(0)
  })
  it('newRole (no baseline, 6.0 opp/g now) renders its chip but its sort value is null', () => {
    const r = one(pRow(2, { rush_att: 8 }), live(2, 12, { rush_att: 12 }))
    expect(r.newRole).toBe(true)
    expect(r.oppShiftSort).toBeNull()
    expect(r.oppShiftRel).toBeNull()
  })
  it('newRole at exactly 2.0 opp/g; 1.5 is not one; n = 0 is not one', () => {
    expect(one(pRow(2, { rush_att: 8 }), live(2, 12, { rush_att: 4 })).newRole).toBe(true)
    expect(one(pRow(2, { rush_att: 8 }), live(2, 12, { rush_att: 3 })).newRole).toBe(false)
    expect(one(pRow(2, { rush_att: 8 }), live(0, 0)).newRole).toBe(false)
  })
  it('no prior row anywhere → no baseline, no shift', () => {
    const r = one(null, live(2, 20, { rush_att: 12 }))
    expect(r.hasBaseline).toBe(false); expect(r.baselineSeason).toBeNull()
    expect(r.rosOpp).toBeNull(); expect(r.oppShift).toBeNull()
  })
  // Fix pass 1 item 7: eligibility for newRole when the player has no prior-season row of its own —
  // the guard then falls back to the whole season's single scoring basis (buildPriorSeasonContext).
  it('no prior row, season basis matches the live row, oppNow ≥ 2.0 → newRole true', () => {
    // baseCareer's skill rows are uniformly half_ppr, so seasonBasis = HP; live also HP.
    const r = one(null, live(2, 20, { rush_att: 12 }))   // oppNow = 6.0
    expect(r.newRole).toBe(true)
  })
  it('no prior row, a mixed season basis (two skill rows disagree) → no newRole, no shift', () => {
    const career = baseCareer()
    career[2025].wLo.scoringBasis = 'ppr'   // wMid/wHi/rA/rB/rC/qb stay half_ppr → mixed → seasonBasis null
    const r = get(run({ rows: [row('x', 'RB', 10)], players: { x: live(2, 20, { rush_att: 12 }) }, career, pmap: pm }), 'x')
    expect(r.oppNow).toBe(6)
    expect(r.newRole).toBe(false)
    expect(r.oppShiftSort).toBeNull()
  })
  it('a basis-mismatched, no-baseline row never gets newRole (fix pass 1, item 1)', () => {
    const r = one(null, { ...live(2, 20, { rush_att: 12 }), scoringBasis: 'ppr' })
    expect(r.oppNow).toBe(6)
    expect(r.newRole).toBe(false)
  })
  it('a basis-mismatched baseline row gets no opportunity blend either', () => {
    const r = one(pRow(10, { rush_att: 100 }), { ...live(3, 30, { rush_att: 45 }), scoringBasis: 'ppr' })
    expect(r.hasBaseline).toBe(true)
    expect(r.rosOpp).toBeNull(); expect(r.oppShift).toBeNull()
    expect(r.ppg).toBe(10); expect(r.oppNow).toBe(15)     // observed fields still fill
  })
})

describe('season basis (5c, 6)', () => {
  it('prior basis absent → the eligibility guard refuses the blend; observed fields still fill', () => {
    const c = baseCareer(); delete c[2025].wHi.scoringBasis
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, { rec_tgt: 30 }) }, career: c }), 'wHi')
    expect(r.rosOpp).toBeNull(); expect(r.oppShift).toBeNull()
    expect(r.ppg).toBe(20); expect(r.oppNow).toBe(10)
  })
  it('live row without scoringBasis → no blend', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(3, 60, { rec_tgt: 30 }, { scoringBasis: undefined }) } }), 'wHi')
    expect(r.rosOpp).toBeNull()
  })
})

describe('null handling (7, 11)', () => {
  it('n > 0 with non-finite fantasyPoints → ppg null; the opportunity blend is independent of points', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(2, NaN, { rec_tgt: 20 }) } }), 'wHi')
    expect(r.ppg).toBeNull()
    expect(r.oppNow).toBe(10)
    expect(r.rosOpp).not.toBeNull()
  })
  it('a garbage stat key → oppNow, rosOpp and oppShift null', () => {
    const r = get(run({ rows: [row('wHi', 'WR', 10)], players: { wHi: live(2, 30, { rec_tgt: 'x' }) } }), 'wHi')
    expect(r.oppNow).toBeNull(); expect(r.rosOpp).toBeNull(); expect(r.oppShift).toBeNull()
  })
  it('every non-null number across a mixed set is finite', () => {
    const rows = [row('wHi', 'WR', 10), row('wLo', 'WR', null), row('rA', 'RB', 7), row('qb', 'QB', 20), row('none', 'WR', 5)]
    const res = run({ rows, players: { wHi: live(2, NaN), wLo: live(3, 40, { rec_tgt: 20 }), rA: live(0, 0), qb: live(2, 40, { pass_att: 70 }) } })
    for (const r of res.byId.values()) {
      for (const f of ['ppg', 'oppNow', 'oppPrior', 'rosOpp', 'rosOppWeight', 'oppShift', 'oppShiftRel', 'oppShiftSort']) {
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
})


// season-rescore.md §3.7/§4.3 — both sides of the gate go through the real seam.
describe('league-scored gate (season-rescore)', () => {
  const SETTINGS = { rec: 0.5, rec_yd: 0.1 }
  const wrLive = () => ({ wHi: live(3, 30, { rec: 10, rec_yd: 100, rec_tgt: 24 }) })
  const rescoredCareer = () => ({ 2025: rescoreSeasonTotals(baseCareer()[2025], SETTINGS, basePlayerMap) })
  const rescoredLive = () => rescoreSeasonTotals(wrLive(), SETTINGS, basePlayerMap)

  it('prior and live both rescored → the blend runs, leagueScored true, the live row renders its rescored points', () => {
    const res = run({ rows: [row('wHi', 'WR', 10)], players: rescoredLive(), career: rescoredCareer() })
    expect(res.leagueScored).toBe(true)
    expect(get(res, 'wHi').rosOpp).not.toBeNull()
    // (10 × 0.5 + 100 × 0.1) / 3 games = 5
    expect(get(res, 'wHi').ppg).toBe(5)
  })

  it('prior rescored, live raw → the gate refuses (league vs half_ppr): no blend, leagueScored false', () => {
    const res = run({ rows: [row('wHi', 'WR', 10)], players: wrLive(), career: rescoredCareer() })
    expect(res.leagueScored).toBe(false)
    expect(get(res, 'wHi').rosOpp).toBeNull()
  })

  it('both raw → leagueScored false, blend present (both half_ppr)', () => {
    const res = run({ rows: [row('wHi', 'WR', 10)], players: wrLive() })
    expect(res.leagueScored).toBe(false)
    expect(get(res, 'wHi').rosOpp).not.toBeNull()
  })
})
