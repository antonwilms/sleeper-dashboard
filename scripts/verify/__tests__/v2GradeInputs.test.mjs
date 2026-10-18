import { describe, it, expect } from 'vitest'
import { inTolerance, compareTeamTotal, eligibleWeeks, refEfficiency, signedDistribution, runV2, summarizeV2 } from '../lib/v2GradeInputs.mjs'

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

// Minimal fixture: KC + BUF, one WR (w1) traded KC→BUF whose season row sits on KC, two KC WR teammates.
// Gamelog targets: w1 10 (KC) + 30 (BUF) = 40, w2 30, w3 20. The app's w3 row is 1 target high (21).
function fixtureCtx() {
  const game = (week, team, targets, receptions) => ({ week, seasonType: 'REG', team, targets, receptions })
  const row = (recTgt, rec) => ({ gamesPlayed: 17, team: 'KC', stats: { rec_tgt: recTgt, rec } })
  return {
    seasons: [2024],
    playersMap: { w1: { position: 'WR', team: 'KC' }, w2: { position: 'WR', team: 'KC' }, w3: { position: 'WR', team: 'KC' } },
    careerStats: { 2024: { w1: row(40, 28), w2: row(30, 24), w3: row(21, 16) } },
    gamelogs: { 2024: { unmapped: 0, players: {
      w1: { games: [game(1, 'KC', 10, 8), game(2, 'BUF', 30, 20)] },
      w2: { games: [game(1, 'KC', 30, 24)] },
      w3: { games: [game(1, 'KC', 20, 16)] },
    } } },
    teamcontext: { 2024: { teams: {} } }, snaps: { 2024: { players: {} } }, rosterweekly: { 2024: { players: {} } },
  }
}

describe('runV2 V2.6 on ex-traded denominators', () => {
  const res = runV2(fixtureCtx())
  const v26 = res.outOfTolerance.filter(r => r.check === 'V2.6')
  it('lists the traded WR and keeps him out of every V2.6 row', () => {
    expect(res.traded.some(t => t.check === 'V2.6' && t.pid === 'w1' && t.season === 2024)).toBe(true)
    expect(v26.some(r => r.pid === 'w1')).toBe(false)
    expect(res.series['V2.6|wrTeShare'].bySeason[2024]).toEqual({ compared: 2, out: 2 })
  })
  it('compares teammates on ex-traded denominators (hand-computed shares)', () => {
    // app: 30/(30+21) = 0.588, 21/51 = 0.412; reference: 30/50 = 0.6, 20/50 = 0.4
    const by = Object.fromEntries(v26.map(r => [r.pid, r]))
    expect(by.w2.app).toBe(0.588); expect(by.w2.ref).toBe(0.6)
    expect(by.w3.app).toBe(0.412); expect(by.w3.ref).toBe(0.4)
  })
  it('measures the G3 effect separately: as-run share minus ex-traded share', () => {
    // as-run KC denominator 40 + 30 + 21 = 91 → 0.33 and 0.231
    const b = res.series['V2.6-g3effect|share'].bySeason[2024]
    expect(b.compared).toBe(2)
    expect(b.maxAbs).toBeCloseTo(0.258, 6)
    expect(b.sumAbs / b.compared).toBeCloseTo((0.258 + 0.181) / 2, 6)
  })
})

describe('summarizeV2 verdicts are mechanical', () => {
  const info = { doubling: [], unexplainedLarge: {}, rz: {} }
  const ser = (check, out, compared = 1000, metric = 'm') => ({ [`${check}|${metric}`]: { check, metric, bySeason: { 2024: { compared, out } } } })
  it('2.0% passes, 2.1% is a defect', () => {
    expect(summarizeV2(ser('V2.6', 20), info)['V2.6'].verdict).toBe('pass')
    expect(summarizeV2(ser('V2.6', 21), info)['V2.6'].verdict).toBe('defect')
  })
  it('a non-empty doubling list forces V2.4 to defect', () => {
    expect(summarizeV2(ser('V2.4', 0), { ...info, doubling: [{ team: 'KC' }] })['V2.4'].verdict).toBe('defect')
  })
  it('V2.10 with over1 teams is a gap', () => {
    expect(summarizeV2(ser('V2.10', 0), { ...info, rz: { 2024: { over1: ['KC'] } } })['V2.10'].verdict).toBe('gap')
  })
  it('a *-effect series never changes a verdict', () => {
    const series = { ...ser('V2.6', 0), ...ser('V2.6-g3effect', 900, 1000, 'share') }
    const out = summarizeV2(series, info)
    expect(out['V2.6'].verdict).toBe('pass')
    expect(out['V2.6-g3effect']).toBeUndefined()
  })
})

describe('eligibleWeeks / refEfficiency / distribution', () => {
  it('counts weeks listed ACT/INA/RES on a team that has a REG game that week', () => {
    const weeks = { 1: [['KC', 'ACT']], 2: [['KC', 'RES']], 3: [['KC', 'CUT']], 4: [['KC', 'ACT']], 5: [['LAR', 'ACT']] }
    const tw = { KC: new Set([1, 2, 3]), LA: new Set([5]) }
    expect(eligibleWeeks(weeks, tw, 2024)).toBe(3)   // wk1, wk2, wk5 (LAR→LA); wk3 CUT, wk4 bye
  })
  it('counts a PUP week and does not count a DEV week', () => {
    const tw = { KC: new Set([1, 2]) }
    expect(eligibleWeeks({ 1: [['KC', 'PUP']] }, tw, 2024)).toBe(1)
    expect(eligibleWeeks({ 1: [['KC', 'DEV']], 2: [['KC', 'PUP']] }, tw, 2024)).toBe(1)
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

// ── V2.8 current-team reference (G1/G2) ─────────────────────────────────────
// KC current-team roster (playersMap.team = KC): r1, r2 (RB), w1, w2 (WR, w2 traded KC→BUF), w3 (gamesPlayed 0),
// plus w4 (WR, played for KC but playersMap.team = BUF). Gamelog components per player:
//   r1 carries 100 · r2 carries 50 · w3 carries 30, receptions 40, targets 60 (gp 0 → must stay out of the denominator)
//   w1 receptions 30, targets 50 · w2 KC game rec 10/tgt 12 + BUF game rec 10/tgt 12 · w4 (KC) rec 20, tgt 25
// The app rows are inflated on r1 (rush_att 110) and w1 (rec 36) so those shares land out of tolerance.
function v28Ctx() {
  const g = (week, team, f) => ({ week, seasonType: 'REG', team, carries: 0, targets: 0, receptions: 0, ...f })
  const row = (team, gp, stats) => ({ gamesPlayed: gp, team, stats, fantasyPoints: 0 })
  return {
    seasons: [2024],
    playersMap: {
      r1: { position: 'RB', team: 'KC' }, r2: { position: 'RB', team: 'KC' },
      w1: { position: 'WR', team: 'KC' }, w2: { position: 'WR', team: 'KC' },
      w3: { position: 'WR', team: 'KC' }, w4: { position: 'WR', team: 'BUF' },
    },
    careerStats: { 2024: {
      r1: row('KC', 17, { rush_att: 110 }), r2: row('KC', 17, { rush_att: 50 }),
      w1: row('KC', 17, { rec: 36, rec_tgt: 50 }), w2: row('KC', 17, { rec: 20, rec_tgt: 24 }),
      w3: row('KC', 0, { rec: 40, rec_tgt: 60, rush_att: 30 }), w4: row('KC', 17, { rec: 20, rec_tgt: 25 }),
    } },
    gamelogs: { 2024: { unmapped: 0, players: {
      r1: { games: [g(1, 'KC', { carries: 60 }), g(2, 'KC', { carries: 40 })] },
      r2: { games: [g(1, 'KC', { carries: 50 })] },
      w1: { games: [g(1, 'KC', { receptions: 30, targets: 50 })] },
      w2: { games: [g(1, 'KC', { receptions: 10, targets: 12 }), g(2, 'BUF', { receptions: 10, targets: 12 })] },
      w3: { games: [g(1, 'KC', { carries: 30, receptions: 40, targets: 60 })] },
      w4: { games: [g(1, 'KC', { receptions: 20, targets: 25 })] },
    } } },
    teamcontext: { 2024: { teams: {} } }, snaps: { 2024: { players: {} } }, rosterweekly: { 2024: { players: {} } },
  }
}

describe('runV2 V2.8 against current-team gamelog references', () => {
  const res = runV2(v28Ctx())
  const v28 = res.outOfTolerance.filter(r => r.check === 'V2.8')
  const by = Object.fromEntries(v28.map(r => [r.pid, r]))
  // KC reference denominators sum only gp ≥ 1 pids whose playersMap team is KC: carries 100 + 50 = 150,
  // receptions 30 + 20 = 50, targets 50 + 24 = 74. w3's carries 30 / receptions 40 / targets 60 are excluded
  // (they would give 100/180 = 0.556 and 30/90 = 0.333); w4 (playersMap BUF) is excluded too.
  it('excludes the gp-0 teammate and compares against current-team denominators', () => {
    // app KC totals: rush_att 110 + 50 = 160, rec 36 + 20 = 56 (w3 gp 0 and w4 BUF not counted)
    expect(by.r1).toMatchObject({ metric: 'carryShare', refTeam: 'KC' })
    expect(by.r1.app).toBeCloseTo(0.688, 9); expect(by.r1.ref).toBeCloseTo(0.667, 9)   // 110/160 vs 100/150
    expect(by.r2.app).toBeCloseTo(0.313, 9); expect(by.r2.ref).toBeCloseTo(0.333, 9)   // 50/160 vs 50/150
    expect(by.w1.app).toBeCloseTo(0.643, 9); expect(by.w1.ref).toBeCloseTo(0.6, 9)     // 36/56 vs 30/50
    expect(by.w3).toBeUndefined()
    expect(by.w4).toBeUndefined()   // BUF: 20/20 on both sides → in tolerance
  })
  it('compares the traded player in V2.8 and keeps him out of the G2 effect', () => {
    expect(by.w2.app).toBeCloseTo(0.357, 9); expect(by.w2.ref).toBeCloseTo(0.4, 9)     // 20/56 vs 20/50
    expect(res.series['V2.8|carryShare'].bySeason[2024]).toEqual({ compared: 2, out: 2 })
    expect(res.series['V2.8|receptionShare'].bySeason[2024]).toEqual({ compared: 3, out: 2 })
    expect(res.info.g2.filter(x => x.check === 'V2.8').map(x => x.pid)).toEqual(['w4'])
  })
  it('puts the non-traded player whose current team differs in V2.8-g2effect', () => {
    // w4: current-team BUF reference 20/20 = 1.0; true-season KC reference 20/100 (all KC gamelog receptions
    // 30 + 10 + 40 + 20) = 0.2 → effect 0.8
    const b = res.series['V2.8-g2effect|receptionShare'].bySeason[2024]
    expect(b.compared).toBe(1)
    expect(b.maxAbs).toBeCloseTo(0.8, 9)
    expect(res.series['V2.8-g2effect|carryShare']).toBeUndefined()
    expect(res.info.g2.find(x => x.check === 'V2.8').delta).toBeCloseTo(0.8, 9)
  })
  it('G1: reception share and target share share one current-team reference', () => {
    // w1: 30/50 = 0.6 reception vs 50/74 = 0.676 target; w2: 20/50 = 0.4 vs 24/74 = 0.324; w4: 1 and 1
    expect(res.info.g1.n).toBe(3)
    const w1 = res.info.g1.top.find(x => x.pid === 'w1')
    expect(w1.receptionShare).toBeCloseTo(0.6, 9)
    expect(w1.trueTargetShare).toBeCloseTo(0.676, 9)
    expect(w1.delta).toBeCloseTo(-0.076, 9)
    expect(res.info.g1.top.find(x => x.pid === 'w2').trueTargetShare).toBeCloseTo(0.324, 9)
    expect(res.info.g1.over0_05).toBe(2)
  })
})

// ── F2: games missed (V2.11 / V2.12) ────────────────────────────────────────
// KC plays REG weeks 1–4. Rosterweekly eligibility counts ACT/INA/RES/PUP weeks on a team with a game that week.
function f2Ctx() {
  const weeksOf = status => Object.fromEntries([1, 2, 3, 4].map(w => [w, [['KC', status]]]))
  return {
    seasons: [2024],
    playersMap: { n1: { position: 'WR', team: 'KC' }, d1: { position: 'WR', team: 'KC' }, neg1: { position: 'WR', team: 'KC' } },
    careerStats: { 2024: {
      // n1: no snaps entry; dnpWeeks 6 vs eligible 4 → delta +2
      n1: { gamesPlayed: 2, dnpWeeks: 6, weeklyStatus: [], team: 'KC', stats: {} },
      // d1: DEV weeks 1–2 (only week 1 marked D); snaps 2, eligible 2 → expected 0, delta 0
      d1: { gamesPlayed: 2, dnpWeeks: 0, weeklyStatus: ['D', 'P', 'P', 'P'], team: 'KC', stats: {} },
      // neg1: eligible 4, snaps 1 → expected 3; dnpWeeks 1 → delta -2
      neg1: { gamesPlayed: 1, dnpWeeks: 1, weeklyStatus: ['P', 'D', 'D', 'P'], team: 'KC', stats: { rec_tgt: 1, rec: 1 } },
    } },
    gamelogs: { 2024: { unmapped: 0, players: {
      neg1: { games: [{ week: 1, seasonType: 'REG', team: 'KC', targets: 1, receptions: 1 }] },
    } } },
    teamcontext: { 2024: { teams: { KC: { games: [1, 2, 3, 4].map(week => ({ week, seasonType: 'REG' })) } } } },
    snaps: { 2024: { players: { d1: { games: 2 }, neg1: { games: 1 } } } },
    rosterweekly: { 2024: { players: {
      n1: { ...weeksOf('ACT'), 5: [['KC', 'ACT']] },   // week 5: KC has no game → not eligible
      d1: { 1: [['KC', 'DEV']], 2: [['KC', 'DEV']], 3: [['KC', 'ACT']], 4: [['KC', 'ACT']] },
      neg1: weeksOf('ACT'),
    } } },
  }
}

describe('runV2 F2 games-missed behaviour', () => {
  const res = runV2(f2Ctx())
  it('compares a player with no snaps entry in V2.12 against snaps.games = 0, and not in V2.11', () => {
    const n1 = res.outOfTolerance.find(r => r.check === 'V2.12' && r.metric === 'dnpWeeks' && r.pid === 'n1')
    expect(n1).toMatchObject({ app: 6, ref: 4, delta: 2 })   // eligible weeks 1–4 = 4; week 5 has no KC game
    expect(res.outOfTolerance.some(r => r.check === 'V2.11' && r.pid === 'n1')).toBe(false)
    expect(res.series['V2.11|gamesPlayed'].bySeason[2024]).toEqual({ compared: 2, out: 0 })
    expect(res.series['V2.12|dnpWeeks'].bySeason[2024]).toEqual({ compared: 3, out: 2 })
  })
  it('reports DEV-week diagnostics exactly', () => {
    expect(res.info.dnpBySeason[2024]).toEqual({
      rowsWithDev: 1, devWeeks: 2, devWeeksMarkedD: 1, devToDRate: 0.5, positive: 1, negative: 1,
    })
  })
  it('lists the negative-delta row with its week-by-week evidence', () => {
    expect(res.info.dnpNegative).toEqual([{
      season: 2024, pid: 'neg1', position: 'WR', app: 1, ref: 3,
      weeks: [
        { w: 1, rosterStatus: 'ACT', team: 'KC', weeklyStatus: 'P', gamelogRow: true },
        { w: 2, rosterStatus: 'ACT', team: 'KC', weeklyStatus: 'D', gamelogRow: false },
        { w: 3, rosterStatus: 'ACT', team: 'KC', weeklyStatus: 'D', gamelogRow: false },
        { w: 4, rosterStatus: 'ACT', team: 'KC', weeklyStatus: 'P', gamelogRow: false },
      ],
    }])
  })
})
