import { describe, it, expect } from 'vitest'
import {
  REG_SEASON_TEAM_GAMES, dpCode, iqCode, priorPPG, incPPG, pUpOf, pStayOf, expectedStarts, buildPreseasonQbShares,
} from '../utils/qbTakeover'

// P6b Stage A — the chain port against golden values generated read-only from data lib/qbTakeover.mjs
// (expectedStarts + predict, the pinned hazard/stickiness objects) at data c3f16f8; perGame to 6 dp, compared at 1e-6.
// stickCodes in the data script were { st, dg3: 0, rk, dq: 3 }; the pinned stickiness uses 'st' alone, so the rest is ignored.

const GOLDEN = {
  G1: {
    start: { role: 'B', ps: 0, c: 0, g: 1 }, hz: { dp: 0, og: 0, rk: 0, iq: 0 }, remaining: 17,
    pUp: 0.053131, expected: 2.648596, fraction: 0.155800,
    perGame: [0.053131, 0.086827, 0.109709, 0.125242, 0.138224, 0.148983, 0.157867, 0.165192, 0.171234, 0.176217, 0.180327, 0.183717, 0.186513, 0.188819, 0.190721, 0.192289, 0.193583],
  },
  G2: {
    start: { role: 'B', ps: 0, c: 0, g: 1 }, hz: { dp: 0, og: 0, rk: 1, iq: 0 }, remaining: 17,
    pUp: 0.085849, expected: 3.948185, fraction: 0.232246,
    perGame: [0.085849, 0.137487, 0.170989, 0.192710, 0.210732, 0.225423, 0.237315, 0.246917, 0.254673, 0.260940, 0.266004, 0.270095, 0.273400, 0.276071, 0.278228, 0.279972, 0.281380],
  },
  G3: {
    start: { role: 'B', ps: 0, c: 0, g: 1 }, hz: { dp: 0, og: 0, rk: 1, iq: 1 }, remaining: 17,
    pUp: 0.152710, expected: 6.048543, fraction: 0.355797,
    perGame: [0.152710, 0.234353, 0.282347, 0.310508, 0.334040, 0.352689, 0.367210, 0.378456, 0.387191, 0.393978, 0.399251, 0.403349, 0.406532, 0.409005, 0.410926, 0.412419, 0.413579],
  },
  G4: {
    start: { role: 'B', ps: 0, c: 0, g: 1 }, hz: { dp: 2, og: 0, rk: 0, iq: 2 }, remaining: 17,
    pUp: 0.011390, expected: 0.634499, fraction: 0.037323,
    perGame: [0.011390, 0.019088, 0.024616, 0.028586, 0.031958, 0.034820, 0.037246, 0.039304, 0.041048, 0.042527, 0.043781, 0.044844, 0.045745, 0.046510, 0.047157, 0.047707, 0.048172],
  },
  G5: {
    start: { role: 'B', ps: 0, c: 0, g: 1 }, hz: { dp: 0, og: 0, rk: 0, iq: 3 }, remaining: 17,
    pUp: 0.060194, expected: 2.947575, fraction: 0.173387,
    perGame: [0.060194, 0.097944, 0.123332, 0.140398, 0.154633, 0.166386, 0.176048, 0.183979, 0.190491, 0.195837, 0.200227, 0.203831, 0.206790, 0.209220, 0.211214, 0.212852, 0.214197],
  },
  L1: {
    start: { role: 'B', ps: 1, c: 0, g: 5 }, hz: { dp: 1, og: 1, rk: 0, iq: 0 }, remaining: 13,
    pUp: 0.227391, expected: 5.728915, fraction: 0.440686,
    perGame: [0.227391, 0.331979, 0.386554, 0.414898, 0.440056, 0.459477, 0.473949, 0.484662, 0.492670, 0.498662, 0.503141, 0.506487, 0.508988],
  },
  L2: {
    start: { role: 'S', ps: 1, c: 3, s: 2, g: 8 }, hz: { dp: 0, og: 0, rk: 1, iq: 0 }, remaining: 10,
    pUp: 0.085849, expected: 4.532445, fraction: 0.453244,
    perGame: [0.728732, 0.554339, 0.508014, 0.467895, 0.433637, 0.405444, 0.382736, 0.364408, 0.349602, 0.337638],
  },
  L3: {
    start: { role: 'S', ps: 1, c: 0, s: 4, g: 12 }, hz: { dp: 0, og: 0, rk: 0, iq: 0 }, remaining: 6,
    pUp: 0.053131, expected: 3.750443, fraction: 0.625074,
    perGame: [0.854433, 0.737790, 0.643031, 0.565397, 0.501325, 0.448469],
  },
  L4: {
    start: { role: 'B', ps: 0, c: 9, g: 10 }, hz: { dp: 0, og: 0, rk: 0, iq: 1 }, remaining: 8,
    pUp: 0.097220, expected: 1.675769, fraction: 0.209471,
    perGame: [0.097220, 0.154592, 0.191213, 0.214572, 0.233930, 0.249628, 0.262248, 0.272366],
  },
}
const PSTAY = [0.687337, 0.728732, 0.854433]   // by st: s1, s2, s3

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol
const runCase = g => expectedStarts({
  start: { stickCodes: { dq: 3 }, ...g.start, hazardCodes: g.hz },
  remaining: g.remaining,
})

describe('expectedStarts — golden chain (data lib, pinned models)', () => {
  for (const [name, g] of Object.entries(GOLDEN)) {
    it(`${name}: perGame / expected / fraction match the data library to 1e-6`, () => {
      const r = runCase(g)
      expect(r.perGame).toHaveLength(g.remaining)
      r.perGame.forEach((v, i) => expect(near(v, g.perGame[i]), `${name} perGame[${i}] ${v} vs ${g.perGame[i]}`).toBe(true))
      expect(near(r.expected, g.expected)).toBe(true)
      expect(near(r.fraction, g.fraction)).toBe(true)
      expect(near(pUpOf(g.hz), g.pUp)).toBe(true)
    })
  }

  it('pStay by streak bucket matches the pinned stickiness', () => {
    PSTAY.forEach((p, st) => expect(near(pStayOf({ st }), p)).toBe(true))
  })
})

describe('pUpOf / pStayOf — pinned features only', () => {
  it('throws when a pinned feature code is missing, out of range or not an integer', () => {
    expect(() => pUpOf({ dp: 0, og: 0, rk: 0 })).toThrow(/iq/)
    expect(() => pUpOf({ dp: 3, og: 0, rk: 0, iq: 0 })).toThrow(/dp/)
    expect(() => pUpOf({ dp: 0, og: 0, rk: 0, iq: 1.5 })).toThrow(/iq/)
    expect(() => pStayOf({})).toThrow(/st/)
    expect(() => pStayOf({ st: 3 })).toThrow(/st/)
  })

  it('ignores unused keys (ps, bn, wk, …)', () => {
    const base = pUpOf({ dp: 0, og: 0, rk: 0, iq: 0 })
    expect(pUpOf({ dp: 0, og: 0, rk: 0, iq: 0, ps: 1, bn: 2, wk: 2, dg: 4 })).toBe(base)
  })
})

describe('code helpers', () => {
  it('dpCode: order 1 → d1 (1), 2 → d2 (0), anything else (null, 3+) → d3 (2)', () => {
    expect([dpCode(1), dpCode(2), dpCode(3), dpCode(null), dpCode(undefined), dpCode(7)]).toEqual([1, 0, 2, 2, 2, 2])
  })

  it('iqCode: unknown without a prior or median, weak < 0.85, strong > 1.10, mid at the cuts', () => {
    expect([iqCode(null, 20), iqCode(10, null), iqCode(10, 0), iqCode(10, -1)]).toEqual([3, 3, 3, 3])
    expect([iqCode(16.9, 20), iqCode(17, 20), iqCode(22, 20), iqCode(22.1, 20)]).toEqual([1, 0, 0, 2])
  })

  it('priorPPG needs gp ≥ 4 and finite points; incPPG shrinks at k = 3 and needs 2 obs without a prior', () => {
    expect(priorPPG({ gamesPlayed: 3, fantasyPoints: 90 })).toBeNull()
    expect(priorPPG({ gamesPlayed: 4, fantasyPoints: NaN })).toBeNull()
    expect(priorPPG(undefined)).toBeNull()
    expect(priorPPG({ gamesPlayed: 10, fantasyPoints: 150 })).toBe(15)
    expect(incPPG(15, [])).toBe(15)
    expect(incPPG(15, [9, 9, 9])).toBe((15 * 3 + 27) / 6)
    expect(incPPG(null, [10])).toBeNull()
    expect(incPPG(null, [10, 20])).toBe(15)
  })
})

describe('buildPreseasonQbShares — the g = 1 rule', () => {
  const qb = (team, order, extra = {}) => ({ position: 'QB', team, depth_chart_order: order, years_exp: 5, ...extra })
  const playerMap = {
    // A — incumbent prior 20 ppg; the league median is 20 → mid
    a10: qb('A', 1), a20: qb('A', 2), a30: qb('A', null), a40: qb('A', 2, { years_exp: 0 }),
    // B — incumbent prior 10 ppg → weak; a second order-1 QB (b09) sorts after the smaller id b05
    b09: qb('B', 1), b05: qb('B', 1), b20: qb('B', 2, { years_exp: 0 }),
    // D — a bare incumbent
    d10: qb('D', 1),
    // E — incumbent prior 30 ppg → strong; the backup is unlisted
    e10: qb('E', 1), e20: qb('E', null),
    // F — incumbent has only 2 games → no prior → unknown
    f10: qb('F', 1), f20: qb('F', 2),
    // C — nobody at order 1
    c10: qb('C', 2), c20: qb('C', null),
    // no team
    fa1: qb('FA', 1), nt1: qb(null, 2),
    // not a QB: ignored
    rb1: { position: 'RB', team: 'A', depth_chart_order: 1, years_exp: 3 },
  }
  const careerStats = { 2025: {
    a10: { gamesPlayed: 17, fantasyPoints: 340 }, b05: { gamesPlayed: 10, fantasyPoints: 100 }, b09: { gamesPlayed: 17, fantasyPoints: 900 },
    d10: { gamesPlayed: 10, fantasyPoints: 200 }, e10: { gamesPlayed: 10, fantasyPoints: 300 }, f10: { gamesPlayed: 2, fantasyPoints: 60 },
  } }
  const out = buildPreseasonQbShares({ playerMap, careerStats, dataSeason: 2025 })
  const shareOf = codes => expectedStarts({
    start: { role: 'B', ps: 0, c: 0, g: 1, hazardCodes: codes, stickCodes: {} }, remaining: REG_SEASON_TEAM_GAMES,
  }).fraction

  it('classifies incumbent / backup / no-team / no-chart, and skips non-QBs', () => {
    expect(out.a10.role).toBe('incumbent')
    expect(out.a20.role).toBe('backup')
    expect(out.c10.role).toBe('no-chart')
    expect(out.c20.role).toBe('no-chart')
    expect(out.fa1.role).toBe('no-team')
    expect(out.nt1.role).toBe('no-team')
    expect(out.rb1).toBeUndefined()
    expect(out.a10.incumbentId).toBe('a10')
    expect(out.a20.incumbentId).toBe('a10')
  })

  it('two order-1 QBs: the smaller id is the incumbent, the other is a d1 backup', () => {
    expect(out.b05.role).toBe('incumbent')
    expect(out.b09.role).toBe('backup')
    expect(out.b09.codes.dp).toBe(1)
    expect(out.b09.incumbentId).toBe('b05')
  })

  it('an unlisted QB on a charted team is d3; a rookie (years_exp 0) is rk 1', () => {
    expect(out.a30.codes.dp).toBe(2)
    expect(out.a40.codes.rk).toBe(1)
    expect(out.a20.codes.rk).toBe(0)
  })

  it('iq reads the incumbent prior against the hand median (non-null priors: 20, 10, 20, 30 → 20)', () => {
    expect(out.a20.codes.iq).toBe(0)   // 20 / 20 = 1.00 → mid
    expect(out.b20.codes.iq).toBe(1)   // 10 / 20 = 0.50 → weak
    expect(out.e20.codes.iq).toBe(2)   // 30 / 20 = 1.50 → strong
    expect(out.f20.codes.iq).toBe(3)   // gp 2 → no prior → unknown
  })

  it('a backup carries codes, pUp, share (= the chain fraction), a 17-number perGame and games', () => {
    const b = out.a20
    expect(b.codes).toEqual({ dp: 0, og: 0, rk: 0, iq: 0 })
    expect(b.pUp).toBe(pUpOf(b.codes))
    expect(b.games).toBe(17)
    expect(b.perGame).toHaveLength(17)
    expect(b.share).toBeCloseTo(b.perGame.reduce((a, c) => a + c, 0) / 17, 12)
  })

  it('a backup share equals the golden case with the same codes', () => {
    expect(near(out.a20.share, GOLDEN.G1.fraction)).toBe(true)   // d2 vet mid
    expect(near(out.a40.share, GOLDEN.G2.fraction)).toBe(true)   // d2 rookie mid
    expect(near(out.b20.share, GOLDEN.G3.fraction)).toBe(true)   // d2 rookie weak
    expect(near(out.e20.share, GOLDEN.G4.fraction)).toBe(true)   // d3 vet strong
    expect(near(out.f20.share, GOLDEN.G5.fraction)).toBe(true)   // d2 vet unknown
    expect(out.b09.share).toBe(shareOf({ dp: 1, og: 0, rk: 0, iq: 1 }))
    expect(out.a30.share).toBe(shareOf({ dp: 2, og: 0, rk: 0, iq: 0 }))
  })

  it('reads no live-season input: only careerStats[dataSeason] moves the shares', () => {
    const withLive = { ...careerStats, 2026: { a10: { gamesPlayed: 3, fantasyPoints: 3 }, b05: { gamesPlayed: 3, fantasyPoints: 99 } } }
    expect(buildPreseasonQbShares({ playerMap, careerStats: withLive, dataSeason: 2025 })).toEqual(out)
  })

  it('degrades without a playerMap or a season row', () => {
    expect(buildPreseasonQbShares({ playerMap: {}, careerStats, dataSeason: 2025 })).toEqual({})
    const none = buildPreseasonQbShares({ playerMap, careerStats: {}, dataSeason: 2025 })
    expect(none.a20.codes.iq).toBe(3)   // no priors at all → no median → unknown
  })
})
