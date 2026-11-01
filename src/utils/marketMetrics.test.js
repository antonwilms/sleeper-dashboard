import { describe, it, expect } from 'vitest'
import { MARKET_METRICS, METRIC_BY_ID, PER_GAME_TWIN, rankWindow } from './marketMetrics'
import { WINDOW_TOTAL_KEYS } from './marketWindowStats'

const mk = (pid, position, o = {}) => {
  const gp = o.gp ?? 17
  return {
    pid, position, gp,
    fp: o.fp ?? 100, fpPerG: (o.fp ?? 100) / gp,
    totals: { rec_tgt: 100, pass_att: 400, ...(o.totals ?? {}) },
    rates: { catchPct: 0.7, aDOT: 9, intRate: 0.02, ...(o.rates ?? {}) },
    usage: { snapPct: 0.8, ...(o.usage ?? {}) },
    basisGp: { catchPct: gp, intRate: gp, aDOT: gp, snapPct: gp, ...(o.basisGp ?? {}) },
  }
}
const M = list => new Map(list.map(w => [w.pid, w]))

describe('rankWindow', () => {
  it('competition ranking with ties', () => {
    const r = rankWindow(M([100, 90, 90, 80].map((t, i) => mk('w' + i, 'WR', { totals: { rec_tgt: t } }))))
    expect([0, 1, 2, 3].map(i => r['w' + i].tgt.rank)).toEqual([1, 2, 2, 4])
    expect(r.w0.tgt.of).toBe(4)
  })
  it('accepts a plain { [pid]: ws } object, identical to the Map result', () => {
    const list = [100, 90, 90, 80].map((t, i) => mk('w' + i, 'WR', { totals: { rec_tgt: t } }))
    const obj = Object.fromEntries(list.map(w => [w.pid, w]))
    expect(rankWindow(obj)).toEqual(rankWindow(M(list)))
    expect([0, 1, 2, 3].map(i => rankWindow(obj)['w' + i].tgt.rank)).toEqual([1, 2, 2, 4])
  })
  it('better low', () => {
    const r = rankWindow(M([mk('a', 'QB', { rates: { intRate: 0.01 } }), mk('b', 'QB', { rates: { intRate: 0.03 } })]))
    expect(r.a.intRate.rank).toBe(1)
    expect(r.b.intRate.rank).toBe(2)
  })
  it('gp floor uses window-wide max gp', () => {
    const r = rankWindow(M([mk('qb', 'QB', { gp: 17 }), mk('wr', 'WR', { gp: 8 }), mk('wr2', 'WR', { gp: 10 })]))
    expect(r.wr.catchPct).toBeNull()
    expect(r.wr.fpPerG).toBeNull()
    expect(r.wr.fp.rank).toBeGreaterThan(0)
    expect(r.wr2.catchPct).not.toBeNull()
  })
  it('minVolume', () => {
    const r = rankWindow(M([mk('wr', 'WR', { totals: { rec_tgt: 34 } }), mk('qb', 'QB', { totals: { pass_att: 170 } })]))
    expect(r.wr.catchPct).toBeNull()
    expect(r.qb.intRate).toBeNull()
  })
  it('basis floor', () => {
    const lo = rankWindow(M([mk('a', 'WR', { gp: 34, basisGp: { snapPct: 8 } })]))
    expect(lo.a.snapPct).toBeNull()
    expect(lo.a.tgtPerG).not.toBeNull()
    const hi = rankWindow(M([mk('a', 'WR', { gp: 34, basisGp: { snapPct: 20 } }), mk('b', 'WR', { gp: 17 })]))
    expect(hi.a.snapPct).not.toBeNull()
  })
  it('ranks within position', () => {
    const r = rankWindow(M([mk('rb', 'RB'), mk('wr', 'WR')]))
    expect(r.rb.tgt).toEqual({ rank: 1, of: 1 })
    expect(r.wr.tgt).toEqual({ rank: 1, of: 1 })
  })
  it('null for not-applicable or null value', () => {
    const r = rankWindow(M([mk('qb', 'QB'), mk('a', 'WR', { rates: { aDOT: null } }), mk('b', 'WR')]))
    expect(r.qb.tgt).toBeNull()
    expect(r.a.aDOT).toBeNull()
    expect(r.b.aDOT).toEqual({ rank: 1, of: 1 })
  })
})

describe('MARKET_METRICS registry', () => {
  it('shape', () => {
    const ids = MARKET_METRICS.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MARKET_METRICS) {
      expect(typeof m.label).toBe('string')
      expect(['total', 'perGame', 'rate']).toContain(m.kind)
      expect(['high', 'low']).toContain(m.better)
      expect(typeof m.value).toBe('function')
      expect(m.positions.every(p => ['QB', 'RB', 'WR', 'TE'].includes(p))).toBe(true)
      expect(m.format(null)).toBe('—')
      if (m.better === 'low') expect(m.kind).toBe('rate')
      if (m.minVolume) {
        expect(m.kind).toBe('rate')
        expect(WINDOW_TOTAL_KEYS).toContain(m.minVolume.stat)
      }
    }
  })
  it('basis pairs', () => {
    const byId = Object.fromEntries(MARKET_METRICS.map(m => [m.id, m]))
    const expected = ['cmpPct', 'ypa', 'passTdRate', 'intRate', 'sackRate', 'passerRating', 'passAdot', 'ypc', 'yacoPerAtt',
      'btklRate', 'catchPct', 'ypr', 'ypt', 'aDOT', 'dropRate', 'snapPct', 'tgtShare', 'carryShare', 'aySh', 'rzTgtShare', 'rzRushShare']
    for (const id of expected) expect(byId[id].basis).toBe(id)
    expect(MARKET_METRICS.filter(m => m.basis).map(m => m.id).sort()).toEqual([...expected].sort())
    expect(MARKET_METRICS.filter(m => m.kind === 'rate' && !m.adv).every(m => m.basis)).toBe(true)
    // an adv rate with a basis would read a missing basisGp → 0 games → never ranked
    expect(MARKET_METRICS.filter(m => m.adv).every(m => !m.basis)).toBe(true)
  })
  it('sum metrics null only when all addends null', () => {
    const scrim = MARKET_METRICS.find(m => m.id === 'scrimYd')
    expect(scrim.value({ totals: { rush_yd: null, rec_yd: null } })).toBeNull()
    expect(scrim.value({ totals: { rush_yd: 5, rec_yd: null } })).toBe(5)
  })
})

describe('rankWindow minGames (career floor)', () => {
  it('minGames replaces the half-max floor on per-game metrics; totals are never floored', () => {
    const pool = () => M([mk('a', 'WR', { gp: 40 }), mk('b', 'WR', { gp: 20 })])
    const dflt = rankWindow(pool())
    expect(dflt.a.fpPerG).not.toBeNull()
    expect(dflt.b.fpPerG).not.toBeNull()
    const floored = rankWindow(pool(), MARKET_METRICS, { minGames: 32 })
    expect(floored.a.fpPerG).not.toBeNull()
    expect(floored.b.fpPerG).toBeNull()
    expect(floored.b.fp).not.toBeNull()
    expect(floored.b.tgt).not.toBeNull()
  })
  it('minGames on a rate uses basisGp, not gp', () => {
    const r = rankWindow(M([mk('a', 'WR', { gp: 40, basisGp: { snapPct: 20 } })]), MARKET_METRICS, { minGames: 32 })
    expect(r.a.snapPct).toBeNull()
    expect(r.a.fpPerG).not.toBeNull()
  })
})

describe('per-game twins', () => {
  it('every total has a twin, a perGame metric with identical positions', () => {
    for (const m of MARKET_METRICS.filter(x => x.kind === 'total' && !x.adv)) {
      const twinId = PER_GAME_TWIN[m.id]
      expect(twinId, m.id).toBeTruthy()
      const twin = METRIC_BY_ID[twinId]
      expect(twin.kind).toBe('perGame')
      expect([...twin.positions].sort()).toEqual([...m.positions].sort())
    }
  })
  it('METRIC_BY_ID matches the registry', () => {
    for (const m of MARKET_METRICS) expect(METRIC_BY_ID[m.id]).toBe(m)
  })
  it('each new per-game metric is total / gp, and null when the total is null', () => {
    const ws = {
      gp: 10, totals: { pass_td: 20, rush_att: 50, rush_td: 5, rec: 70, rec_td: 3, rush_fd: 4, rec_fd: 6 },
    }
    const nul = { gp: 10, totals: { pass_td: null, rush_att: null, rush_td: null, rec: null, rec_td: null, rush_fd: null, rec_fd: null } }
    const expected = { passTdPerG: 2, rushAttPerG: 5, rushTdPerG: 0.5, recPerG: 7, recTdPerG: 0.3, totalTdPerG: 2.8, firstDownsPerG: 1 }
    for (const [id, v] of Object.entries(expected)) {
      expect(METRIC_BY_ID[id].value(ws), id).toBeCloseTo(v, 10)
      expect(METRIC_BY_ID[id].value(nul), id).toBeNull()
    }
  })
  it('rushYdPerG ranks WR like rushYd', () => {
    expect(METRIC_BY_ID.rushYdPerG.positions).toEqual(['QB', 'RB', 'WR'])
  })
})

describe('advanced metrics (ws.adv)', () => {
  const ADV = [
    ['epaPerAtt', 'QB'], ['cpoe', 'QB'], ['rushEpaTotal', 'QB'], ['rushEpaPerAtt', 'RB'], ['epaPerTgt', 'WR'], ['racr', 'WR'],
  ]
  it('each reads ws.adv: null without it, ranked 1 of 1 for a single eligible ws', () => {
    for (const [id, pos] of ADV) {
      const bare = mk('a', pos, { totals: { rush_att: 200 } })
      expect(METRIC_BY_ID[id].value(bare), id).toBeNull()
      expect(rankWindow(M([bare]))['a'][id], id).toBeNull()
      const withAdv = { ...bare, adv: { [id]: 0.5 } }
      expect(METRIC_BY_ID[id].value(withAdv), id).toBe(0.5)
      expect(rankWindow(M([withAdv]))['a'][id], id).toEqual({ rank: 1, of: 1 })
    }
  })
  it('a "—" adv value is unranked while a sibling with a value is ranked', () => {
    const a = { ...mk('a', 'WR'), adv: { epaPerTgt: 0.2 } }
    const b = { ...mk('b', 'WR'), adv: { epaPerTgt: null } }
    const r = rankWindow(M([a, b]))
    expect(r.a.epaPerTgt).toEqual({ rank: 1, of: 1 })
    expect(r.b.epaPerTgt).toBeNull()
  })
  it('epaPerTgt respects minVolume: a 2 tgt/G receiver with a value is unranked', () => {
    const low = { ...mk('low', 'WR', { totals: { rec_tgt: 34 } }), adv: { epaPerTgt: 0.4 } }   // 2 tgt/G
    const ok = { ...mk('ok', 'WR', { totals: { rec_tgt: 100 } }), adv: { epaPerTgt: 0.1 } }
    const r = rankWindow(M([low, ok]))
    expect(r.low.epaPerTgt).toBeNull()
    expect(r.ok.epaPerTgt).toEqual({ rank: 1, of: 1 })
  })
  it('formats: signed CPOE, 2-dec EPA, 1-dec Rush EPA total', () => {
    expect(METRIC_BY_ID.cpoe.format(2.34)).toBe('+2.3')
    expect(METRIC_BY_ID.cpoe.format(-1.26)).toBe('-1.3')
    expect(METRIC_BY_ID.epaPerAtt.format(0.123)).toBe('0.12')
    expect(METRIC_BY_ID.rushEpaTotal.format(12.34)).toBe('12.3')
  })
})
