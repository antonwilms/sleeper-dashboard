import { describe, it, expect } from 'vitest'
import { MARKET_METRICS, rankWindow } from './marketMetrics'
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
    expect(MARKET_METRICS.filter(m => m.kind === 'rate').every(m => m.basis)).toBe(true)
  })
  it('sum metrics null only when all addends null', () => {
    const scrim = MARKET_METRICS.find(m => m.id === 'scrimYd')
    expect(scrim.value({ totals: { rush_yd: null, rec_yd: null } })).toBeNull()
    expect(scrim.value({ totals: { rush_yd: 5, rec_yd: null } })).toBe(5)
  })
})
